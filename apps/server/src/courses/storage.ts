/**
 * File-upload storage for course content (#27/#30) and grading media (#28).
 *
 * Production path: native `Bun.S3Client` (MinIO-compatible, EU self-host) issuing
 * a **presigned direct PUT** so the browser uploads straight to object storage,
 * with a server-side type/size allow-list and an `s3.stat()` re-verify after the
 * client reports completion (see `docs/decisions/tooling.md`).
 *
 * Local-dev fallback: when no S3 env is configured, we don't have object storage
 * and we can't add a raw HTTP route (`apps/server/src/index.ts` is owned by the
 * foundation). So in dev the browser sends the file bytes (base64) through the
 * `courses.uploadLocal` oRPC procedure, which calls `writeLocalUpload`; the bytes
 * land under a local `uploads/` directory and `statUpload` reads the size from
 * disk. File viewing in dev goes through the `courses.getFile` procedure (data
 * URL). In prod the presigned PUT + public S3 URL are used directly.
 *
 * Either way the rest of the app only ever stores an opaque `storageKey` string on
 * the row (e.g. `content_block.fileStorageKey`), so swapping S3 in for prod needs
 * no schema or call-site change.
 */
import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

/** Server-side allow-list for course file uploads (#30). */
export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
	"application/pdf": "pdf",
	"application/vnd.openxmlformats-officedocument.presentationml.presentation":
		"pptx",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document":
		"docx",
	"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
	"application/msword": "doc",
	"application/vnd.ms-powerpoint": "ppt",
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	// Voice/video feedback note for grading (#28).
	"audio/webm": "webm",
	"audio/mpeg": "mp3",
	"video/webm": "video.webm",
	"video/mp4": "mp4",
};

/** 50 MB hard cap on a single upload. */
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const S3_BUCKET = process.env.S3_BUCKET;
const S3_ENDPOINT = process.env.S3_ENDPOINT;
const S3_ACCESS_KEY_ID = process.env.S3_ACCESS_KEY_ID;
const S3_SECRET_ACCESS_KEY = process.env.S3_SECRET_ACCESS_KEY;

/** True when real object storage is configured (prod / MinIO). */
export function hasS3(): boolean {
	return Boolean(
		S3_BUCKET && S3_ENDPOINT && S3_ACCESS_KEY_ID && S3_SECRET_ACCESS_KEY,
	);
}

/** Local fallback dir; resolved relative to the server package cwd. */
const LOCAL_UPLOAD_DIR = resolve(process.cwd(), "uploads");

/** Allowed key scopes (the leading path segment). */
const KEY_SCOPES = ["bestand", "submission", "feedback"] as const;

/**
 * A storage key must be exactly `<scope>/<uuid>-<safe-filename>` as produced by
 * `makeStorageKey`. This rejects path traversal (`..`), absolute paths, NUL
 * bytes and any extra path segments before the value is ever joined onto the
 * upload dir or handed to S3. (C2)
 */
const STORAGE_KEY_RE = new RegExp(
	`^(?:${KEY_SCOPES.join("|")})\\/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}-[a-z0-9.\\-_]+$`,
);

/** Throw on any client-supplied key that isn't a well-formed upload key. (C2) */
export function assertValidStorageKey(key: string): void {
	if (
		typeof key !== "string" ||
		key.length === 0 ||
		key.length > 256 ||
		key.includes("\0") ||
		key.includes("..") ||
		key.startsWith("/") ||
		!STORAGE_KEY_RE.test(key)
	) {
		throw new Error("Ongeldige opslagsleutel");
	}
}

/**
 * Resolve a validated key under the local upload dir and assert it stays inside
 * it — defence in depth on top of `assertValidStorageKey`. (C2)
 */
function resolveLocalPath(storageKey: string): string {
	assertValidStorageKey(storageKey);
	const path = resolve(LOCAL_UPLOAD_DIR, storageKey);
	if (path !== LOCAL_UPLOAD_DIR && !path.startsWith(LOCAL_UPLOAD_DIR + sep)) {
		throw new Error("Pad buiten de uploadmap");
	}
	return path;
}

/** A sanitized, collision-resistant storage key for a new upload. */
export function makeStorageKey(prefix: string, filename: string): string {
	const safe = filename
		.toLowerCase()
		.replace(/[^a-z0-9.\-_]+/g, "-")
		.replace(/^-+|-+$/g, "")
		.slice(-80);
	return `${prefix}/${crypto.randomUUID()}-${safe || "bestand"}`;
}

/**
 * Magic-byte sniff of an uploaded buffer, returning the server-derived MIME
 * type, or `null` when the bytes don't match a known/allowed signature. Used to
 * reject a file whose real content doesn't match the client-claimed type. (H1)
 *
 * Office formats (docx/pptx/xlsx) are ZIP containers, so they share the `PK`
 * signature with each other; we accept the ZIP family and trust the
 * (allow-listed) declared OOXML subtype for those. Plain legacy `.doc/.ppt`
 * (OLE2) start with the D0CF11E0 signature.
 */
export function sniffContentType(bytes: Uint8Array): string | null {
	const b = bytes;
	const starts = (sig: number[], offset = 0) =>
		sig.every((v, i) => b[offset + i] === v);
	const b1 = b[1] ?? 0;

	if (starts([0x25, 0x50, 0x44, 0x46])) return "application/pdf"; // %PDF
	if (starts([0x89, 0x50, 0x4e, 0x47])) return "image/png"; // .PNG
	if (starts([0xff, 0xd8, 0xff])) return "image/jpeg"; // JPEG SOI
	// WEBP: RIFF....WEBP
	if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8))
		return "image/webp";
	// EBML (webm/mkv): 1A 45 DF A3
	if (starts([0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm"; // also video/webm
	if (starts([0x49, 0x44, 0x33]) || (b[0] === 0xff && (b1 & 0xe0) === 0xe0))
		return "audio/mpeg"; // ID3 or MPEG frame sync
	// MP4/MOV: ....ftyp at offset 4
	if (starts([0x66, 0x74, 0x79, 0x70], 4)) return "video/mp4";
	// ZIP container (docx/pptx/xlsx and any zip): PK\x03\x04 / PK\x05\x06
	if (b[0] === 0x50 && b1 === 0x4b) return "application/zip";
	// OLE2 compound file (legacy .doc/.ppt/.xls).
	if (starts([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))
		return "application/x-ole-storage";
	return null;
}

/**
 * Verify uploaded bytes against the client-claimed (allow-listed) content type
 * by sniffing magic bytes. Returns true when consistent. ZIP-based OOXML and
 * legacy OLE2 Office types are matched by container family. (H1)
 */
export function contentMatchesBytes(
	claimedType: string,
	bytes: Uint8Array,
): boolean {
	const sniffed = sniffContentType(bytes);
	if (!sniffed) return false;
	if (sniffed === claimedType) return true;
	// webm container is shared by audio/webm and video/webm.
	if (sniffed === "audio/webm" && claimedType === "video/webm") return true;
	// OOXML docx/pptx/xlsx are ZIP containers.
	const ooxml = new Set([
		"application/vnd.openxmlformats-officedocument.presentationml.presentation",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
	]);
	if (sniffed === "application/zip" && ooxml.has(claimedType)) return true;
	// Legacy OLE2 .doc/.ppt.
	const ole2 = new Set([
		"application/msword",
		"application/vnd.ms-powerpoint",
	]);
	if (sniffed === "application/x-ole-storage" && ole2.has(claimedType))
		return true;
	return false;
}

export interface PresignResult {
	/** The opaque key the caller persists on the row. */
	storageKey: string;
	/** Where the browser PUTs the bytes (S3 presigned, or our local route). */
	uploadUrl: string;
	/** Whether this is the local-dev fallback (caller may show a notice). */
	local: boolean;
}

/**
 * Presign a direct PUT. With S3 configured we use `Bun.S3Client.presign`; in
 * local dev we return a URL pointing at our own `/uploads/{key}` PUT route.
 */
export async function presignPut(
	storageKey: string,
	contentType: string,
): Promise<PresignResult> {
	if (hasS3()) {
		// Bun ships an S3 client globally. Typed loosely to avoid a hard dep on
		// Bun's ambient types in `tsc` here.
		const BunS3 = (
			globalThis as unknown as {
				Bun?: {
					S3Client: new (opts: Record<string, unknown>) => {
						presign: (
							key: string,
							opts: Record<string, unknown>,
						) => string;
					};
				};
			}
		).Bun?.S3Client;
		if (BunS3) {
			const client = new BunS3({
				bucket: S3_BUCKET,
				endpoint: S3_ENDPOINT,
				accessKeyId: S3_ACCESS_KEY_ID,
				secretAccessKey: S3_SECRET_ACCESS_KEY,
			});
			const uploadUrl = client.presign(storageKey, {
				method: "PUT",
				expiresIn: 600,
				type: contentType,
			});
			return { storageKey, uploadUrl, local: false };
		}
	}
	// Local-dev fallback: PUT straight back to this server.
	return {
		storageKey,
		uploadUrl: `/uploads/${storageKey}`,
		local: true,
	};
}

/** Persist bytes for the local-dev fallback upload. */
export async function writeLocalUpload(
	storageKey: string,
	bytes: Uint8Array,
): Promise<void> {
	const path = resolveLocalPath(storageKey);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, bytes);
}

/** Read bytes back for the local-dev `getFile` procedure (data URL). */
export async function readLocalUpload(storageKey: string): Promise<Buffer> {
	const path = resolveLocalPath(storageKey);
	return readFile(path);
}

/** Read back the size of a stored object to re-verify after upload (#30). */
export async function statUpload(storageKey: string): Promise<{ size: number }> {
	assertValidStorageKey(storageKey);
	if (hasS3()) {
		const BunS3 = (
			globalThis as unknown as {
				Bun?: {
					S3Client: new (opts: Record<string, unknown>) => {
						stat: (key: string) => Promise<{ size: number }>;
					};
				};
			}
		).Bun?.S3Client;
		if (BunS3) {
			const client = new BunS3({
				bucket: S3_BUCKET,
				endpoint: S3_ENDPOINT,
				accessKeyId: S3_ACCESS_KEY_ID,
				secretAccessKey: S3_SECRET_ACCESS_KEY,
			});
			return client.stat(storageKey);
		}
	}
	const path = resolveLocalPath(storageKey);
	const s = await stat(path);
	return { size: s.size };
}

/**
 * Delete a stored object (S3 when configured, else the local file). Validates
 * the key first. Used for AVG right-to-erasure (audio recordings, #H4) — the
 * data agent calls this. Best-effort: a missing local file is ignored.
 */
export async function deleteObject(storageKey: string): Promise<void> {
	assertValidStorageKey(storageKey);
	if (hasS3()) {
		const BunS3 = (
			globalThis as unknown as {
				Bun?: {
					S3Client: new (opts: Record<string, unknown>) => {
						delete: (key: string) => Promise<void>;
					};
				};
			}
		).Bun?.S3Client;
		if (BunS3) {
			const client = new BunS3({
				bucket: S3_BUCKET,
				endpoint: S3_ENDPOINT,
				accessKeyId: S3_ACCESS_KEY_ID,
				secretAccessKey: S3_SECRET_ACCESS_KEY,
			});
			await client.delete(storageKey);
			return;
		}
	}
	const path = resolveLocalPath(storageKey);
	try {
		await unlink(path);
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
	}
}

/**
 * A browser-facing URL/marker to view/download a stored object (#30 player/link).
 * In prod this is a real S3 public URL; in local-dev it's a `local:<key>` marker
 * the frontend resolves to a data URL via the `courses.getFile` procedure.
 */
export function publicUrl(storageKey: string): string {
	if (hasS3() && process.env.S3_PUBLIC_BASE_URL) {
		return `${process.env.S3_PUBLIC_BASE_URL.replace(/\/$/, "")}/${storageKey}`;
	}
	return `local:${storageKey}`;
}

/**
 * Issue a SHORT-LIVED presigned GET for a stored object (prod / S3). Used by an
 * AUTHORIZED `getFile` so pupil media is never served from a permanent public
 * URL. Falls back to `local:<key>` when S3 isn't configured. (C2)
 */
export function presignedGetUrl(storageKey: string, expiresIn = 300): string {
	assertValidStorageKey(storageKey);
	if (hasS3()) {
		const BunS3 = (
			globalThis as unknown as {
				Bun?: {
					S3Client: new (opts: Record<string, unknown>) => {
						presign: (key: string, opts: Record<string, unknown>) => string;
					};
				};
			}
		).Bun?.S3Client;
		if (BunS3) {
			const client = new BunS3({
				bucket: S3_BUCKET,
				endpoint: S3_ENDPOINT,
				accessKeyId: S3_ACCESS_KEY_ID,
				secretAccessKey: S3_SECRET_ACCESS_KEY,
			});
			return client.presign(storageKey, { method: "GET", expiresIn });
		}
	}
	return `local:${storageKey}`;
}

/** Best-effort MIME type from a stored key's extension (local-dev getFile). */
export function guessContentType(storageKey: string): string {
	const ext = storageKey.split(".").pop()?.toLowerCase() ?? "";
	const map: Record<string, string> = {
		pdf: "application/pdf",
		png: "image/png",
		jpg: "image/jpeg",
		jpeg: "image/jpeg",
		webp: "image/webp",
		webm: "audio/webm",
		mp3: "audio/mpeg",
		mp4: "video/mp4",
		docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
		pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
	};
	return map[ext] ?? "application/octet-stream";
}

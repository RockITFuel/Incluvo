import { client } from "../../lib/orpc";

/**
 * Upload a file for course content (#30), an assignment submission (#27) or a
 * grading note (#28), returning the opaque storageKey to persist.
 *
 * Prod path: ask the server for a presigned PUT and upload the bytes straight to
 * S3/MinIO, then confirm so the server `stat()`-verifies the size. Local-dev
 * fallback (no S3): `presignUpload` returns `local: true`, so we base64 the bytes
 * and send them through the `courses.uploadLocal` procedure instead.
 */
export async function uploadFile(
	file: File,
	scope: "bestand" | "submission" | "feedback",
): Promise<string> {
	const presign = await client.courses.presignUpload({
		filename: file.name,
		contentType: file.type || "application/octet-stream",
		scope,
	});

	if (presign.local) {
		const data = await fileToBase64(file);
		const res = await client.courses.uploadLocal({
			filename: file.name,
			contentType: file.type || "application/octet-stream",
			scope,
			data,
		});
		return res.storageKey;
	}

	// Prod: direct PUT to object storage, then confirm.
	const put = await fetch(presign.uploadUrl, {
		method: "PUT",
		headers: { "content-type": file.type || "application/octet-stream" },
		body: file,
	});
	if (!put.ok) throw new Error("Upload mislukt");
	await client.courses.confirmUpload({ storageKey: presign.storageKey });
	return presign.storageKey;
}

/** Read a File into a bare base64 string (no data: prefix). */
function fileToBase64(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onerror = () => reject(reader.error);
		reader.onload = () => {
			const result = String(reader.result);
			const comma = result.indexOf(",");
			resolve(comma >= 0 ? result.slice(comma + 1) : result);
		};
		reader.readAsDataURL(file);
	});
}

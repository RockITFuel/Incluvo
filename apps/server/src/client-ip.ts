/**
 * Make `cf-connecting-ip` trustworthy for the auth rate limiter (FIX-PLAN 1.2,
 * open point). Production runs Cloudflare → Traefik → this server, but the
 * origin is also reachable directly; there anyone can send their own
 * `cf-connecting-ip` and get a fresh rate-limit bucket per request.
 *
 * Traefik overwrites `x-real-ip` with the address that actually connected to
 * it. When that address is Cloudflare's, `cf-connecting-ip` is genuine; when it
 * is any other public address, the request bypassed Cloudflare and we use the
 * connecting address instead. Without a usable `x-real-ip` (local dev, a
 * private hop) nothing changes, so a missing header can never collapse every
 * user into one bucket.
 */
import { BlockList, isIP } from "node:net";

/** https://www.cloudflare.com/ips/ (checked 2026-10-01). */
const CLOUDFLARE_RANGES: [string, number][] = [
	["173.245.48.0", 20],
	["103.21.244.0", 22],
	["103.22.200.0", 22],
	["103.31.4.0", 22],
	["141.101.64.0", 18],
	["108.162.192.0", 18],
	["190.93.240.0", 20],
	["188.114.96.0", 20],
	["197.234.240.0", 22],
	["198.41.128.0", 17],
	["162.158.0.0", 15],
	["104.16.0.0", 13],
	["104.24.0.0", 14],
	["172.64.0.0", 13],
	["131.0.72.0", 22],
	["2400:cb00::", 32],
	["2606:4700::", 32],
	["2803:f800::", 32],
	["2405:b500::", 32],
	["2405:8100::", 32],
	["2a06:98c0::", 29],
	["2c0f:f248::", 32],
];

const cloudflare = new BlockList();
for (const [net, prefix] of CLOUDFLARE_RANGES) {
	cloudflare.addSubnet(net, prefix, isIP(net) === 6 ? "ipv6" : "ipv4");
}

const privateRanges = new BlockList();
for (const [net, prefix] of [
	["10.0.0.0", 8],
	["172.16.0.0", 12],
	["192.168.0.0", 16],
	["127.0.0.0", 8],
] as const) {
	privateRanges.addSubnet(net, prefix, "ipv4");
}
privateRanges.addSubnet("fc00::", 7, "ipv6");
privateRanges.addAddress("::1", "ipv6");

function family(ip: string): "ipv4" | "ipv6" | null {
	const v = isIP(ip);
	return v === 4 ? "ipv4" : v === 6 ? "ipv6" : null;
}

export function isCloudflareIp(ip: string): boolean {
	const f = family(ip);
	return f !== null && cloudflare.check(ip, f);
}

/**
 * The request to hand to better-auth: unchanged, or with `cf-connecting-ip`
 * replaced by the real connecting address when Cloudflare was bypassed.
 */
export function withTrustedClientIp(request: Request, ipHeader: string | undefined): Request {
	if (ipHeader?.toLowerCase() !== "cf-connecting-ip") return request;
	const peer = request.headers.get("x-real-ip")?.trim();
	const f = peer ? family(peer) : null;
	if (!peer || !f || privateRanges.check(peer, f) || cloudflare.check(peer, f)) {
		return request;
	}
	const headers = new Headers(request.headers);
	headers.set("cf-connecting-ip", peer);
	return new Request(request, { headers });
}

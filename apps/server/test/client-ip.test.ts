/** FIX-PLAN 1.2 (open): only trust cf-connecting-ip when Cloudflare connected. */
import { describe, expect, test } from "bun:test";
import { isCloudflareIp, withTrustedClientIp } from "../src/client-ip";

const req = (headers: Record<string, string>) =>
	new Request("http://localhost/api/auth/sign-in/email", { method: "POST", headers });

describe("client ip", () => {
	test("knows Cloudflare's ranges", () => {
		expect(isCloudflareIp("104.16.1.1")).toBe(true);
		expect(isCloudflareIp("2606:4700::6810:1")).toBe(true);
		expect(isCloudflareIp("8.8.8.8")).toBe(false);
	});

	test("keeps cf-connecting-ip when Cloudflare connected", () => {
		const r = withTrustedClientIp(
			req({ "x-real-ip": "162.158.1.2", "cf-connecting-ip": "203.0.113.7" }),
			"cf-connecting-ip",
		);
		expect(r.headers.get("cf-connecting-ip")).toBe("203.0.113.7");
	});

	test("replaces a forged cf-connecting-ip when Cloudflare was bypassed", () => {
		const r = withTrustedClientIp(
			req({ "x-real-ip": "198.51.100.9", "cf-connecting-ip": "1.2.3.4" }),
			"cf-connecting-ip",
		);
		expect(r.headers.get("cf-connecting-ip")).toBe("198.51.100.9");
	});

	test("changes nothing without a public connecting address or another header", () => {
		for (const headers of <Record<string, string>[]>[
			{ "cf-connecting-ip": "1.2.3.4" },
			{ "x-real-ip": "10.0.1.5", "cf-connecting-ip": "1.2.3.4" },
			{ "x-real-ip": "niet-een-ip", "cf-connecting-ip": "1.2.3.4" },
		]) {
			const original = req(headers);
			expect(withTrustedClientIp(original, "cf-connecting-ip")).toBe(original);
		}
		const other = req({ "x-real-ip": "198.51.100.9" });
		expect(withTrustedClientIp(other, "x-real-ip")).toBe(other);
		expect(withTrustedClientIp(other, undefined)).toBe(other);
	});
});

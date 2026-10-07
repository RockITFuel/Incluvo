/** AI residency: in production AI_ALLOWED_HOSTS may only narrow the EU list. */
import { afterEach, describe, expect, test } from "bun:test";
import { allowedAiHosts, isAllowedAiBaseUrl } from "../src/ai/config";

const saved = { node: process.env.NODE_ENV, hosts: process.env.AI_ALLOWED_HOSTS };
afterEach(() => {
	process.env.NODE_ENV = saved.node;
	if (saved.hosts === undefined) delete process.env.AI_ALLOWED_HOSTS;
	else process.env.AI_ALLOWED_HOSTS = saved.hosts;
});

describe("AI_ALLOWED_HOSTS", () => {
	test("production: pinning works, widening is ignored", () => {
		process.env.NODE_ENV = "production";
		process.env.AI_ALLOWED_HOSTS = "incluvo-eu.openai.azure.com, api.openai.com";
		expect(allowedAiHosts()).toEqual(["incluvo-eu.openai.azure.com"]);
		expect(isAllowedAiBaseUrl("https://incluvo-eu.openai.azure.com/v1")).toBe(true);
		expect(isAllowedAiBaseUrl("https://other.openai.azure.com/v1")).toBe(false);
		expect(isAllowedAiBaseUrl("https://api.openai.com/v1")).toBe(false);
	});

	test("production: only non-EU entries falls back to the default list", () => {
		process.env.NODE_ENV = "production";
		process.env.AI_ALLOWED_HOSTS = "api.openai.com";
		expect(isAllowedAiBaseUrl("https://api.openai.com/v1")).toBe(false);
		expect(isAllowedAiBaseUrl("https://api.mistral.ai/v1")).toBe(true);
	});

	test("outside production any host may be allowed (local models)", () => {
		process.env.NODE_ENV = "development";
		process.env.AI_ALLOWED_HOSTS = "localhost";
		expect(isAllowedAiBaseUrl("http://localhost:11434/v1")).toBe(true);
	});
});

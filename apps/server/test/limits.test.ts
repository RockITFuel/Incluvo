/** FIX-PLAN 1.2 (open): translation and uploads are for school members only. */
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { describe, test } from "bun:test";
import { handleRequest } from "../src/app";
import { auth } from "../src/auth";
import type { Router } from "../src/router";
import { createAccount } from "../src/users";
import { expectForbidden } from "./harness";

async function clientWithoutSchool(): Promise<RouterClient<Router>> {
	const id = await createAccount({
		email: "zonder.school@example.com",
		name: "Zonder School",
		role: "coach",
		organizationId: null,
	});
	const { token } = await (await auth.$context).internalAdapter.createSession(id);
	const client: RouterClient<Router> = createORPCClient(
		new RPCLink({
			url: "http://localhost:3200/rpc",
			fetch: (input, init) => {
				const req = new Request(input, init);
				req.headers.set("authorization", `Bearer ${token}`);
				req.headers.set("origin", "http://localhost:3200");
				return handleRequest(req);
			},
		}),
	);
	return client;
}

describe("school members only", () => {
	test("an account without a school can't translate or upload", async () => {
		const client = await clientWithoutSchool();
		await expectForbidden(() =>
			client.ai.translate({ text: "Hallo", targetLanguage: "en" }),
		);
		await expectForbidden(() =>
			client.courses.uploadLocal({
				filename: "x.png",
				contentType: "image/png",
				scope: "submission",
				data: "iVBORw0KGgo=",
			}),
		);
	});
});

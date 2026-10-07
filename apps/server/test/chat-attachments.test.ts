/** INC-8: files in the chat, readable only by those who may read the chat. */
import { describe, expect, test } from "bun:test";
import { asUser, expectForbidden } from "./harness";

// 1x1 transparent PNG (passes the upload magic-byte check).
const PNG =
	"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

async function code(fn: () => Promise<unknown>) {
	try {
		await fn();
	} catch (e) {
		return (e as { code?: string }).code;
	}
	return undefined;
}

describe("chat attachments", () => {
	test("a leerling sends a file; the coach sees and opens it; others can't", async () => {
		const leerling = await asUser("leerling");
		const coach = await asUser("coach");
		const { id: conversationId } = await coach.client.chat.ensureDirect({
			otherUserId: leerling.id,
		});

		const { storageKey } = await leerling.client.courses.uploadLocal({
			filename: "werkblad.png",
			contentType: "image/png",
			scope: "chat",
			data: PNG,
		});
		const sent = await leerling.client.chat.send({
			conversationId,
			attachmentStorageKey: storageKey,
		});
		expect(sent.body).toBe("");
		expect(sent.attachment).toEqual({ name: "werkblad.png", contentType: "image/png" });

		const thread = await coach.client.chat.messages({ conversationId });
		const msg = thread.messages.find((m) => m.id === sent.id)!;
		expect(msg.attachment?.name).toBe("werkblad.png");
		const file = await coach.client.chat.attachmentUrl({ messageId: sent.id });
		expect(file.url.startsWith("data:image/png;base64,")).toBe(true);

		// Not a member of this chat: no file either.
		for (const who of ["coach2", "keyuser", "andereCoach"] as const) {
			await expectForbidden(async () =>
				(await asUser(who)).client.chat.attachmentUrl({ messageId: sent.id }),
			);
		}
	});

	test("only chat uploads, and a message needs text or a file", async () => {
		const leerling = await asUser("leerling");
		const coach = await asUser("coach");
		const { id: conversationId } = await coach.client.chat.ensureDirect({
			otherUserId: leerling.id,
		});
		const { storageKey: submissionKey } = await leerling.client.courses.uploadLocal({
			filename: "inzending.png",
			contentType: "image/png",
			scope: "submission",
			data: PNG,
		});
		expect(
			await code(() =>
				leerling.client.chat.send({ conversationId, attachmentStorageKey: submissionKey }),
			),
		).toBe("BAD_REQUEST");
		expect(
			await code(() =>
				leerling.client.chat.send({
					conversationId,
					attachmentStorageKey: "chat/00000000-0000-0000-0000-000000000000-weg.png",
				}),
			),
		).toBe("BAD_REQUEST");
		expect(await code(() => leerling.client.chat.send({ conversationId, body: "   " }))).toBe(
			"BAD_REQUEST",
		);
		const text = await leerling.client.chat.send({ conversationId, body: "Hoi" });
		expect(text.attachment).toBeNull();
	});
});

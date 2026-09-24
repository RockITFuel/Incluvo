/**
 * Fix plan 2.4 — course forums and group assignments are gone (D3: a course
 * copy belongs to one leerling). Existing forum chats stay readable.
 */
import { describe, expect, test } from "bun:test";
import { asUser, withDbAt } from "./harness";

describe("course forums (D3)", () => {
	test("a forum block can no longer be added", async () => {
		const builder = await asUser("ontwikkelaar");
		const [template] = await builder.client.courses.list({ kind: "school_template" });
		const tree = await builder.client.courses.tree({ id: template!.id });
		let code: string | undefined;
		try {
			await builder.client.courses.addBlock({
				sectionId: tree.sections[0]!.id,
				type: "forum" as never,
				title: "Forum",
			});
		} catch (e) {
			code = (e as { code?: string }).code;
		}
		expect(code).toBe("BAD_REQUEST");
	});

	test("migration 0009 removes forum blocks but keeps their chats and messages", async () => {
		await withDbAt(8, async (pool, migrateRest) => {
			const O = "00000000-0000-0000-0000-000000000001";
			await pool.query(`
				INSERT INTO organization (id, name) VALUES ('${O}', 'S');
				INSERT INTO "user" (id, name, email) VALUES ('l', 'L', 'l@x');
				INSERT INTO course (id, kind, organization_id, title) VALUES
					('00000000-0000-0000-0000-0000000000c1', 'school_template', '${O}', 'C');
				INSERT INTO course_section (id, course_id, title) VALUES
					('00000000-0000-0000-0000-0000000000s1', '00000000-0000-0000-0000-0000000000c1', 'S');
			`.replaceAll("0000000000s1", "000000000051"));
			await pool.query(`
				INSERT INTO content_block (id, section_id, type, title) VALUES
					('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-000000000051', 'forum', 'Forum'),
					('00000000-0000-0000-0000-0000000000b2', '00000000-0000-0000-0000-000000000051', 'pagina', 'Pagina');
				INSERT INTO conversation (id, organization_id, kind, course_content_block_id) VALUES
					('00000000-0000-0000-0000-0000000000f1', '${O}', 'forum', '00000000-0000-0000-0000-0000000000b1');
				INSERT INTO conversation_member (conversation_id, user_id) VALUES ('00000000-0000-0000-0000-0000000000f1', 'l');
				INSERT INTO message (conversation_id, sender_id, body) VALUES ('00000000-0000-0000-0000-0000000000f1', 'l', 'hallo');
			`);
			await migrateRest();
			const blocks = (await pool.query("SELECT title FROM content_block ORDER BY title")).rows;
			expect(blocks).toEqual([{ title: "Pagina" }]);
			const conv = (await pool.query("SELECT course_content_block_id FROM conversation")).rows;
			expect(conv).toEqual([{ course_content_block_id: null }]);
			expect((await pool.query("SELECT body FROM message")).rows).toEqual([{ body: "hallo" }]);
		});
	});
});

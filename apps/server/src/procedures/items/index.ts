import { item } from "@incluvo/drizzle/schema";
import { policies } from "@incluvo/permissions";
import { checkPermission } from "@incluvo/permissions";
import { ORPCError } from "@orpc/server";
import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { publishTo } from "../../sse";
import { base, protectedProcedure, withPolicy } from "../base";

const ItemSchema = z.object({
	id: z.string(),
	title: z.string(),
	description: z.string().nullable(),
	status: z.string(),
	ownerId: z.string().nullable(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

const list = protectedProcedure
	.use(withPolicy(policies.readItems))
	.route({ method: "GET", path: "/items", tags: ["items"] })
	.output(z.array(ItemSchema))
	.handler(async ({ context }) => {
		return context.db.select().from(item).orderBy(desc(item.createdAt));
	});

const get = protectedProcedure
	.use(withPolicy(policies.readItems))
	.route({ method: "GET", path: "/items/{id}", tags: ["items"] })
	.input(z.object({ id: z.string() }))
	.output(ItemSchema)
	.handler(async ({ input, context }) => {
		const [row] = await context.db
			.select()
			.from(item)
			.where(eq(item.id, input.id));
		if (!row) throw new ORPCError("NOT_FOUND");
		return row;
	});

const create = protectedProcedure
	.use(withPolicy(policies.createItems))
	.route({ method: "POST", path: "/items", tags: ["items"] })
	.input(
		z.object({
			title: z.string().min(1),
			description: z.string().optional(),
			status: z.string().default("open"),
		}),
	)
	.output(ItemSchema)
	.handler(async ({ input, context }) => {
		const [row] = await context.db
			.insert(item)
			.values({ ...input, ownerId: context.actor.userId })
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		// Demo domain: target the owner/actor only (C1) — never a broadcast.
		publishTo(
			{ type: "item.created", payload: { id: row.id } },
			[context.actor.userId],
		);
		return row;
	});

const update = protectedProcedure
	.route({ method: "PUT", path: "/items/{id}", tags: ["items"] })
	.input(
		z.object({
			id: z.string(),
			title: z.string().min(1).optional(),
			description: z.string().nullable().optional(),
			status: z.string().optional(),
		}),
	)
	.output(ItemSchema)
	.handler(async ({ input, context }) => {
		const [existing] = await context.db
			.select()
			.from(item)
			.where(eq(item.id, input.id));
		if (!existing) throw new ORPCError("NOT_FOUND");

		// Resource-scoped check: owner or admin (see policies.updateItem).
		if (!checkPermission(policies.updateItem, context.actor, existing)) {
			throw new ORPCError("FORBIDDEN");
		}

		const { id, ...patch } = input;
		const [row] = await context.db
			.update(item)
			.set({ ...patch, updatedAt: new Date() })
			.where(eq(item.id, id))
			.returning();
		if (!row) throw new ORPCError("INTERNAL_SERVER_ERROR");
		const recipients = [context.actor.userId];
		if (row.ownerId) recipients.push(row.ownerId);
		publishTo({ type: "item.updated", payload: { id: row.id } }, recipients);
		return row;
	});

const remove = protectedProcedure
	.use(withPolicy(policies.deleteItem))
	.route({ method: "DELETE", path: "/items/{id}", tags: ["items"] })
	.input(z.object({ id: z.string() }))
	.output(z.object({ id: z.string() }))
	.handler(async ({ input, context }) => {
		await context.db.delete(item).where(eq(item.id, input.id));
		publishTo(
			{ type: "item.deleted", payload: { id: input.id } },
			[context.actor.userId],
		);
		return { id: input.id };
	});

/** Sample vertical-slice domain router (kept working). */
export const itemsRouter = base.router({
	list,
	get,
	create,
	update,
	remove,
});

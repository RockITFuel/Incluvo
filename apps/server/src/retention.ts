/**
 * Bewaartermijn for the audit log (fix plan 3). Audit rows are kept for
 * AUDIT_RETENTION_DAYS (default 2 years) and then deleted. Pupil content
 * itself is not in the audit log (see audit-trigger.sql, `keys_only`).
 */
import { db } from "@incluvo/drizzle";
import { auditLog } from "@incluvo/drizzle/schema";
import { lt } from "drizzle-orm";
import { env } from "./env";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Delete audit rows older than `days`. Returns how many were deleted. */
export async function purgeAuditLog(days: number, now = new Date()): Promise<number> {
	const cutoff = new Date(now.getTime() - days * DAY_MS);
	const deleted = await db
		.delete(auditLog)
		.where(lt(auditLog.createdAt, cutoff))
		.returning({ id: auditLog.id });
	return deleted.length;
}

/** Run the purge shortly after boot and then once a day. */
export function scheduleRetention(): void {
	const run = async () => {
		try {
			const n = await purgeAuditLog(env.AUDIT_RETENTION_DAYS);
			if (n > 0) console.log(`[retention] ${n} audit rows older than ${env.AUDIT_RETENTION_DAYS} days deleted`);
		} catch (error) {
			console.error("[retention] audit purge failed", error);
		}
	};
	setTimeout(run, 60_000).unref();
	setInterval(run, DAY_MS).unref();
}

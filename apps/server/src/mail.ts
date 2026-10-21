import nodemailer from "nodemailer";
import { env } from "./env";

export interface MailMessage {
	to: string;
	subject: string;
	text: string;
}

/**
 * Mails "sent" while NODE_ENV=test. Tests read links out of these instead of
 * talking to an SMTP server.
 */
export const testOutbox: MailMessage[] = [];

let transport: nodemailer.Transporter | undefined;

function getTransport(): nodemailer.Transporter {
	transport ??= nodemailer.createTransport({
		host: env.SMTP_HOST,
		port: env.SMTP_PORT,
		secure: env.SMTP_SECURE,
		auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
	});
	return transport;
}

/** Split `Name <addr@x>` into its parts; a bare address has no name. */
export function parseFrom(from: string): { address: string; name?: string } {
	const match = from.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
	if (!match) return { address: from.trim() };
	const name = match[1]!.replace(/^"|"$/g, "");
	return name ? { address: match[2]!, name } : { address: match[2]! };
}

async function sendViaCloudflare(message: MailMessage, accountId: string, token: string) {
	const res = await fetch(
		`https://api.cloudflare.com/client/v4/accounts/${accountId}/email/sending/send`,
		{
			method: "POST",
			headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
			body: JSON.stringify({ from: parseFrom(env.SMTP_FROM), ...message }),
			signal: AbortSignal.timeout(15_000),
		},
	);
	const body = (await res.json().catch(() => undefined)) as
		| { success?: boolean; errors?: { message: string }[]; result?: { permanent_bounces?: string[] } }
		| undefined;
	if (!res.ok || !body?.success) {
		const reason = body?.errors?.map((e) => e.message).join("; ") || `HTTP ${res.status}`;
		throw new Error(`Cloudflare Email Sending rejected the mail: ${reason}`);
	}
	if (body.result?.permanent_bounces?.length) {
		throw new Error(`Mail to ${message.to} bounced permanently`);
	}
}

/** Send a plain-text mail. Throws when the mail server rejects it. */
export async function sendMail(message: MailMessage): Promise<void> {
	if (env.NODE_ENV === "test") {
		testOutbox.push(message);
		return;
	}
	if (env.CLOUDFLARE_EMAIL_ACCOUNT_ID && env.CLOUDFLARE_EMAIL_API_TOKEN) {
		await sendViaCloudflare(message, env.CLOUDFLARE_EMAIL_ACCOUNT_ID, env.CLOUDFLARE_EMAIL_API_TOKEN);
		return;
	}
	await getTransport().sendMail({ from: env.SMTP_FROM, ...message });
}

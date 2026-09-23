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

/** Send a plain-text mail. Throws when the SMTP server rejects it. */
export async function sendMail(message: MailMessage): Promise<void> {
	if (env.NODE_ENV === "test") {
		testOutbox.push(message);
		return;
	}
	await getTransport().sendMail({ from: env.SMTP_FROM, ...message });
}

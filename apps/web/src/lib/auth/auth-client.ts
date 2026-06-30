import { createAuthClient } from "better-auth/solid";

export const authClient = createAuthClient({
	// Use the current origin at runtime; better-auth defaults its basePath to
	// "/api/auth" (where the server mounts it), so passing an explicit basePath
	// alongside the origin baseURL is unnecessary and broke session calls. Mirror
	// clp's working config: origin-only baseURL.
	baseURL: typeof window !== "undefined" ? window.location.origin : "",
});

export type Session = typeof authClient.$Infer.Session;
export type SessionUser = Session["user"];

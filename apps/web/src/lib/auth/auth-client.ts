import { createAuthClient } from "better-auth/solid";

export const authClient = createAuthClient({
	baseURL: typeof window !== "undefined" ? window.location.origin : "",
	// better-auth is mounted under /api/auth on the server.
	basePath: "/api/auth",
});

export type Session = typeof authClient.$Infer.Session;
export type SessionUser = Session["user"];

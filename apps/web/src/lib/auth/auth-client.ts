import { createAuthClient } from "better-auth/client";

// The framework-neutral client: Incluvo only calls it imperatively (sign in/out,
// session, password reset), so it needs no Solid binding. better-auth defaults
// its basePath to "/api/auth", where the server mounts it.
export const authClient = createAuthClient({ baseURL: window.location.origin });

export type Session = typeof authClient.$Infer.Session;
export type SessionUser = Session["user"];

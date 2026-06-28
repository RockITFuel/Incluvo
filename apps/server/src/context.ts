import { db, type Database } from "@incluvo/drizzle";
import { auth, type AuthSession } from "./auth";

export interface Context {
	session: AuthSession | null;
	db: Database;
	headers: Headers;
}

export async function createContext(request: Request): Promise<Context> {
	const session = await auth.api.getSession({ headers: request.headers });

	return {
		session,
		db,
		headers: request.headers,
	};
}

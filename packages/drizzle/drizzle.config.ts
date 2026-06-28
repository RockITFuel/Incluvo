import { defineConfig } from "drizzle-kit";
import { loadRootEnv } from "./src/load-env";

loadRootEnv();

export default defineConfig({
	out: "./drizzle",
	schema: "./src/schema/index.ts",
	dialect: "postgresql",
	dbCredentials: {
		// biome-ignore lint: env is required at migration time
		url: process.env.DATABASE_URL!,
	},
});

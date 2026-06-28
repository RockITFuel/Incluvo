import { OpenAPIHandler } from "@orpc/openapi/fetch";
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins";
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4";
import { env } from "./env";
import { router } from "./router";

const SPEC_SERVER_URL = `${env.BETTER_AUTH_URL.replace(/\/$/, "")}/api`;

/**
 * Serves the generated OpenAPI document and an interactive Scalar reference.
 *   - GET /api/docs       -> Scalar UI
 *   - GET /api/spec.json  -> OpenAPI 3.1 document
 *   - {METHOD} /api/...   -> REST endpoints generated from each procedure's route()
 */
export const openAPIHandler = new OpenAPIHandler(router, {
	plugins: [
		new OpenAPIReferencePlugin({
			docsProvider: "scalar",
			docsPath: "/docs",
			specPath: "/spec.json",
			schemaConverters: [new ZodToJsonSchemaConverter()],
			specGenerateOptions: {
				servers: [{ url: SPEC_SERVER_URL }],
				info: {
					title: "Incluvo API",
					version: "1.0.0",
					description: "Incluvo backend API (oRPC + OpenAPI).",
				},
				security: [{ sessionAuth: [] }],
				components: {
					securitySchemes: {
						sessionAuth: {
							type: "apiKey",
							in: "cookie",
							name: "better-auth.session_token",
						},
					},
				},
			},
		}),
	],
});

import type { Router } from "@incluvo/server/src/router";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";
import { createTanstackQueryUtils } from "@orpc/tanstack-query";

const baseUrl =
	typeof window !== "undefined"
		? window.location.origin
		: (import.meta.env.VITE_SERVER_URL ?? "http://localhost:3200");

const link = new RPCLink({
	url: `${baseUrl}/rpc`,
	fetch: (input, init) =>
		fetch(input, { ...init, credentials: "include" }),
});

export const client: RouterClient<Router> = createORPCClient(link);

/** TanStack Query helpers, e.g. `orpc.items.list.queryOptions()`. */
export const orpc = createTanstackQueryUtils(client);

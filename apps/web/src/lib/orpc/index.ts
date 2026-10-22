import type { Router } from "@incluvo/server/src/router";
import { createORPCClient } from "@orpc/client";
import { RPCLink } from "@orpc/client/fetch";
import type { RouterClient } from "@orpc/server";

const link = new RPCLink({
	url: `${window.location.origin}/rpc`,
	fetch: (input, init) => fetch(input, { ...init, credentials: "include" }),
});

/**
 * The typed oRPC client. Pages load through route loaders (lib/route-data.ts)
 * and write with plain calls followed by a targeted refresh (lib/refresh.ts).
 */
export const client: RouterClient<Router> = createORPCClient(link);

/** The output of an oRPC procedure, e.g. `Output<typeof client.tasks.list>`. */
export type Output<P extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<P>>;

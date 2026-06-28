import { createMemo, type Accessor } from "solid-js";
import { can } from "./src/check";
import type { Policy, PolicySubject } from "./src/policy";

/**
 * Reactive permission guard for Solid components.
 *
 *   const canCreate = usePermission(currentUser, policies.createItems);
 *   <Show when={canCreate()}>…</Show>
 */
export function usePermission<Resource>(
	actor: Accessor<PolicySubject | null | undefined>,
	policy: Policy<Resource>,
	resource?: Accessor<Resource | undefined>,
): Accessor<boolean> {
	return createMemo(() => {
		const a = actor();
		if (!a) return false;
		return can(a, policy, resource?.());
	});
}

import { omit } from "solid-js";

/**
 * Solid 2 removed `splitProps`. This keeps its shape on top of `omit`, so the
 * selected half stays reactive (getters reading through to `props`). Copied
 * from project-alpha (packages/ui/src/solid-props.ts).
 */
export function splitProps<T extends object, K extends PropertyKey>(
	props: T,
	keys: readonly K[],
): [Pick<T, Extract<keyof T, K>>, Omit<T, Extract<keyof T, K>>] {
	const ownKeys = keys as readonly Extract<keyof T, K>[];
	const descriptors = Object.fromEntries(
		ownKeys.map((key) => [key, { enumerable: true, get: () => props[key] }]),
	);
	const selected = Object.defineProperties({}, descriptors) as Pick<T, Extract<keyof T, K>>;
	const remaining = omit(props, ...ownKeys) as unknown as Omit<T, Extract<keyof T, K>>;
	return [selected, remaining];
}

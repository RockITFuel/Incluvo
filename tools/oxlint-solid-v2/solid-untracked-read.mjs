/**
 * Static counterpart of Solid 2's dev-only STRICT_READ_UNTRACKED warning. Solid runs a few
 * places untracked with a strict-read label: component and primitive bodies, the effect
 * callback of createEffect(compute, effect), and the child function of <Show>, <Match> and
 * <For>. A reactive read there sees the value once and never updates, so the runtime warns.
 *
 * Reactive reads this rule knows about:
 * - `props.x` of a component (callbacks `props.onX(...)` and `ref` excluded);
 * - calling a signal getter, memo, `Accessor<T>` parameter or TanStack router accessor;
 * - calling a local function that (transitively) does one of the above.
 * Reads inside JSX, nested functions (handlers, compute functions, memos) are tracked. Reads
 * inside an existing untrack(...) call are not reported.
 */

const FUNCTION_TYPES = new Set([
  "ArrowFunctionExpression",
  "FunctionExpression",
  "FunctionDeclaration",
]);

const ACCESSOR_FACTORIES = new Set(["createMemo", "createAsync", "createProjection"]);

const ROUTER_ACCESSORS = new Set([
  "useLocation",
  "useParams",
  "useSearch",
  "useRouteContext",
  "useLoaderData",
  "useLoaderDeps",
  "useMatch",
  "useRouterState",
]);

const EFFECTS = new Set(["createEffect", "createRenderEffect"]);

const CONTROL_FLOW = new Set(["Show", "Match", "For"]);

const isFunction = (node) => FUNCTION_TYPES.has(node?.type);

const isComponentName = (name) => /^[A-Z]/.test(name);

const isSetupName = (name) => isComponentName(name) || /^(create|use)[A-Z]/.test(name);

const calleeName = (callee) => {
  if (callee?.type === "Identifier") return callee.name;

  if (callee?.type === "MemberExpression" && callee.property?.type === "Identifier")
    return callee.property.name;

  return undefined;
};

const childNodes = (node) => {
  const result = [];

  for (const key of Object.keys(node)) {
    if (key === "parent") continue;
    const value = node[key];

    if (Array.isArray(value)) {
      for (const item of value) if (item?.type) result.push(item);
    } else if (value?.type) {
      result.push(value);
    }
  }

  return result;
};

const isJsx = (node) => node?.type === "JSXElement" || node?.type === "JSXFragment";

/** Walks a scope without entering nested functions, JSX or untrack(). */
const walkScope = (node, visit) => {
  for (const child of childNodes(node)) {
    if (isFunction(child) || isJsx(child)) continue;

    if (child.type === "CallExpression" && calleeName(child.callee) === "untrack") continue;
    visit(child);
    walkScope(child, visit);
  }
};

const isAccessorType = (param) => {
  const annotation = param?.typeAnnotation?.typeAnnotation;

  return (
    annotation?.type === "TSTypeReference" &&
    annotation.typeName?.type === "Identifier" &&
    annotation.typeName.name === "Accessor"
  );
};

const paramName = (param) => {
  if (param?.type === "Identifier") return param.name;

  if (param?.type === "AssignmentPattern" && param.left?.type === "Identifier")
    return param.left.name;

  return undefined;
};

const functionName = (node) => {
  if (node.type === "FunctionDeclaration") return node.id?.name;

  if (node.parent?.type === "VariableDeclarator" && node.parent.id?.type === "Identifier")
    return node.parent.id.name;

  return undefined;
};

const isModuleLevel = (node) => {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "Program") return true;

    if (isFunction(parent) || parent.type === "ClassBody") return false;
  }

  return false;
};

const jsxName = (element) => {
  const name = element?.openingElement?.name;

  if (name?.type === "JSXIdentifier") return name.name;

  if (name?.type === "JSXMemberExpression") return name.property?.name;

  return undefined;
};

export const noUntrackedReactiveReadRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow reactive reads in Solid 2's untracked scopes (component body, effect callback, control-flow child function).",
    },
    messages: {
      untrackedRead:
        "'{{name}}' is read in {{scope}}, which Solid 2 runs untracked: the value never updates (STRICT_READ_UNTRACKED). Read it in JSX, a memo or the effect's compute function; seed local state with the writable derived signal createSignal(() => props.x); refetch with createEffect(() => input, (input) => ...).",
    },
  },
  create(context) {
    /** Names that are accessors in this file: signals, memos, router state, Accessor params. */
    const accessors = new Set();
    /** Named local functions, to find helpers that read reactive values. */
    const functions = new Map();
    /** Components and create/use primitives: their bodies run untracked. */
    const setups = [];
    const effectCallbacks = [];
    const controlFlowCallbacks = [];
    /** Component function node → its props parameter name. */
    const propsOf = new Map();

    const enclosingProps = (node) => {
      for (let parent = node.parent; parent; parent = parent.parent) {
        if (propsOf.has(parent)) return propsOf.get(parent);
      }

      return undefined;
    };

    const readName = (node, derived) => {
      if (
        node.type === "MemberExpression" &&
        node.object?.type === "Identifier" &&
        node.property?.type === "Identifier" &&
        !node.computed
      ) {
        const props = enclosingProps(node);
        const key = node.property.name;

        if (props === undefined || node.object.name !== props) return undefined;

        if (key === "ref" || /^on[A-Z]/.test(key)) return undefined;

        // Calling a callback prop is not a read of reactive state.
        if (node.parent?.type === "CallExpression" && node.parent.callee === node) return undefined;

        return `${props}.${key}`;
      }

      if (node.type === "CallExpression" && node.callee?.type === "Identifier") {
        const name = node.callee.name;

        if (accessors.has(name) || derived.has(name)) return `${name}()`;
      }

      return undefined;
    };

    const readsIn = (scope, derived) => {
      const found = [];

      // JSX is compiled into tracked bindings.
      if (isJsx(scope)) return found;

      if (!isFunction(scope)) {
        const direct = readName(scope, derived);

        if (direct) found.push({ node: scope, name: direct });
      }

      walkScope(scope, (node) => {
        const name = readName(node, derived);

        if (name) found.push({ node, name });
      });

      return found;
    };

    const collectFunction = (node) => {
      const name = functionName(node);

      if (!name) return;
      functions.set(name, node);

      // Components and primitives are module-level; a nested `createX` is a handler.
      if (isSetupName(name) && isModuleLevel(node)) setups.push(node);
    };

    return {
      FunctionDeclaration: collectFunction,
      ArrowFunctionExpression: collectFunction,
      FunctionExpression: collectFunction,
      VariableDeclarator(node) {
        const init = node.init;

        if (init?.type !== "CallExpression") return;
        const callee = calleeName(init.callee);

        if (callee === "createSignal" && node.id?.type === "ArrayPattern") {
          const getter = node.id.elements?.[0];

          if (getter?.type === "Identifier") accessors.add(getter.name);
        }

        if (
          (ACCESSOR_FACTORIES.has(callee) || ROUTER_ACCESSORS.has(callee)) &&
          node.id?.type === "Identifier"
        ) {
          accessors.add(node.id.name);
        }
      },
      CallExpression(node) {
        if (!EFFECTS.has(calleeName(node.callee))) return;
        const callback = node.arguments?.[1];

        if (isFunction(callback)) effectCallbacks.push(callback);
      },
      JSXElement(node) {
        const name = jsxName(node);

        if (!CONTROL_FLOW.has(name)) return;

        for (const child of node.children ?? []) {
          if (child.type !== "JSXExpressionContainer" || !isFunction(child.expression)) continue;
          controlFlowCallbacks.push({ name, callback: child.expression });
        }
      },
      "Program:exit"() {
        for (const setup of setups) {
          const first = setup.params?.[0];

          if (isComponentName(functionName(setup)) && first?.type === "Identifier")
            propsOf.set(setup, first.name);

          for (const param of setup.params ?? []) {
            if (isAccessorType(param) && paramName(param)) accessors.add(paramName(param));
          }
        }

        // A local helper that reads reactive state is itself a reactive read when called.
        const derived = new Set();
        let changed = true;

        while (changed) {
          changed = false;

          for (const [name, fn] of functions) {
            if (derived.has(name) || accessors.has(name) || isSetupName(name)) continue;

            if (readsIn(fn.body, derived).length > 0) {
              derived.add(name);
              changed = true;
            }
          }
        }

        const reported = new Set();

        const report = (found, scope) => {
          for (const { node, name } of found) {
            if (reported.has(node)) continue;
            reported.add(node);
            context.report({ node, messageId: "untrackedRead", data: { name, scope } });
          }
        };

        for (const setup of setups) {
          report(readsIn(setup.body, derived), `the body of ${functionName(setup)}`);
        }

        for (const callback of effectCallbacks) {
          report(readsIn(callback.body, derived), "an effect callback");
        }

        for (const { name, callback } of controlFlowCallbacks) {
          // <Show>/<Match> hand the child an accessor; reading it directly is the same mistake.
          const params =
            name === "For" ? [] : (callback.params ?? []).map(paramName).filter(Boolean);

          const scoped = new Set([...derived, ...params]);

          report(readsIn(callback.body, scoped), `the <${name}> child function`);
        }
      },
    };
  },
};

import { noUntrackedReactiveReadRule } from "./solid-untracked-read.mjs";
import { createRoutePropertyOrderRule } from "./tanstack-router-rule/index.js";
import upstream from "./upstream/index.js";

const SAFE_UPSTREAM_RULES = [
  "components-return-once",
  "event-handlers",
  "jsx-no-duplicate-props",
  "jsx-no-script-url",
  "no-array-handlers",
  "no-destructure",
  "no-innerhtml",
  "no-react-specific-props",
  "no-unknown-namespaces",
  "self-closing-comp",
  "style-prop",
];

const safeUpstreamRules = Object.fromEntries(
  SAFE_UPSTREAM_RULES.map((name) => [name, upstream.rules[name]]),
);

const renamedApis = new Map([
  ["equalFn", "isEqual"],
  ["getListener", "getObserver"],
  ["mergeProps", "merge"],
  ["onMount", "onSettled"],
  ["splitProps", "omit"],
  ["unwrap", "snapshot"],
]);

const removedApis = new Map([
  ["batch", "Writes are batched by default; use flush() only for an immediate read."],
  ["catchError", "Use createErrorBoundary or <Errored>."],
  ["createComputed", "Use createMemo or createEffect(compute, effect)."],
  ["createDeferred", "Move deferral outside the reactive graph."],
  ["createDynamic", "Use the dynamic() factory from @solidjs/web."],
  ["createMutable", "Use createStore with draft setters."],
  ["createResource", "Use an async createMemo and <Loading>."],
  ["createSelector", "Use createProjection."],
  ["ErrorBoundary", "Use <Errored> or createErrorBoundary."],
  ["from", "Use Solid 2 async-iterator interop."],
  ["Index", "Use <For keyed={false}>."],
  ["modifyMutable", "Use createStore with draft setters."],
  ["observable", "Bridge external consumers with a split createEffect."],
  ["on", "Read dependencies in createEffect's compute function."],
  ["onError", "Use createErrorBoundary or <Errored>."],
  ["produce", "Mutate the draft received by a store setter directly."],
  ["renderToStringAsync", "Await renderToString() or renderToStream()."],
  ["startTransition", "Transitions are built in; use isPending() or latest()."],
  ["Suspense", "Use <Loading>."],
  ["SuspenseList", "Use <Reveal>."],
  ["useTransition", "Transitions are built in; use isPending() or latest()."],
]);

const importedName = (specifier) => specifier.imported?.name ?? specifier.imported?.value;

const removedApiRule = {
  meta: {
    type: "problem",
    docs: { description: "Disallow Solid 1 APIs that changed or disappeared in Solid 2." },
    messages: {
      classList: "Solid 2 removed classList; pass the object or array to class instead.",
      directive: "Solid 2 removed use: directives; use a ref directive factory instead.",
      movedImport: "Solid 2 moved '{{from}}' to '{{to}}'.",
      removed: "'{{name}}' was removed in Solid 2. {{guidance}}",
      renamed: "'{{name}}' was renamed to '{{replacement}}' in Solid 2.",
      styleNamespace:
        "Solid 2 removed '{{namespace}}:' JSX syntax; use a structured {{namespace}} value.",
    },
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source?.value;

        const movedSource =
          source === "solid-js/web"
            ? "@solidjs/web"
            : source === "solid-js/store"
              ? "solid-js"
              : source === "solid-js/h"
                ? "@solidjs/h"
                : source === "solid-js/html"
                  ? "@solidjs/html"
                  : source === "solid-js/universal"
                    ? "@solidjs/universal"
                    : undefined;

        if (movedSource) {
          context.report({
            node: node.source,
            messageId: "movedImport",
            data: { from: source, to: movedSource },
          });
        }

        if (source !== "solid-js" && source !== "solid-js/store" && source !== "solid-js/web") {
          return;
        }

        for (const specifier of node.specifiers ?? []) {
          if (specifier.type !== "ImportSpecifier") continue;
          const name = importedName(specifier);
          const replacement = renamedApis.get(name);

          if (replacement) {
            context.report({
              node: specifier,
              messageId: "renamed",
              data: { name, replacement },
            });
            continue;
          }

          const guidance = removedApis.get(name);

          if (guidance) {
            context.report({ node: specifier, messageId: "removed", data: { name, guidance } });
          }
        }
      },
      JSXAttribute(node) {
        if (node.name?.type === "JSXIdentifier" && node.name.name === "classList") {
          context.report({ node: node.name, messageId: "classList" });

          return;
        }

        if (node.name?.type !== "JSXNamespacedName") return;
        const namespace = node.name.namespace?.name;

        if (namespace === "use") {
          context.report({ node: node.name, messageId: "directive" });
        } else if (namespace === "class" || namespace === "style") {
          context.report({
            node: node.name,
            messageId: "styleNamespace",
            data: { namespace },
          });
        }
      },
    };
  },
};

const effectBindings = (source, imported) => {
  const bindings = new Set();
  const namespaces = new Set();

  return {
    bindings,
    namespaces,
    import(node) {
      if (node.source?.value !== source) return;

      for (const specifier of node.specifiers ?? []) {
        if (specifier.type === "ImportNamespaceSpecifier") namespaces.add(specifier.local.name);

        if (specifier.type === "ImportSpecifier" && importedName(specifier) === imported) {
          bindings.add(specifier.local.name);
        }
      }
    },
  };
};

const noSingleArgumentEffectRule = {
  meta: {
    type: "problem",
    docs: { description: "Require Solid 2's createEffect(compute, effect) form." },
    messages: {
      splitEffect:
        "Solid 2 requires {{api}}(compute, effect); use onSettled for one-time DOM lifecycle work.",
    },
  },
  create(context) {
    const effect = effectBindings("solid-js", "createEffect");
    const renderEffect = effectBindings("solid-js", "createRenderEffect");

    return {
      ImportDeclaration(node) {
        effect.import(node);
        renderEffect.import(node);
      },
      CallExpression(node) {
        if (node.arguments?.length !== 1) return;
        let api;

        if (node.callee?.type === "Identifier") {
          if (effect.bindings.has(node.callee.name)) api = "createEffect";

          if (renderEffect.bindings.has(node.callee.name)) api = "createRenderEffect";
        }

        if (
          node.callee?.type === "MemberExpression" &&
          node.callee.object?.type === "Identifier" &&
          node.callee.property?.type === "Identifier"
        ) {
          if (
            effect.namespaces.has(node.callee.object.name) &&
            node.callee.property.name === "createEffect"
          ) {
            api = "createEffect";
          }

          if (
            renderEffect.namespaces.has(node.callee.object.name) &&
            node.callee.property.name === "createRenderEffect"
          ) {
            api = "createRenderEffect";
          }
        }

        if (api) context.report({ node, messageId: "splitEffect", data: { api } });
      },
    };
  },
};

export default {
  meta: { name: "incluvo-solid-v2", version: "2.0.0-rc.9" },
  rules: {
    ...safeUpstreamRules,
    "create-route-property-order": createRoutePropertyOrderRule,
    "removed-api": removedApiRule,
    "no-single-arg-create-effect": noSingleArgumentEffectRule,
    "no-untracked-reactive-read": noUntrackedReactiveReadRule,
  },
};

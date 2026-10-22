const DIRECT_ROUTE_FACTORIES = new Set(["createRootRoute", "createRoute"]);

const INDIRECT_ROUTE_FACTORIES = new Set(["createFileRoute", "createRootRouteWithContext"]);

const ROUTE_FACTORIES = new Set([...DIRECT_ROUTE_FACTORIES, ...INDIRECT_ROUTE_FACTORIES]);

const PROPERTY_GROUPS = [
  new Set(["params", "validateSearch"]),
  new Set(["search"]),
  new Set(["loaderDeps", "ssr"]),
  new Set(["context"]),
  new Set(["beforeLoad"]),
  new Set(["loader"]),
  new Set(["onEnter", "onStay", "onLeave", "head", "scripts", "headers", "remountDeps"]),
];

const propertyRank = (name) => PROPERTY_GROUPS.findIndex((group) => group.has(name));

const importedName = (specifier) => specifier.imported?.name ?? specifier.imported?.value;

const isRouterSource = (source) =>
  typeof source === "string" && source.startsWith("@tanstack/") && source.endsWith("-router");

const orderedProperties = (properties) => {
  const checked = properties.filter(({ name }) => propertyRank(name) !== -1);

  const sorted = checked.toSorted(
    (left, right) => propertyRank(left.name) - propertyRank(right.name),
  );

  if (checked.every((property, index) => property === sorted[index])) return undefined;

  let index = 0;

  return properties.map((property) =>
    propertyRank(property.name) === -1 ? property : sorted[index++],
  );
};

const routeObjectFor = (node, factory) => {
  if (INDIRECT_ROUTE_FACTORIES.has(factory)) {
    return node.parent?.type === "CallExpression" ? node.parent.arguments?.[0] : undefined;
  }

  return node.arguments?.[0];
};

/**
 * Local Oxlint port of TanStack Router's create-route-property-order rule.
 * It keeps inference-sensitive route options in the order expected by Router.
 */
export const createRoutePropertyOrderRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ensure correct order of inference-sensitive properties for TanStack createRoute functions.",
    },
    fixable: "code",
    messages: {
      invalidOrder: "Invalid order of properties for `{{function}}`.",
    },
  },
  create(context) {
    const bindings = new Map();

    return {
      ImportDeclaration(node) {
        if (!isRouterSource(node.source?.value) || node.importKind === "type") return;

        for (const specifier of node.specifiers ?? []) {
          if (specifier.type !== "ImportSpecifier") continue;
          const imported = importedName(specifier);

          if (ROUTE_FACTORIES.has(imported)) bindings.set(specifier.local.name, imported);
        }
      },
      CallExpression(node) {
        if (node.callee?.type !== "Identifier") return;
        const factory = bindings.get(node.callee.name);

        if (!factory) return;

        const routeObject = routeObjectFor(node, factory);

        if (routeObject?.type !== "ObjectExpression" || routeObject.properties.length < 2) return;

        const properties = [];

        for (const property of routeObject.properties) {
          if (property.type !== "Property" || property.computed) return;

          const name =
            property.key?.type === "Identifier"
              ? property.key.name
              : property.key?.type === "Literal" && typeof property.key.value === "string"
                ? property.key.value
                : undefined;

          if (!name) return;
          properties.push({ name, node: property });
        }

        const sorted = orderedProperties(properties);

        if (!sorted) return;

        context.report({
          node: routeObject,
          messageId: "invalidOrder",
          data: { function: factory },
          fix(fixer) {
            const sourceCode = context.sourceCode;

            const separators = properties
              .slice(0, -1)
              .map((property, index) =>
                sourceCode
                  .getText()
                  .slice(property.node.range[1], properties[index + 1].node.range[0]),
              );

            const text = sorted
              .map(
                (property, index) => sourceCode.getText(property.node) + (separators[index] ?? ""),
              )
              .join("");

            return fixer.replaceTextRange(
              [properties[0].node.range[0], properties.at(-1).node.range[1]],
              text,
            );
          },
        });
      },
    };
  },
};

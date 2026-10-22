// node_modules/.bun/@oxlint+plugins@1.43.0/node_modules/@oxlint/plugins/index.js
var EMPTY_VISITOR = {};
function eslintCompatPlugin(plugin) {
  if (typeof plugin != "object" || !plugin)
    throw Error("Plugin must be an object");
  let { rules } = plugin;
  if (typeof rules != "object" || !rules)
    throw Error("Plugin must have an object as `rules` property");
  for (let ruleName in rules)
    Object.hasOwn(rules, ruleName) && convertRule(rules[ruleName]);
  return plugin;
}
function convertRule(rule) {
  if (typeof rule != "object" || !rule)
    throw Error("Rule must be an object");
  if ("create" in rule)
    return;
  let context = null, visitor, beforeHook;
  rule.create = (eslintContext) => (context === null && ({ context, visitor, beforeHook } = createContextAndVisitor(rule)), Object.defineProperties(context, {
    id: { value: eslintContext.id },
    options: { value: eslintContext.options },
    report: { value: eslintContext.report }
  }), Object.setPrototypeOf(context, Object.getPrototypeOf(eslintContext)), beforeHook !== null && beforeHook() === false ? EMPTY_VISITOR : visitor);
}
var FILE_CONTEXT = Object.freeze({
  get filename() {
    throw Error("Cannot access `context.filename` in `createOnce`");
  },
  getFilename() {
    throw Error("Cannot call `context.getFilename` in `createOnce`");
  },
  get physicalFilename() {
    throw Error("Cannot access `context.physicalFilename` in `createOnce`");
  },
  getPhysicalFilename() {
    throw Error("Cannot call `context.getPhysicalFilename` in `createOnce`");
  },
  get cwd() {
    throw Error("Cannot access `context.cwd` in `createOnce`");
  },
  getCwd() {
    throw Error("Cannot call `context.getCwd` in `createOnce`");
  },
  get sourceCode() {
    throw Error("Cannot access `context.sourceCode` in `createOnce`");
  },
  getSourceCode() {
    throw Error("Cannot call `context.getSourceCode` in `createOnce`");
  },
  get languageOptions() {
    throw Error("Cannot access `context.languageOptions` in `createOnce`");
  },
  get settings() {
    throw Error("Cannot access `context.settings` in `createOnce`");
  },
  extend(extension) {
    return Object.freeze(Object.assign(Object.create(this), extension));
  },
  get parserOptions() {
    throw Error("Cannot access `context.parserOptions` in `createOnce`");
  },
  get parserPath() {
    throw Error("Cannot access `context.parserPath` in `createOnce`");
  }
});
function createContextAndVisitor(rule) {
  let { createOnce } = rule;
  if (createOnce == null)
    throw Error("Rules must define either a `create` or `createOnce` method");
  if (typeof createOnce != "function")
    throw Error("Rule `createOnce` property must be a function");
  let context = Object.create(FILE_CONTEXT, {
    id: {
      value: "",
      enumerable: true,
      configurable: true
    },
    options: {
      value: null,
      enumerable: true,
      configurable: true
    },
    report: {
      value: null,
      enumerable: true,
      configurable: true
    }
  }), { before: beforeHook, after: afterHook, ...visitor } = createOnce.call(rule, context);
  if (beforeHook === undefined)
    beforeHook = null;
  else if (beforeHook !== null && typeof beforeHook != "function")
    throw Error("`before` property of visitor must be a function if defined");
  if (afterHook != null) {
    if (typeof afterHook != "function")
      throw Error("`after` property of visitor must be a function if defined");
    let maxAttrs = -1;
    for (let key2 in visitor) {
      if (!Object.hasOwn(visitor, key2) || !key2.endsWith(":exit"))
        continue;
      let end = key2.length - 5, count = 0;
      for (let i = 0;i < end; i++) {
        let c = key2.charCodeAt(i);
        (c === 91 || c === 46 || c === 58) && count++;
      }
      count > maxAttrs && (maxAttrs = count);
    }
    let key = `Program${"[type]".repeat(maxAttrs + 1)}:exit`;
    visitor[key] = (_node) => afterHook();
  }
  return {
    context,
    visitor,
    beforeHook
  };
}

// packages/plugin-solid/src/rules/components-return-once.ts
var getFunctionName = (node) => {
  if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression") && node.id != null) {
    return node.id.name;
  }
  if (node.parent?.type === "VariableDeclarator" && node.parent.id.type === "Identifier") {
    return node.parent.id.name;
  }
  return null;
};
var isNothing = (node) => {
  if (!node)
    return true;
  switch (node.type) {
    case "Literal":
      return [null, undefined, false, ""].includes(node.value);
    case "JSXFragment":
      return !node.children || node.children.every(isNothing);
    default:
      return false;
  }
};
var getLineLength = (loc) => loc.end.line - loc.start.line + 1;
var components_return_once_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow early returns in components. Solid components only run once, and so conditionals should be inside JSX.",
      url: "https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/components-return-once.md"
    },
    fixable: "code",
    schema: [],
    messages: {
      noEarlyReturn: "Solid components run once, so an early return breaks reactivity. Move the condition inside a JSX element, such as a fragment or <Show />.",
      noConditionalReturn: "Solid components run once, so a conditional return breaks reactivity. Move the condition inside a JSX element, such as a fragment or <Show />."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    const functionStack = [];
    const putIntoJSX = (node) => {
      const text = context.sourceCode.getText(node);
      return node.type === "JSXElement" || node.type === "JSXFragment" ? text : `{${text}}`;
    };
    const currentFunction = () => functionStack[functionStack.length - 1];
    const onFunctionEnter = (node) => {
      let lastReturn = undefined;
      if (node.body.type === "BlockStatement") {
        const last = node.body.body.findLast((n) => !n.type.endsWith("Declaration"));
        if (last && last.type === "ReturnStatement") {
          lastReturn = last;
        }
      }
      functionStack.push({ isComponent: false, lastReturn, earlyReturns: [] });
    };
    const onFunctionExit = (node) => {
      if (getFunctionName(node)?.match(/^[a-z]/) || node.parent?.type === "JSXExpressionContainer" || node.parent?.type === "CallExpression" && node.parent.arguments.some((n) => n === node) && !node.parent.callee?.name?.match(/^[A-Z]/)) {
        currentFunction().isComponent = false;
      }
      if (currentFunction().isComponent) {
        currentFunction().earlyReturns.forEach((earlyReturn) => {
          context.report({
            node: earlyReturn,
            messageId: "noEarlyReturn"
          });
        });
        const argument = currentFunction().lastReturn?.argument;
        if (argument?.type === "ConditionalExpression") {
          const sourceCode = context.sourceCode;
          context.report({
            node: argument.parent,
            messageId: "noConditionalReturn",
            fix: (fixer) => {
              const { test, consequent, alternate } = argument;
              const conditions = [{ test, consequent }];
              let fallback = alternate;
              while (fallback.type === "ConditionalExpression") {
                conditions.push({ test: fallback.test, consequent: fallback.consequent });
                fallback = fallback.alternate;
              }
              if (conditions.length >= 2) {
                const fallbackStr = !isNothing(fallback) ? ` fallback={${sourceCode.getText(fallback)}}` : "";
                return fixer.replaceText(argument, `<Switch${fallbackStr}>
${conditions.map(({ test: test2, consequent: consequent2 }) => `<Match when={${sourceCode.getText(test2)}}>${putIntoJSX(consequent2)}</Match>`).join(`
`)}
</Switch>`);
              }
              if (isNothing(consequent)) {
                return fixer.replaceText(argument, `<Show when={!(${sourceCode.getText(test)})}>${putIntoJSX(alternate)}</Show>`);
              }
              if (isNothing(fallback) || getLineLength(consequent.loc) >= getLineLength(alternate.loc) * 1.5) {
                const fallbackStr = !isNothing(fallback) ? ` fallback={${sourceCode.getText(fallback)}}` : "";
                return fixer.replaceText(argument, `<Show when={${sourceCode.getText(test)}}${fallbackStr}>${putIntoJSX(consequent)}</Show>`);
              }
              return fixer.replaceText(argument, `<>${putIntoJSX(argument)}</>`);
            }
          });
        } else if (argument?.type === "LogicalExpression") {
          if (argument.operator === "&&") {
            const sourceCode = context.sourceCode;
            context.report({
              node: argument,
              messageId: "noConditionalReturn",
              fix: (fixer) => {
                const { left: test, right: consequent } = argument;
                return fixer.replaceText(argument, `<Show when={${sourceCode.getText(test)}}>${putIntoJSX(consequent)}</Show>`);
              }
            });
          } else {
            context.report({
              node: argument,
              messageId: "noConditionalReturn"
            });
          }
        }
      }
      functionStack.pop();
    };
    return {
      FunctionDeclaration: onFunctionEnter,
      FunctionExpression: onFunctionEnter,
      ArrowFunctionExpression: onFunctionEnter,
      "FunctionDeclaration:exit": onFunctionExit,
      "FunctionExpression:exit": onFunctionExit,
      "ArrowFunctionExpression:exit": onFunctionExit,
      JSXElement() {
        if (functionStack.length) {
          currentFunction().isComponent = true;
        }
      },
      JSXFragment() {
        if (functionStack.length) {
          currentFunction().isComponent = true;
        }
      },
      ReturnStatement(node) {
        if (functionStack.length && node !== currentFunction().lastReturn) {
          currentFunction().earlyReturns.push(node);
        }
      }
    };
  }
};

// packages/plugin-solid/src/utils/jsx.ts
var HTML_TAGS = new Set([
  "a",
  "abbr",
  "address",
  "article",
  "aside",
  "audio",
  "b",
  "blockquote",
  "body",
  "br",
  "button",
  "canvas",
  "caption",
  "code",
  "col",
  "colgroup",
  "data",
  "datalist",
  "dd",
  "details",
  "dialog",
  "div",
  "dl",
  "dt",
  "em",
  "fieldset",
  "figcaption",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "head",
  "header",
  "hr",
  "html",
  "i",
  "iframe",
  "img",
  "input",
  "label",
  "legend",
  "li",
  "link",
  "main",
  "meta",
  "nav",
  "ol",
  "option",
  "p",
  "pre",
  "script",
  "section",
  "select",
  "small",
  "span",
  "strong",
  "style",
  "svg",
  "table",
  "tbody",
  "td",
  "template",
  "textarea",
  "tfoot",
  "th",
  "thead",
  "time",
  "title",
  "tr",
  "u",
  "ul",
  "video"
]);
function isDOMElementName(name) {
  return HTML_TAGS.has(name) || /^[a-z]/.test(name);
}
function isJSXElementOrFragment(node) {
  return node?.type === "JSXElement" || node?.type === "JSXFragment";
}
function jsxPropName(prop) {
  if (prop?.name?.type === "JSXNamespacedName") {
    return `${prop.name.namespace.name}:${prop.name.name.name}`;
  }
  return prop?.name?.name ?? "";
}
function* jsxGetAllProps(props) {
  for (const attr of props ?? []) {
    if (attr?.type === "JSXSpreadAttribute" && attr.argument?.type === "ObjectExpression") {
      for (const property of attr.argument.properties ?? []) {
        if (property?.type === "Property") {
          if (property.key?.type === "Identifier") {
            yield [property.key.name, property.key];
          } else if (property.key?.type === "Literal") {
            yield [String(property.key.value), property.key];
          }
        }
      }
    } else if (attr?.type === "JSXAttribute") {
      yield [jsxPropName(attr), attr.name];
    }
  }
}
function jsxHasProp(props, prop) {
  for (const [name] of jsxGetAllProps(props)) {
    if (name === prop) {
      return true;
    }
  }
  return false;
}
function jsxGetProp(props, prop) {
  return (props ?? []).find((attribute) => attribute?.type !== "JSXSpreadAttribute" && prop === jsxPropName(attribute));
}

// packages/plugin-solid/src/rules/event-handlers.ts
var COMMON_EVENTS = [
  "onAnimationEnd",
  "onAnimationIteration",
  "onAnimationStart",
  "onBeforeInput",
  "onBlur",
  "onChange",
  "onClick",
  "onContextMenu",
  "onCopy",
  "onCut",
  "onDblClick",
  "onDrag",
  "onDragEnd",
  "onDragEnter",
  "onDragExit",
  "onDragLeave",
  "onDragOver",
  "onDragStart",
  "onDrop",
  "onError",
  "onFocus",
  "onFocusIn",
  "onFocusOut",
  "onGotPointerCapture",
  "onInput",
  "onInvalid",
  "onKeyDown",
  "onKeyPress",
  "onKeyUp",
  "onLoad",
  "onLostPointerCapture",
  "onMouseDown",
  "onMouseEnter",
  "onMouseLeave",
  "onMouseMove",
  "onMouseOut",
  "onMouseOver",
  "onMouseUp",
  "onPaste",
  "onPointerCancel",
  "onPointerDown",
  "onPointerEnter",
  "onPointerLeave",
  "onPointerMove",
  "onPointerOut",
  "onPointerOver",
  "onPointerUp",
  "onReset",
  "onScroll",
  "onSelect",
  "onSubmit",
  "onToggle",
  "onTouchCancel",
  "onTouchEnd",
  "onTouchMove",
  "onTouchStart",
  "onTransitionEnd",
  "onWheel"
];
var COMMON_EVENTS_MAP = new Map;
for (const event of COMMON_EVENTS) {
  COMMON_EVENTS_MAP.set(event.toLowerCase(), event);
}
var NONSTANDARD_EVENTS_MAP = {
  ondoubleclick: "onDblClick"
};
function getStaticValue(node, scope) {
  if (!node)
    return null;
  if (node.type === "Literal")
    return { value: node.value };
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return { value: node.quasis[0]?.value?.cooked ?? null };
  }
  if (node.type === "Identifier" && scope) {
    const variable = scope.set?.get?.(node.name);
    const def = variable?.defs?.[0];
    if (def?.node?.type === "VariableDeclarator" && def.node.parent?.kind === "const" && def.node.init) {
      return getStaticValue(def.node.init, scope);
    }
  }
  return null;
}
var event_handlers_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce naming DOM element event handlers consistently and prevent Solid's analysis from misunderstanding whether a prop should be an event handler.",
      recommended: "error"
    },
    fixable: "code",
    hasSuggestions: true,
    schema: [
      {
        type: "object",
        properties: {
          ignoreCase: {
            type: "boolean",
            description: "if true, don't warn on ambiguously named event handlers like `onclick` or `onchange`",
            default: false
          },
          warnOnSpread: {
            type: "boolean",
            description: "if true, warn when spreading event handlers onto JSX. Enable for Solid < v1.6.",
            default: false
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      "detected-attr": 'The {{name}} prop is named as an event handler (starts with "on"), but Solid knows its value ({{staticValue}}) is a string or number, so it will be treated as an attribute. If this is intentional, name this prop attr:{{name}}.',
      naming: "The {{name}} prop is ambiguous. If it is an event handler, change it to {{handlerName}}. If it is an attribute, change it to {{attrName}}.",
      capitalization: "The {{name}} prop should be renamed to {{fixedName}} for readability.",
      nonstandard: "The {{name}} prop should be renamed to {{fixedName}}, because it's not a standard event handler.",
      "make-handler": "Change the {{name}} prop to {{handlerName}}.",
      "make-attr": "Change the {{name}} prop to {{attrName}}.",
      "spread-handler": "The {{name}} prop should be added as a JSX attribute, not spread in. Solid doesn't add listeners when spreading into JSX."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    return {
      JSXAttribute(node) {
        const openingElement = node.parent;
        if (openingElement?.name?.type !== "JSXIdentifier" || !isDOMElementName(openingElement.name.name)) {
          return;
        }
        if (node.name?.type === "JSXNamespacedName") {
          return;
        }
        const { name } = node.name ?? {};
        if (!name || !/^on[a-zA-Z]/.test(name)) {
          return;
        }
        let staticValue = null;
        if (node.value?.type === "JSXExpressionContainer" && node.value.expression.type !== "JSXEmptyExpression" && node.value.expression.type !== "ArrayExpression" && (staticValue = getStaticValue(node.value.expression, context.sourceCode?.getScope?.(node))) !== null && (typeof staticValue.value === "string" || typeof staticValue.value === "number")) {
          context.report({
            node,
            messageId: "detected-attr",
            data: { name, staticValue: staticValue.value }
          });
        } else if (node.value === null || node.value?.type === "Literal") {
          context.report({
            node,
            messageId: "detected-attr",
            data: { name, staticValue: node.value !== null ? node.value.value : true }
          });
        } else if (!context.options[0]?.ignoreCase) {
          const lowercaseHandlerName = name.toLowerCase();
          if (NONSTANDARD_EVENTS_MAP[lowercaseHandlerName]) {
            const fixedName = NONSTANDARD_EVENTS_MAP[lowercaseHandlerName];
            context.report({
              node: node.name,
              messageId: "nonstandard",
              data: { name, fixedName },
              fix: (fixer) => fixer.replaceText(node.name, fixedName)
            });
          } else if (COMMON_EVENTS_MAP.has(lowercaseHandlerName)) {
            const fixedName = COMMON_EVENTS_MAP.get(lowercaseHandlerName);
            if (fixedName !== name) {
              context.report({
                node: node.name,
                messageId: "capitalization",
                data: { name, fixedName },
                fix: (fixer) => fixer.replaceText(node.name, fixedName)
              });
            }
          } else if (name[2] === name[2].toLowerCase()) {
            const handlerName = `on${name[2].toUpperCase()}${name.slice(3)}`;
            const attrName = `attr:${name}`;
            context.report({
              node: node.name,
              messageId: "naming",
              data: { name, attrName, handlerName },
              suggest: [
                {
                  messageId: "make-handler",
                  data: { name, handlerName },
                  fix: (fixer) => fixer.replaceText(node.name, handlerName)
                },
                {
                  messageId: "make-attr",
                  data: { name, attrName },
                  fix: (fixer) => fixer.replaceText(node.name, attrName)
                }
              ]
            });
          }
        }
      },
      Property(node) {
        if (context.options[0]?.warnOnSpread && node.parent?.type === "ObjectExpression" && node.parent.parent?.type === "JSXSpreadAttribute" && node.parent.parent.parent?.type === "JSXOpeningElement") {
          const openingElement = node.parent.parent.parent;
          if (openingElement.name?.type === "JSXIdentifier" && isDOMElementName(openingElement.name.name)) {
            if (node.key?.type === "Identifier" && /^on/.test(node.key.name)) {
              const handlerName = node.key.name;
              context.report({
                node,
                messageId: "spread-handler",
                data: { name: node.key.name },
                *fix(fixer) {
                  const commaAfter = context.sourceCode.getTokenAfter(node);
                  yield fixer.remove(node.parent.properties.length === 1 ? node.parent.parent : node);
                  if (commaAfter?.value === ",") {
                    yield fixer.remove(commaAfter);
                  }
                  yield fixer.insertTextAfter(node.parent.parent, ` ${handlerName}={${context.sourceCode.getText(node.value)}}`);
                }
              });
            }
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/imports.ts
var primitiveMap = new Map;
for (const p of [
  "createSignal",
  "createEffect",
  "createMemo",
  "createResource",
  "onMount",
  "onCleanup",
  "onError",
  "untrack",
  "batch",
  "on",
  "createRoot",
  "getOwner",
  "runWithOwner",
  "mergeProps",
  "splitProps",
  "useTransition",
  "observable",
  "from",
  "mapArray",
  "indexArray",
  "createContext",
  "useContext",
  "children",
  "lazy",
  "createUniqueId",
  "createDeferred",
  "createRenderEffect",
  "createComputed",
  "createReaction",
  "createSelector",
  "DEV",
  "For",
  "Show",
  "Switch",
  "Match",
  "Index",
  "ErrorBoundary",
  "Suspense",
  "SuspenseList"
])
  primitiveMap.set(p, "solid-js");
for (const p of [
  "Portal",
  "render",
  "hydrate",
  "renderToString",
  "renderToStream",
  "isServer",
  "renderToStringAsync",
  "generateHydrationScript",
  "HydrationScript",
  "Dynamic"
])
  primitiveMap.set(p, "solid-js/web");
for (const p of [
  "createStore",
  "produce",
  "reconcile",
  "unwrap",
  "createMutable",
  "modifyMutable"
])
  primitiveMap.set(p, "solid-js/store");
var typeMap = new Map;
for (const t of [
  "Signal",
  "Accessor",
  "Setter",
  "Resource",
  "ResourceActions",
  "ResourceOptions",
  "ResourceReturn",
  "ResourceFetcher",
  "InitializedResourceReturn",
  "Component",
  "VoidProps",
  "VoidComponent",
  "ParentProps",
  "ParentComponent",
  "FlowProps",
  "FlowComponent",
  "ValidComponent",
  "ComponentProps",
  "Ref",
  "MergeProps",
  "SplitPrips",
  "Context",
  "JSX",
  "ResolvedChildren",
  "MatchProps"
])
  typeMap.set(t, "solid-js");
for (const t of ["MountableElement"])
  typeMap.set(t, "solid-js/web");
for (const t of ["StoreNode", "Store", "SetStoreFunction"])
  typeMap.set(t, "solid-js/store");
var sourceRegex = /^solid-js(?:\/web|\/store)?$/;
var isSource = (source) => sourceRegex.test(source);
var imports_default = {
  meta: {
    type: "suggestion",
    docs: {
      description: 'Enforce consistent imports from "solid-js", "solid-js/web", and "solid-js/store".',
      recommended: "error"
    },
    fixable: "code",
    schema: [],
    messages: {
      "prefer-source": 'Prefer importing {{name}} from "{{source}}".'
    }
  },
  defaultOptions: [],
  createOnce(context) {
    return {
      ImportDeclaration(node) {
        const source = node.source?.value;
        if (!isSource(source))
          return;
        for (const specifier of node.specifiers ?? []) {
          if (specifier.type === "ImportSpecifier") {
            const isType = specifier.importKind === "type" || node.importKind === "type";
            const map = isType ? typeMap : primitiveMap;
            const correctSource = map.get(specifier.imported?.name);
            if (correctSource != null && correctSource !== source) {
              context.report({
                node: specifier,
                messageId: "prefer-source",
                data: { name: specifier.imported.name, source: correctSource },
                fix(fixer) {
                  const sourceCode = context.sourceCode;
                  const program = sourceCode.ast;
                  const correctDeclaration = program.body.find((n) => n.type === "ImportDeclaration" && n.source?.value === correctSource);
                  const specText = sourceCode.getText(specifier);
                  if (correctDeclaration) {
                    const lastSpecifier = correctDeclaration.specifiers[correctDeclaration.specifiers.length - 1];
                    const removeResult2 = removeSpecifierFromNode(fixer, sourceCode, specifier, node);
                    if (!removeResult2)
                      return null;
                    return [
                      removeResult2,
                      fixer.insertTextAfter(lastSpecifier, `, ${specText}`)
                    ];
                  }
                  const firstSolidDecl = program.body.find((n) => n.type === "ImportDeclaration" && isSource(n.source?.value));
                  const removeResult = removeSpecifierFromNode(fixer, sourceCode, specifier, node);
                  if (!removeResult)
                    return null;
                  const importKind = isType ? "type " : "";
                  const newImport = `import ${importKind}{ ${specText} } from "${correctSource}";
`;
                  return [
                    removeResult,
                    firstSolidDecl ? fixer.insertTextBefore(firstSolidDecl, newImport) : fixer.insertTextBeforeRange([0, 0], newImport)
                  ];
                }
              });
            }
          }
        }
      }
    };
  }
};
function removeSpecifierFromNode(fixer, sourceCode, specifier, declaration) {
  const specifiers = declaration.specifiers ?? [];
  if (specifiers.length === 1) {
    return fixer.remove(declaration);
  }
  const index = specifiers.indexOf(specifier);
  if (index === specifiers.length - 1) {
    const tokenBefore = sourceCode.getTokenBefore(specifier);
    return fixer.removeRange([tokenBefore.range[0], specifier.range[1]]);
  }
  const tokenAfter = sourceCode.getTokenAfter(specifier);
  return fixer.removeRange([specifier.range[0], tokenAfter.range[1]]);
}

// packages/plugin-solid/src/rules/jsx-no-duplicate-props.ts
var jsx_no_duplicate_props_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow passing the same prop twice in JSX.",
      recommended: "error"
    },
    schema: [
      {
        type: "object",
        properties: {
          ignoreCase: {
            type: "boolean",
            description: "Consider two prop names differing only by case to be the same.",
            default: false
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      noDuplicateProps: "Duplicate props are not allowed.",
      noDuplicateClass: "Duplicate `class` props are not allowed; while it might seem to work, it can break unexpectedly. Use `classList` instead.",
      noDuplicateChildren: "Using {{used}} at the same time is not allowed."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    return {
      JSXOpeningElement(node) {
        const ignoreCase = context.options[0]?.ignoreCase ?? false;
        const props = new Set;
        const checkPropName = (name, propNode) => {
          let normalizedName = name;
          if (ignoreCase || name.startsWith("on")) {
            normalizedName = name.toLowerCase().replace(/^on(?:capture)?:/, "on").replace(/^(?:attr|prop):/, "");
          }
          if (props.has(normalizedName)) {
            context.report({
              node: propNode,
              messageId: normalizedName === "class" ? "noDuplicateClass" : "noDuplicateProps"
            });
          }
          props.add(normalizedName);
        };
        for (const [name, propNode] of jsxGetAllProps(node.attributes ?? [])) {
          checkPropName(name, propNode);
        }
        const hasChildrenProp = props.has("children");
        const hasChildren = (node.parent?.children?.length ?? 0) > 0;
        const hasInnerHTML = props.has("innerHTML") || props.has("innerhtml");
        const hasTextContent = props.has("textContent") || props.has("textcontent");
        const used = [
          hasChildrenProp && "`props.children`",
          hasChildren && "JSX children",
          hasInnerHTML && "`props.innerHTML`",
          hasTextContent && "`props.textContent`"
        ].filter(Boolean);
        if (used.length > 1) {
          context.report({
            node,
            messageId: "noDuplicateChildren",
            data: { used: used.join(", ") }
          });
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/jsx-no-script-url.ts
var isJavaScriptProtocol = /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i;
function getStaticStringValue(node, scope) {
  if (!node)
    return null;
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? null;
  }
  if (node.type === "Identifier" && scope) {
    const variable = scope.set?.get?.(node.name);
    const def = variable?.defs?.[0];
    if (def?.node?.type === "VariableDeclarator" && def.node.parent?.kind === "const" && def.node.init) {
      return getStaticStringValue(def.node.init, scope);
    }
  }
  return null;
}
var jsx_no_script_url_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow javascript: URLs.",
      recommended: "error"
    },
    schema: [],
    messages: {
      noJSURL: "For security, don't use javascript: URLs. Use event handlers instead if you can."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    return {
      JSXAttribute(node) {
        if (node.name?.type === "JSXIdentifier" && node.value) {
          const valueNode = node.value.type === "JSXExpressionContainer" ? node.value.expression : node.value;
          const scope = context.sourceCode?.getScope?.(node);
          const link = getStaticStringValue(valueNode, scope);
          if (typeof link === "string" && isJavaScriptProtocol.test(link)) {
            context.report({
              node: node.value,
              messageId: "noJSURL"
            });
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/jsx-no-undef.ts
var AUTO_COMPONENTS = ["Show", "For", "Index", "Switch", "Match"];
var SOURCE_MODULE = "solid-js";
var formatList = (strings) => {
  if (strings.length === 0)
    return "";
  if (strings.length === 1)
    return `'${strings[0]}'`;
  if (strings.length === 2)
    return `'${strings[0]}' and '${strings[1]}'`;
  const last = strings.length - 1;
  return `${strings.slice(0, last).map((s) => `'${s}'`).join(", ")}, and '${strings[last]}'`;
};
function getCommentBefore(node, sourceCode) {
  return sourceCode.getCommentsBefore(node).find((comment) => comment.loc.end.line >= node.loc.start.line - 1);
}
function appendImports(fixer, sourceCode, importNode, identifiers) {
  const identifiersString = identifiers.join(", ");
  const reversedSpecifiers = importNode.specifiers.slice().reverse();
  const lastSpecifier = reversedSpecifiers.find((s) => s.type === "ImportSpecifier");
  if (lastSpecifier) {
    return fixer.insertTextAfter(lastSpecifier, `, ${identifiersString}`);
  }
  const otherSpecifier = importNode.specifiers.find((s) => s.type === "ImportDefaultSpecifier" || s.type === "ImportNamespaceSpecifier");
  if (otherSpecifier) {
    return fixer.insertTextAfter(otherSpecifier, `, { ${identifiersString} }`);
  }
  if (importNode.specifiers.length === 0) {
    const [importToken, maybeBrace] = sourceCode.getFirstTokens(importNode, { count: 2 });
    if (maybeBrace?.value === "{") {
      return fixer.insertTextAfter(maybeBrace, ` ${identifiersString} `);
    } else {
      return importToken ? fixer.insertTextAfter(importToken, ` { ${identifiersString} } from`) : null;
    }
  }
  return null;
}
function insertImports(fixer, sourceCode, source, identifiers) {
  const identifiersString = identifiers.join(", ");
  const programNode = sourceCode.ast;
  const firstImport = programNode.body.find((n) => n.type === "ImportDeclaration");
  if (firstImport) {
    return fixer.insertTextBeforeRange((getCommentBefore(firstImport, sourceCode) ?? firstImport).range, `import { ${identifiersString} } from "${source}";
`);
  }
  return fixer.insertTextBeforeRange([0, 0], `import { ${identifiersString} } from "${source}";
`);
}
var jsx_no_undef_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow references to undefined variables in JSX. Handles custom directives.",
      url: "https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/jsx-no-undef.md"
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          allowGlobals: {
            type: "boolean",
            description: "When true, the rule will consider the global scope when checking for defined components.",
            default: false
          },
          autoImport: {
            type: "boolean",
            description: 'Automatically import certain components from `"solid-js"` if they are undefined.',
            default: true
          },
          typescriptEnabled: {
            type: "boolean",
            description: "Adjusts behavior not to conflict with TypeScript's type checking.",
            default: false
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      undefined: "'{{identifier}}' is not defined.",
      customDirectiveUndefined: "Custom directive '{{identifier}}' is not defined.",
      autoImport: "{{imports}} should be imported from '{{source}}'."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    const missingComponentsSet = new Set;
    function checkIdentifierInJSX(node, opts = {}) {
      let scope = context.sourceCode?.getScope?.(node);
      if (!scope)
        return;
      const sourceCode = context.sourceCode;
      const sourceType = sourceCode.ast.sourceType;
      const scopeUpperBound = !(context.options?.[0]?.allowGlobals ?? false) && sourceType === "module" ? "module" : "global";
      const variables = [...scope.variables];
      if (node.name === "this")
        return;
      while (scope.type !== scopeUpperBound && scope.type !== "global" && scope.upper) {
        scope = scope.upper;
        variables.push(...scope.variables);
      }
      if (scope.childScopes.length) {
        variables.push(...scope.childScopes[0].variables);
        if (scope.childScopes[0].childScopes.length) {
          variables.push(...scope.childScopes[0].childScopes[0].variables);
        }
      }
      if (variables.find((variable) => variable.name === node.name)) {
        return;
      }
      if (opts.isComponent && context.options?.[0]?.autoImport !== false && AUTO_COMPONENTS.includes(node.name) && !missingComponentsSet.has(node.name)) {
        missingComponentsSet.add(node.name);
      } else if (opts.isCustomDirective) {
        context.report({
          node,
          messageId: "customDirectiveUndefined",
          data: { identifier: node.name }
        });
      } else if (!(context.options?.[0]?.typescriptEnabled ?? false)) {
        context.report({
          node,
          messageId: "undefined",
          data: { identifier: node.name }
        });
      }
    }
    return {
      JSXOpeningElement(node) {
        let n;
        switch (node.name.type) {
          case "JSXIdentifier":
            if (!isDOMElementName(node.name.name)) {
              checkIdentifierInJSX(node.name, { isComponent: true });
            }
            break;
          case "JSXMemberExpression":
            n = node.name;
            do {
              n = n.object;
            } while (n && n.type !== "JSXIdentifier");
            if (n) {
              checkIdentifierInJSX(n);
            }
            break;
          default:
            break;
        }
      },
      "JSXAttribute > JSXNamespacedName": (node) => {
        if (node.namespace?.type === "JSXIdentifier" && node.namespace.name === "use" && node.name?.type === "JSXIdentifier") {
          checkIdentifierInJSX(node.name, { isCustomDirective: true });
        }
      },
      "Program:exit": (programNode) => {
        const missingComponents = Array.from(missingComponentsSet.values());
        if (context.options?.[0]?.autoImport !== false && missingComponents.length) {
          const importNode = programNode.body.find((n) => n.type === "ImportDeclaration" && n.importKind !== "type" && n.source.type === "Literal" && n.source.value === SOURCE_MODULE);
          if (importNode) {
            context.report({
              node: importNode,
              messageId: "autoImport",
              data: {
                imports: formatList(missingComponents),
                source: SOURCE_MODULE
              },
              fix: (fixer) => {
                return appendImports(fixer, context.sourceCode, importNode, missingComponents);
              }
            });
          } else {
            context.report({
              node: programNode,
              messageId: "autoImport",
              data: {
                imports: formatList(missingComponents),
                source: SOURCE_MODULE
              },
              fix: (fixer) => {
                return insertImports(fixer, context.sourceCode, "solid-js", missingComponents);
              }
            });
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/jsx-uses-vars.ts
var jsx_uses_vars_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Prevent variables used in JSX from being marked as unused.",
      recommended: "error"
    },
    schema: [],
    messages: {}
  },
  defaultOptions: [],
  createOnce(context) {
    const markUsed = (name, node) => {
      context.sourceCode?.markVariableAsUsed?.(name, node);
    };
    return {
      JSXOpeningElement(node) {
        switch (node.name?.type) {
          case "JSXNamespacedName":
            return;
          case "JSXIdentifier":
            markUsed(node.name.name, node.name);
            break;
          case "JSXMemberExpression": {
            let parent = node.name.object;
            while (parent?.type === "JSXMemberExpression") {
              parent = parent.object;
            }
            if (parent?.type === "JSXIdentifier") {
              markUsed(parent.name, parent);
            }
            break;
          }
        }
      },
      "JSXAttribute > JSXNamespacedName"(node) {
        if (node.namespace?.type === "JSXIdentifier" && node.namespace.name === "use" && node.name?.type === "JSXIdentifier") {
          markUsed(node.name.name, node.name);
        }
      }
    };
  }
};

// packages/plugin-solid/src/utils/trace.ts
function trace(node, context) {
  let current = node;
  const visited = new Set;
  while (current?.type === "Identifier" && !visited.has(current)) {
    visited.add(current);
    const sourceCode = context.sourceCode ?? context.getSourceCode?.();
    const scope = sourceCode?.getScope?.(current) ?? context.getScope?.();
    const variable = scope?.set?.get?.(current.name);
    const definition = variable?.defs?.[0];
    const declNode = definition?.node;
    if (declNode?.type === "VariableDeclarator" && declNode.id?.type === "Identifier" && declNode.init) {
      const declarationKind = declNode.parent?.kind;
      const isStableConst = declarationKind === "const";
      const isReadonlyRef = variable?.references?.every?.((ref) => ref.init || ref.isReadOnly?.());
      if (isStableConst || isReadonlyRef) {
        current = declNode.init;
        continue;
      }
    }
    break;
  }
  return current;
}

// packages/plugin-solid/src/rules/no-array-handlers.ts
var no_array_handlers_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow usage of type-unsafe event handlers.",
      recommended: "warn"
    },
    schema: [],
    messages: {
      noArrayHandlers: "Passing an array as an event handler is potentially type-unsafe."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    return {
      JSXAttribute(node) {
        const openingElement = node.parent;
        if (openingElement?.name?.type !== "JSXIdentifier" || !isDOMElementName(openingElement.name.name)) {
          return;
        }
        const isNamespacedHandler = node.name?.type === "JSXNamespacedName" && node.name.namespace.name === "on";
        const isNormalEventHandler = node.name?.type === "JSXIdentifier" && /^on[a-zA-Z]/.test(node.name.name);
        if ((isNamespacedHandler || isNormalEventHandler) && node.value?.type === "JSXExpressionContainer" && trace(node.value.expression, context).type === "ArrayExpression") {
          context.report({ node, messageId: "noArrayHandlers" });
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/no-destructure.ts
var getName = (node) => {
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" ? node.value : null;
    case "Identifier":
      return node.name;
    case "AssignmentPattern":
      return getName(node.left);
    default:
      if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
        return node.quasis[0]?.value?.cooked ?? null;
      }
      return null;
  }
};
var getPropertyInfo = (prop) => {
  const valueName = getName(prop.value);
  if (valueName !== null) {
    return {
      real: prop.key,
      var: valueName,
      computed: prop.computed,
      init: prop.value.type === "AssignmentPattern" ? prop.value.right : undefined
    };
  }
  return null;
};
var no_destructure_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow destructuring props. In Solid, props must be used with property accesses (`props.foo`) to preserve reactivity. This rule only tracks destructuring in the parameter list.",
      url: "https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/no-destructure.md"
    },
    fixable: "code",
    schema: [],
    messages: {
      noDestructure: "Destructuring component props breaks Solid's reactivity; use property access instead."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    const functionStack = [];
    const currentFunction = () => functionStack[functionStack.length - 1];
    const onFunctionEnter = () => {
      functionStack.push({ hasJSX: false });
    };
    const onFunctionExit = (node) => {
      if (node.params.length === 1) {
        const props = node.params[0];
        if (props.type === "ObjectPattern" && currentFunction().hasJSX && node.parent?.type !== "JSXExpressionContainer") {
          context.report({
            node: props,
            messageId: "noDestructure",
            fix: (fixer) => fixDestructure(node, props, fixer)
          });
        }
      }
      functionStack.pop();
    };
    function* fixDestructure(func, props, fixer) {
      const propsName = "props";
      const properties = props.properties;
      const propertyInfo = [];
      let rest = null;
      for (const property of properties) {
        if (property.type === "RestElement") {
          rest = property;
        } else {
          const info = getPropertyInfo(property);
          if (info === null)
            continue;
          propertyInfo.push(info);
        }
      }
      const hasDefaults = propertyInfo.some((info) => info.init);
      const origProps = !(hasDefaults || rest) ? propsName : "_" + propsName;
      if (props.typeAnnotation) {
        const range = [props.range[0], props.typeAnnotation.range[0]];
        yield fixer.replaceTextRange(range, origProps);
      } else {
        yield fixer.replaceText(props, origProps);
      }
      const sourceCode = context.sourceCode;
      const defaultsObjectString = () => propertyInfo.filter((info) => info.init).map((info) => `${info.computed ? "[" : ""}${sourceCode.getText(info.real)}${info.computed ? "]" : ""}: ${sourceCode.getText(info.init)}`).join(", ");
      const splitPropsArray = () => `[${propertyInfo.map((info) => info.real.type === "Identifier" ? JSON.stringify(info.real.name) : sourceCode.getText(info.real)).join(", ")}]`;
      let lineToInsert = "";
      if (hasDefaults && rest) {
        lineToInsert = `  const [${propsName}, ${rest.argument.type === "Identifier" && rest.argument.name || "rest"}] = splitProps(mergeProps({ ${defaultsObjectString()} }, ${origProps}), ${splitPropsArray()});`;
      } else if (hasDefaults) {
        lineToInsert = `  const ${propsName} = mergeProps({ ${defaultsObjectString()} }, ${origProps});
`;
      } else if (rest) {
        lineToInsert = `  const [${propsName}, ${rest.argument.type === "Identifier" && rest.argument.name || "rest"}] = splitProps(${origProps}, ${splitPropsArray()});
`;
      }
      if (lineToInsert) {
        const body = func.body;
        if (body.type === "BlockStatement") {
          if (body.body.length > 0) {
            yield fixer.insertTextBefore(body.body[0], lineToInsert);
          }
        } else {
          const maybeOpenParen = sourceCode.getTokenBefore(body);
          if (maybeOpenParen?.value === "(") {
            yield fixer.remove(maybeOpenParen);
          }
          const maybeCloseParen = sourceCode.getTokenAfter(body);
          if (maybeCloseParen?.value === ")") {
            yield fixer.remove(maybeCloseParen);
          }
          yield fixer.insertTextBefore(body, `{
${lineToInsert}  return (`);
          yield fixer.insertTextAfter(body, `);
}`);
        }
      }
      const scope = sourceCode.scopeManager?.acquire(func);
      if (scope) {
        for (const [info, variable] of propertyInfo.map((info2) => [info2, scope.set.get(info2.var)])) {
          if (variable) {
            for (const reference of variable.references) {
              if (reference.isReadOnly()) {
                const access = info.real.type === "Identifier" && !info.computed ? `.${info.real.name}` : `[${sourceCode.getText(info.real)}]`;
                yield fixer.replaceText(reference.identifier, `${propsName}${access}`);
              }
            }
          }
        }
      }
    }
    return {
      FunctionDeclaration: onFunctionEnter,
      FunctionExpression: onFunctionEnter,
      ArrowFunctionExpression: onFunctionEnter,
      "FunctionDeclaration:exit": onFunctionExit,
      "FunctionExpression:exit": onFunctionExit,
      "ArrowFunctionExpression:exit": onFunctionExit,
      JSXElement() {
        if (functionStack.length) {
          currentFunction().hasJSX = true;
        }
      },
      JSXFragment() {
        if (functionStack.length) {
          currentFunction().hasJSX = true;
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/no-innerhtml.ts
function isHtmlLike(str) {
  return /<[a-z][\s\S]*>/i.test(str.trim());
}
function getStringIfConstant(node) {
  if (!node)
    return null;
  if (node.type === "Literal" && typeof node.value === "string")
    return node.value;
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked ?? null;
  }
  return null;
}
var no_innerhtml_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow usage of the innerHTML attribute, which can often lead to security vulnerabilities.",
      recommended: "error"
    },
    fixable: "code",
    hasSuggestions: true,
    schema: [
      {
        type: "object",
        properties: {
          allowStatic: {
            description: "if the innerHTML value is guaranteed to be a static HTML string (i.e. no user input), allow it",
            type: "boolean",
            default: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      dangerous: "The innerHTML attribute is dangerous; passing unsanitized input can lead to security vulnerabilities.",
      conflict: "The innerHTML attribute should not be used on an element with child elements; they will be overwritten.",
      notHtml: "The string passed to innerHTML does not appear to be valid HTML.",
      useInnerText: "For text content, using innerText is clearer and safer.",
      dangerouslySetInnerHTML: "The dangerouslySetInnerHTML prop is not supported; use innerHTML instead."
    }
  },
  defaultOptions: [{ allowStatic: true }],
  createOnce(context) {
    return {
      JSXAttribute(node) {
        const allowStatic = Boolean(context.options?.[0]?.allowStatic ?? true);
        if (jsxPropName(node) === "dangerouslySetInnerHTML") {
          if (node.value?.type === "JSXExpressionContainer" && node.value.expression.type === "ObjectExpression" && node.value.expression.properties.length === 1) {
            const htmlProp = node.value.expression.properties[0];
            if (htmlProp.type === "Property" && htmlProp.key.type === "Identifier" && htmlProp.key.name === "__html") {
              context.report({
                node,
                messageId: "dangerouslySetInnerHTML",
                fix: (fixer) => {
                  const propRange = node.range;
                  const valueRange = htmlProp.value.range;
                  return [
                    fixer.replaceTextRange([propRange[0], valueRange[0]], "innerHTML={"),
                    fixer.replaceTextRange([valueRange[1], propRange[1]], "}")
                  ];
                }
              });
            } else {
              context.report({ node, messageId: "dangerouslySetInnerHTML" });
            }
          } else {
            context.report({ node, messageId: "dangerouslySetInnerHTML" });
          }
          return;
        } else if (jsxPropName(node) !== "innerHTML") {
          return;
        }
        if (allowStatic) {
          const innerHtmlNode = node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
          const innerHtml = innerHtmlNode && getStringIfConstant(innerHtmlNode);
          if (typeof innerHtml === "string") {
            if (isHtmlLike(innerHtml)) {
              if (node.parent?.parent?.type === "JSXElement" && node.parent.parent.children?.length) {
                context.report({
                  node: node.parent.parent,
                  messageId: "conflict"
                });
              }
            } else {
              context.report({
                node,
                messageId: "notHtml",
                suggest: [
                  {
                    fix: (fixer) => fixer.replaceText(node.name, "innerText"),
                    messageId: "useInnerText"
                  }
                ]
              });
            }
          } else {
            context.report({ node, messageId: "dangerous" });
          }
        } else {
          context.report({ node, messageId: "dangerous" });
        }
      }
    };
  }
};

// packages/plugin-solid/src/utils/imports.ts
function trackImports(fromModule = /^solid-js(?:\/?|\b)/) {
  const importMap = new Map;
  return {
    handleImportDeclaration(node) {
      if (node?.type !== "ImportDeclaration" || typeof node.source?.value !== "string") {
        return;
      }
      if (!fromModule.test(node.source.value)) {
        return;
      }
      for (const specifier of node.specifiers ?? []) {
        if (specifier?.type === "ImportSpecifier" && specifier.imported?.type === "Identifier" && specifier.local?.type === "Identifier") {
          importMap.set(specifier.imported.name, specifier.local.name);
        }
      }
    },
    matchImport(imports, localName) {
      const candidates = Array.isArray(imports) ? imports : [imports];
      return candidates.find((importName) => importMap.get(importName) === localName);
    },
    clear() {
      importMap.clear();
    }
  };
}

// packages/plugin-solid/src/rules/no-proxy-apis.ts
function isFunctionNode(node) {
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node?.type);
}
function isPropsByName(name) {
  return /^(?:props|_props)$/.test(name);
}
var no_proxy_apis_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow usage of APIs that use ES6 Proxies, only to target environments that don't support them.",
      recommended: "warn"
    },
    schema: [],
    messages: {
      noStore: "Solid Store APIs use Proxies, which are incompatible with your target environment.",
      spreadCall: "Using a function call in JSX spread makes Solid use Proxies, which are incompatible with your target environment.",
      spreadMember: "Using a property access in JSX spread makes Solid use Proxies, which are incompatible with your target environment.",
      proxyLiteral: "Proxies are incompatible with your target environment.",
      mergeProps: "If you pass a function to `mergeProps`, it will create a Proxy, which are incompatible with your target environment."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    const tracker = trackImports();
    return {
      before() {
        tracker.clear();
      },
      Program() {
        tracker.clear();
      },
      ImportDeclaration(node) {
        tracker.handleImportDeclaration(node);
        if (node.source?.value === "solid-js/store") {
          context.report({ node, messageId: "noStore" });
        }
      },
      "JSXSpreadAttribute MemberExpression"(node) {
        context.report({ node, messageId: "spreadMember" });
      },
      "JSXSpreadAttribute CallExpression"(node) {
        context.report({ node, messageId: "spreadCall" });
      },
      CallExpression(node) {
        if (node.callee?.type === "Identifier") {
          if (tracker.matchImport("mergeProps", node.callee.name)) {
            (node.arguments ?? []).filter((arg) => {
              if (arg.type === "SpreadElement")
                return true;
              const traced = trace(arg, context);
              return traced.type === "Identifier" && !isPropsByName(traced.name) || isFunctionNode(traced);
            }).forEach((badArg) => {
              context.report({ node: badArg, messageId: "mergeProps" });
            });
          }
        } else if (node.callee?.type === "MemberExpression") {
          if (node.callee.object?.type === "Identifier" && node.callee.object.name === "Proxy" && node.callee.property?.type === "Identifier" && node.callee.property.name === "revocable") {
            context.report({ node, messageId: "proxyLiteral" });
          }
        }
      },
      NewExpression(node) {
        if (node.callee?.type === "Identifier" && node.callee.name === "Proxy") {
          context.report({ node, messageId: "proxyLiteral" });
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/no-react-deps.ts
function isFunctionNode2(node) {
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node?.type);
}
var no_react_deps_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow usage of dependency arrays in `createEffect` and `createMemo`.",
      recommended: "error"
    },
    fixable: "code",
    schema: [],
    messages: {
      noUselessDep: "In Solid, `{{name}}` doesn't accept a dependency array because it automatically tracks its dependencies. If you really need to override the list of dependencies, use `on`."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    const tracker = trackImports();
    return {
      before() {
        tracker.clear();
      },
      Program() {
        tracker.clear();
      },
      ImportDeclaration(node) {
        tracker.handleImportDeclaration(node);
      },
      CallExpression(node) {
        if (node.callee?.type === "Identifier" && tracker.matchImport(["createEffect", "createMemo"], node.callee.name) && node.arguments?.length === 2 && node.arguments.every((arg) => arg.type !== "SpreadElement")) {
          const [arg0, arg1] = node.arguments.map((arg) => trace(arg, context));
          if (isFunctionNode2(arg0) && arg0.params.length === 0 && arg1.type === "ArrayExpression") {
            context.report({
              node: node.arguments[1],
              messageId: "noUselessDep",
              data: { name: node.callee.name },
              fix: arg1 === node.arguments[1] ? (fixer) => fixer.remove(arg1) : undefined
            });
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/no-react-specific-props.ts
var reactSpecificProps = [
  { from: "className", to: "class" },
  { from: "htmlFor", to: "for" }
];
var no_react_specific_props_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow usage of React-specific `className`/`htmlFor` props, which were deprecated in v1.4.0.",
      recommended: "error"
    },
    fixable: "code",
    schema: [],
    messages: {
      prefer: "Prefer the `{{ to }}` prop over the deprecated `{{ from }}` prop.",
      noUselessKey: "Elements in a <For> or <Index> list do not need a key prop."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    return {
      JSXOpeningElement(node) {
        for (const { from, to } of reactSpecificProps) {
          const classNameAttribute = jsxGetProp(node.attributes ?? [], from);
          if (classNameAttribute) {
            const fix = !jsxHasProp(node.attributes ?? [], to) ? (fixer) => fixer.replaceText(classNameAttribute.name, to) : undefined;
            context.report({
              node: classNameAttribute,
              messageId: "prefer",
              data: { from, to },
              fix
            });
          }
        }
        if (node.name?.type === "JSXIdentifier" && isDOMElementName(node.name.name)) {
          const keyProp = jsxGetProp(node.attributes ?? [], "key");
          if (keyProp) {
            context.report({
              node: keyProp,
              messageId: "noUselessKey",
              fix: (fixer) => fixer.remove(keyProp)
            });
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/no-unknown-namespaces.ts
var knownNamespaces = ["on", "oncapture", "use", "prop", "attr", "bool"];
var styleNamespaces = ["style", "class"];
var otherNamespaces = ["xmlns", "xlink"];
var no_unknown_namespaces_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce using only Solid-specific namespaced attribute names (i.e. `'on:'` in `<div on:click={...} />`).",
      recommended: "error"
    },
    hasSuggestions: true,
    schema: [
      {
        type: "object",
        properties: {
          allowedNamespaces: {
            description: "an array of additional namespace names to allow",
            type: "array",
            items: { type: "string" },
            default: [],
            minItems: 1,
            uniqueItems: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      unknown: `'{{namespace}}:' is not one of Solid's special prefixes for JSX attributes (${knownNamespaces.map((n) => `'${n}:'`).join(", ")}).`,
      style: "Using the '{{namespace}}:' special prefix is potentially confusing, prefer the '{{namespace}}' prop instead.",
      component: "Namespaced props have no effect on components.",
      "component-suggest": "Replace {{namespace}}:{{name}} with {{name}}."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    return {
      "JSXAttribute > JSXNamespacedName"(node) {
        const explicitlyAllowedNamespaces = context.options?.[0]?.allowedNamespaces;
        const openingElement = node.parent?.parent;
        if (openingElement?.name?.type === "JSXIdentifier" && !isDOMElementName(openingElement.name.name)) {
          context.report({
            node,
            messageId: "component",
            suggest: [
              {
                messageId: "component-suggest",
                data: { namespace: node.namespace.name, name: node.name.name },
                fix: (fixer) => fixer.replaceText(node, node.name.name)
              }
            ]
          });
          return;
        }
        const namespace = node.namespace?.name;
        if (!(knownNamespaces.includes(namespace) || otherNamespaces.includes(namespace) || explicitlyAllowedNamespaces?.includes(namespace))) {
          if (styleNamespaces.includes(namespace)) {
            context.report({
              node,
              messageId: "style",
              data: { namespace }
            });
          } else {
            context.report({
              node,
              messageId: "unknown",
              data: { namespace }
            });
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/prefer-classlist.ts
var prefer_classlist_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce using the classlist prop over importing a classnames helper. The classlist prop accepts an object `{ [class: string]: boolean }` just like classnames.",
      recommended: "warn"
    },
    fixable: "code",
    deprecated: true,
    schema: [
      {
        type: "object",
        properties: {
          classnames: {
            type: "array",
            description: "An array of names to treat as `classnames` functions",
            default: ["cn", "clsx", "classnames"],
            items: { type: "string" },
            minItems: 1,
            uniqueItems: true
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      preferClasslist: "The classlist prop should be used instead of {{ classnames }} to efficiently set classes based on an object."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    return {
      JSXAttribute(node) {
        const classnames = context.options?.[0]?.classnames ?? ["cn", "clsx", "classnames"];
        if (["class", "className"].indexOf(jsxPropName(node)) === -1 || jsxHasProp(node.parent?.attributes ?? [], "classlist")) {
          return;
        }
        if (node.value?.type === "JSXExpressionContainer") {
          const expr = node.value.expression;
          if (expr.type === "CallExpression" && expr.callee?.type === "Identifier" && classnames.indexOf(expr.callee.name) !== -1 && expr.arguments?.length === 1 && expr.arguments[0].type === "ObjectExpression") {
            context.report({
              node,
              messageId: "preferClasslist",
              data: { classnames: expr.callee.name },
              fix: (fixer) => {
                const attrRange = node.range;
                const objectRange = expr.arguments[0].range;
                return [
                  fixer.replaceTextRange([attrRange[0], objectRange[0]], "classlist={"),
                  fixer.replaceTextRange([objectRange[1], attrRange[1]], "}")
                ];
              }
            });
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/prefer-for.ts
function isFunctionNode3(node) {
  return ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"].includes(node?.type);
}
function getPropertyName(memberExpr) {
  if (!memberExpr?.property)
    return null;
  if (!memberExpr.computed && memberExpr.property.type === "Identifier") {
    return memberExpr.property.name;
  }
  if (memberExpr.property.type === "Literal" && typeof memberExpr.property.value === "string") {
    return memberExpr.property.value;
  }
  return null;
}
var prefer_for_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce using Solid's `<For />` component for mapping an array to JSX elements.",
      recommended: "warn"
    },
    fixable: "code",
    schema: [],
    messages: {
      preferFor: "Use Solid's `<For />` component for efficiently rendering lists. Array#map causes DOM elements to be recreated.",
      preferForOrIndex: "Use Solid's `<For />` component or `<Index />` component for rendering lists. Array#map causes DOM elements to be recreated."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    const reportPreferFor = (node) => {
      const jsxExpressionContainerNode = node.parent;
      const arrayNode = node.callee.object;
      const mapFnNode = node.arguments[0];
      context.report({
        node,
        messageId: "preferFor",
        fix: (fixer) => {
          const beforeArray = [
            jsxExpressionContainerNode.range[0],
            arrayNode.range[0]
          ];
          const betweenArrayAndMapFn = [arrayNode.range[1], mapFnNode.range[0]];
          const afterMapFn = [
            mapFnNode.range[1],
            jsxExpressionContainerNode.range[1]
          ];
          return [
            fixer.replaceTextRange(beforeArray, "<For each={"),
            fixer.replaceTextRange(betweenArrayAndMapFn, "}>{"),
            fixer.replaceTextRange(afterMapFn, "}</For>")
          ];
        }
      });
    };
    return {
      CallExpression(node) {
        const callOrChain = node.parent?.type === "ChainExpression" ? node.parent : node;
        if (callOrChain.parent?.type === "JSXExpressionContainer" && isJSXElementOrFragment(callOrChain.parent.parent)) {
          if (node.callee?.type === "MemberExpression" && getPropertyName(node.callee) === "map" && node.arguments?.length === 1 && isFunctionNode3(node.arguments[0])) {
            const mapFnNode = node.arguments[0];
            if (mapFnNode.params.length === 1 && mapFnNode.params[0].type !== "RestElement") {
              reportPreferFor(node);
            } else {
              context.report({ node, messageId: "preferForOrIndex" });
            }
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/prefer-show.ts
var EXPENSIVE_TYPES = ["JSXElement", "JSXFragment", "Identifier"];
var prefer_show_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce using Solid's `<Show />` component for conditionally showing content. Solid's compiler covers this case, so it's a stylistic rule only.",
      recommended: "warn"
    },
    fixable: "code",
    schema: [],
    messages: {
      preferShowAnd: "Use Solid's `<Show />` component for conditionally showing content.",
      preferShowTernary: "Use Solid's `<Show />` component for conditionally showing content with a fallback."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    const putIntoJSX = (node) => {
      const text = context.sourceCode.getText(node);
      return isJSXElementOrFragment(node) ? text : `{${text}}`;
    };
    const logicalExpressionHandler = (node) => {
      if (node.operator === "&&" && EXPENSIVE_TYPES.includes(node.right?.type)) {
        context.report({
          node,
          messageId: "preferShowAnd",
          fix: (fixer) => fixer.replaceText(node.parent?.type === "JSXExpressionContainer" && isJSXElementOrFragment(node.parent.parent) ? node.parent : node, `<Show when={${context.sourceCode.getText(node.left)}}>${putIntoJSX(node.right)}</Show>`)
        });
      }
    };
    const conditionalExpressionHandler = (node) => {
      if (EXPENSIVE_TYPES.includes(node.consequent?.type) || EXPENSIVE_TYPES.includes(node.alternate?.type)) {
        context.report({
          node,
          messageId: "preferShowTernary",
          fix: (fixer) => fixer.replaceText(node.parent?.type === "JSXExpressionContainer" && isJSXElementOrFragment(node.parent.parent) ? node.parent : node, `<Show when={${context.sourceCode.getText(node.test)}} fallback={${context.sourceCode.getText(node.alternate)}}>${putIntoJSX(node.consequent)}</Show>`)
        });
      }
    };
    return {
      JSXExpressionContainer(node) {
        if (!isJSXElementOrFragment(node.parent)) {
          return;
        }
        if (node.expression?.type === "LogicalExpression") {
          logicalExpressionHandler(node.expression);
        } else if (node.expression?.type === "ArrowFunctionExpression" && node.expression.body?.type === "LogicalExpression") {
          logicalExpressionHandler(node.expression.body);
        } else if (node.expression?.type === "ConditionalExpression") {
          conditionalExpressionHandler(node.expression);
        } else if (node.expression?.type === "ArrowFunctionExpression" && node.expression.body?.type === "ConditionalExpression") {
          conditionalExpressionHandler(node.expression.body);
        }
      }
    };
  }
};

// packages/plugin-solid/src/utils/traverse.ts
function find(node, predicate) {
  let current = node;
  while (current) {
    if (predicate(current)) {
      return current;
    }
    current = current.parent;
  }
  return null;
}
function findParent(node, predicate) {
  return node?.parent ? find(node.parent, predicate) : null;
}

// packages/plugin-solid/src/rules/reactivity.ts
var isFunctionNode4 = (node) => !!node && (node.type === "FunctionDeclaration" || node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression");
var isProgramOrFunctionNode = (node) => !!node && (node.type === "Program" || isFunctionNode4(node));
var isPropsByName2 = (name) => /[pP]rops/.test(name);
var getFunctionName2 = (node) => {
  if ((node.type === "FunctionDeclaration" || node.type === "FunctionExpression") && node.id != null) {
    return node.id.name;
  }
  if (node.parent?.type === "VariableDeclarator" && node.parent.id.type === "Identifier") {
    return node.parent.id.name;
  }
  return null;
};
function ignoreTransparentWrappers(node, up = false) {
  if (node.type === "TSAsExpression" || node.type === "TSNonNullExpression" || node.type === "TSSatisfiesExpression") {
    const next = up ? node.parent : node.expression;
    if (next)
      return ignoreTransparentWrappers(next, up);
  }
  return node;
}
function findInScope(node, scope, predicate) {
  let current = node;
  while (current) {
    if (current === scope)
      return predicate(node) ? current : null;
    if (predicate(current))
      return current;
    current = current.parent;
  }
  return null;
}
function findVariable(context, node) {
  const scope = context.sourceCode?.getScope?.(node);
  if (!scope)
    return null;
  let s = scope;
  while (s) {
    const v = s.set?.get?.(node.name);
    if (v)
      return v;
    s = s.upper;
  }
  return null;
}
function getFunctionHeadLoc(node, sourceCode) {
  const parent = node.parent;
  if (node.type === "ArrowFunctionExpression") {
    const arrowToken = sourceCode.getTokenBefore(node.body, (t) => t.value === "=>");
    if (arrowToken) {
      return {
        start: node.loc.start,
        end: arrowToken.loc.end
      };
    }
  }
  if (node.id) {
    return node.id.loc;
  }
  if (parent?.type === "VariableDeclarator" && parent.id?.loc) {
    return parent.id.loc;
  }
  return node.loc;
}
function walkTree(node, enter) {
  let skipped = false;
  const skipFn = () => {
    skipped = true;
  };
  enter(node, skipFn);
  if (skipped)
    return;
  for (const key of Object.keys(node)) {
    if (key === "parent")
      continue;
    const child = node[key];
    if (child && typeof child === "object") {
      if (Array.isArray(child)) {
        for (const item of child) {
          if (item && typeof item.type === "string") {
            walkTree(item, enter);
          }
        }
      } else if (typeof child.type === "string") {
        walkTree(child, enter);
      }
    }
  }
}

class ScopeStackItem {
  node;
  trackedScopes = [];
  unnamedDerivedSignals = new Set;
  hasJSX = false;
  constructor(node) {
    this.node = node;
  }
}

class ScopeStack extends Array {
  currentScope = () => this[this.length - 1];
  parentScope = () => this[this.length - 2];
  pushSignal(variable, declarationScope) {
    if (!declarationScope)
      declarationScope = this.currentScope().node;
    this.signals.push({
      references: variable.references.filter((ref) => !ref.init),
      variable,
      declarationScope
    });
  }
  pushUniqueSignal(variable, declarationScope) {
    const found = this.signals.find((s) => s.variable === variable);
    if (!found) {
      this.pushSignal(variable, declarationScope);
    } else {
      found.declarationScope = this.findDeepest(found.declarationScope, declarationScope);
    }
  }
  pushProps(variable, declarationScope) {
    if (!declarationScope)
      declarationScope = this.currentScope().node;
    this.props.push({
      references: variable.references.filter((ref) => !ref.init),
      variable,
      declarationScope
    });
  }
  syncCallbacks = new Set;
  *consumeSignalReferencesInScope() {
    yield* this.consumeRefs(this.signals);
    this.signals = this.signals.filter((v) => v.references.length !== 0);
  }
  *consumePropsReferencesInScope() {
    yield* this.consumeRefs(this.props);
    this.props = this.props.filter((v) => v.references.length !== 0);
  }
  *consumeRefs(variables) {
    for (const variable of variables) {
      const inScope = [];
      const notInScope = [];
      variable.references.forEach((ref) => {
        if (this.isRefInCurrentScope(ref))
          inScope.push(ref);
        else
          notInScope.push(ref);
      });
      yield* inScope.map((ref) => ({
        reference: ref,
        declarationScope: variable.declarationScope
      }));
      variable.references = notInScope;
    }
  }
  findDeepest(a, b) {
    if (a === b)
      return a;
    for (let i = this.length - 1;i >= 0; i--) {
      const { node } = this[i];
      if (a === node || b === node)
        return node;
    }
    return a;
  }
  isRefInCurrentScope(reference) {
    let parentFn = findParent(reference.identifier, isProgramOrFunctionNode);
    while (isFunctionNode4(parentFn) && this.syncCallbacks.has(parentFn)) {
      parentFn = findParent(parentFn, isProgramOrFunctionNode);
    }
    return parentFn === this.currentScope().node;
  }
  signals = [];
  props = [];
}
var getNthDestructuredVar = (id, n, context) => {
  if (id?.type === "ArrayPattern") {
    const el = id.elements[n];
    if (el?.type === "Identifier")
      return findVariable(context, el);
  }
  return null;
};
var getReturnedVar = (id, context) => {
  if (id.type === "Identifier")
    return findVariable(context, id);
  return null;
};
var reactivity_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Enforce that reactivity (props, signals, memos, etc.) is properly used, so changes in those values will be tracked and update the view as expected.",
      url: "https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/reactivity.md"
    },
    schema: [
      {
        type: "object",
        properties: {
          customReactiveFunctions: {
            description: "List of function names to consider as reactive functions (allow signals to be safely passed as arguments). In addition, any create* or use* functions are automatically included.",
            type: "array",
            items: { type: "string" },
            default: []
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      noWrite: "The reactive variable '{{name}}' should not be reassigned or altered directly.",
      untrackedReactive: "The reactive variable '{{name}}' should be used within JSX, a tracked scope (like createEffect), or inside an event handler function, or else changes will be ignored.",
      expectedFunctionGotExpression: "The reactive variable '{{name}}' should be wrapped in a function for reactivity. This includes event handler bindings on native elements, which are not reactive like other JSX props.",
      badSignal: "The reactive variable '{{name}}' should be called as a function when used in {{where}}.",
      badUnnamedDerivedSignal: "This function should be passed to a tracked scope (like createEffect) or an event handler because it contains reactivity, or else changes will be ignored.",
      shouldDestructure: "For proper analysis, array destructuring should be used to capture the {{nth}}result of this function call.",
      shouldAssign: "For proper analysis, a variable should be used to capture the result of this function call.",
      noAsyncTrackedScope: "This tracked scope should not be async. Solid's reactivity only tracks synchronously."
    }
  },
  defaultOptions: [{ customReactiveFunctions: [] }],
  createOnce(context) {
    const getCustomReactiveFunctions = () => context.options?.[0]?.customReactiveFunctions ?? [];
    const warnShouldDestructure = (node, nth) => context.report({
      node,
      messageId: "shouldDestructure",
      data: nth ? { nth: nth + " " } : undefined
    });
    const warnShouldAssign = (node) => context.report({ node, messageId: "shouldAssign" });
    const scopeStack = new ScopeStack;
    const { currentScope, parentScope } = scopeStack;
    const { matchImport, handleImportDeclaration } = trackImports();
    const markPropsOnCondition = (node, cb) => {
      if (node.params.length === 1 && node.params[0].type === "Identifier" && node.parent?.type !== "JSXExpressionContainer" && node.parent?.type !== "TemplateLiteral" && cb(node.params[0])) {
        const propsParam = findVariable(context, node.params[0]);
        if (propsParam)
          scopeStack.pushProps(propsParam, node);
      }
    };
    const onFunctionEnter = (node) => {
      if (isFunctionNode4(node)) {
        if (scopeStack.syncCallbacks.has(node))
          return;
        markPropsOnCondition(node, (props) => isPropsByName2(props.name));
      }
      scopeStack.push(new ScopeStackItem(node));
    };
    const matchTrackedScope = (trackedScope, node) => {
      switch (trackedScope.expect) {
        case "function":
        case "called-function":
          return node === trackedScope.node;
        case "expression":
          return Boolean(findInScope(node, currentScope().node, (n) => n === trackedScope.node));
      }
    };
    const handleTrackedScopes = (identifier, declarationScope) => {
      const currentScopeNode = currentScope().node;
      if (!currentScope().trackedScopes.find((ts) => matchTrackedScope(ts, identifier))) {
        const matchedExpression = currentScope().trackedScopes.find((ts) => matchTrackedScope({ ...ts, expect: "expression" }, identifier));
        if (declarationScope === currentScopeNode) {
          let parentMemberExpression = null;
          if (identifier.parent?.type === "MemberExpression") {
            parentMemberExpression = identifier.parent;
            while (parentMemberExpression?.parent?.type === "MemberExpression") {
              parentMemberExpression = parentMemberExpression.parent;
            }
          }
          const parentCallExpression = identifier.parent?.type === "CallExpression" ? identifier.parent : null;
          context.report({
            node: parentMemberExpression ?? parentCallExpression ?? identifier,
            messageId: matchedExpression ? "expectedFunctionGotExpression" : "untrackedReactive",
            data: {
              name: parentMemberExpression ? context.sourceCode.getText(parentMemberExpression) : identifier.name
            }
          });
        } else {
          if (!parentScope() || !isFunctionNode4(currentScopeNode))
            return;
          const pushUnnamedDerivedSignal = () => (parentScope().unnamedDerivedSignals ??= new Set).add(currentScopeNode);
          if (currentScopeNode.type === "FunctionDeclaration") {
            const functionVariable = context.sourceCode.scopeManager?.getDeclaredVariables(currentScopeNode)?.[0];
            if (functionVariable) {
              scopeStack.pushUniqueSignal(functionVariable, declarationScope);
            } else {
              pushUnnamedDerivedSignal();
            }
          } else if (currentScopeNode.parent?.type === "VariableDeclarator") {
            const declarator = currentScopeNode.parent;
            const functionVariable = context.sourceCode.scopeManager?.getDeclaredVariables(declarator)?.[0];
            if (functionVariable) {
              scopeStack.pushUniqueSignal(functionVariable, declarationScope);
            } else {
              pushUnnamedDerivedSignal();
            }
          } else if (currentScopeNode.parent?.type === "Property") {} else {
            pushUnnamedDerivedSignal();
          }
        }
      }
    };
    const onFunctionExit = (currentScopeNode) => {
      if (isFunctionNode4(currentScopeNode)) {
        markPropsOnCondition(currentScopeNode, (props) => {
          if (!isPropsByName2(props.name) && currentScope().hasJSX) {
            const functionName = getFunctionName2(currentScopeNode);
            if (functionName && !/^[a-z]/.test(functionName))
              return true;
          }
          return false;
        });
      }
      if (isFunctionNode4(currentScopeNode) && scopeStack.syncCallbacks.has(currentScopeNode)) {
        return;
      }
      for (const { reference, declarationScope } of scopeStack.consumeSignalReferencesInScope()) {
        const identifier = reference.identifier;
        if (reference.isWrite()) {
          context.report({
            node: identifier,
            messageId: "noWrite",
            data: { name: identifier.name }
          });
        } else if (identifier.type === "Identifier") {
          const reportBadSignal = (where) => context.report({
            node: identifier,
            messageId: "badSignal",
            data: { name: identifier.name, where }
          });
          if (identifier.parent?.type === "CallExpression" || identifier.parent?.type === "ArrayExpression" && identifier.parent.parent?.type === "CallExpression") {
            handleTrackedScopes(identifier, declarationScope);
          } else if (identifier.parent?.type === "TemplateLiteral") {
            reportBadSignal("template literals");
          } else if (identifier.parent?.type === "BinaryExpression" && [
            "<",
            "<=",
            ">",
            ">=",
            "<<",
            ">>",
            ">>>",
            "+",
            "-",
            "*",
            "/",
            "%",
            "**",
            "|",
            "^",
            "&",
            "in"
          ].includes(identifier.parent.operator)) {
            reportBadSignal("arithmetic or comparisons");
          } else if (identifier.parent?.type === "UnaryExpression" && ["-", "+", "~"].includes(identifier.parent.operator)) {
            reportBadSignal("unary expressions");
          } else if (identifier.parent?.type === "MemberExpression" && identifier.parent.computed && identifier.parent.property === identifier) {
            reportBadSignal("property accesses");
          } else if (identifier.parent?.type === "JSXExpressionContainer" && !currentScope().trackedScopes.find((ts) => ts.node === identifier && (ts.expect === "function" || ts.expect === "called-function"))) {
            const elementOrAttribute = identifier.parent.parent;
            if (isJSXElementOrFragment(elementOrAttribute) || elementOrAttribute?.type === "JSXAttribute" && elementOrAttribute.parent?.type === "JSXOpeningElement" && elementOrAttribute.parent.name.type === "JSXIdentifier" && isDOMElementName(elementOrAttribute.parent.name.name)) {
              reportBadSignal("JSX");
            }
          }
        }
      }
      for (const { reference, declarationScope } of scopeStack.consumePropsReferencesInScope()) {
        const identifier = reference.identifier;
        if (reference.isWrite()) {
          context.report({
            node: identifier,
            messageId: "noWrite",
            data: { name: identifier.name }
          });
        } else if (identifier.parent?.type === "MemberExpression" && identifier.parent.object === identifier) {
          const { parent } = identifier;
          if (parent.parent?.type === "AssignmentExpression" && parent.parent.left === parent) {
            context.report({
              node: identifier,
              messageId: "noWrite",
              data: { name: identifier.name }
            });
          } else if (parent.property.type === "Identifier" && /^(?:initial|default|static[A-Z])/.test(parent.property.name)) {} else {
            handleTrackedScopes(identifier, declarationScope);
          }
        } else if (identifier.parent?.type === "AssignmentExpression" || identifier.parent?.type === "VariableDeclarator") {
          context.report({
            node: identifier,
            messageId: "untrackedReactive",
            data: { name: identifier.name }
          });
        }
      }
      const { unnamedDerivedSignals } = currentScope();
      if (unnamedDerivedSignals) {
        for (const node of unnamedDerivedSignals) {
          if (!currentScope().trackedScopes.find((ts) => matchTrackedScope(ts, node))) {
            context.report({
              loc: getFunctionHeadLoc(node, context.sourceCode),
              messageId: "badUnnamedDerivedSignal"
            });
          }
        }
      }
      scopeStack.pop();
    };
    const checkForSyncCallbacks = (node) => {
      if (node.arguments.length === 1 && isFunctionNode4(node.arguments[0]) && !node.arguments[0].async) {
        if (node.callee.type === "Identifier" && matchImport(["batch", "produce"], node.callee.name)) {
          scopeStack.syncCallbacks.add(node.arguments[0]);
        } else if (node.callee.type === "MemberExpression" && !node.callee.computed && node.callee.object.type !== "ObjectExpression" && /^(?:forEach|map|flatMap|reduce|reduceRight|find|findIndex|filter|every|some)$/.test(node.callee.property.name)) {
          scopeStack.syncCallbacks.add(node.arguments[0]);
        }
      }
      if (node.callee.type === "Identifier") {
        if (matchImport(["createSignal", "createStore"], node.callee.name) && node.parent?.type === "VariableDeclarator") {
          const setter = getNthDestructuredVar(node.parent.id, 1, context);
          if (setter) {
            for (const reference of setter.references) {
              const { identifier } = reference;
              if (!reference.init && reference.isRead() && identifier.parent?.type === "CallExpression") {
                for (const arg of identifier.parent.arguments) {
                  if (isFunctionNode4(arg) && !arg.async) {
                    scopeStack.syncCallbacks.add(arg);
                  }
                }
              }
            }
          }
        } else if (matchImport(["mapArray", "indexArray"], node.callee.name)) {
          const arg1 = node.arguments[1];
          if (isFunctionNode4(arg1))
            scopeStack.syncCallbacks.add(arg1);
        }
      }
      if (isFunctionNode4(node.callee)) {
        scopeStack.syncCallbacks.add(node.callee);
      }
    };
    const checkForReactiveAssignment = (id, init) => {
      init = ignoreTransparentWrappers(init);
      if (init.type === "CallExpression" && init.callee.type === "Identifier") {
        const { callee } = init;
        if (matchImport(["createSignal", "useTransition"], callee.name)) {
          const signal = id && getNthDestructuredVar(id, 0, context);
          if (signal) {
            scopeStack.pushSignal(signal, currentScope().node);
          } else {
            warnShouldDestructure(id ?? init, "first");
          }
        } else if (matchImport(["createMemo", "createSelector"], callee.name)) {
          const memo = id && getReturnedVar(id, context);
          if (memo) {
            scopeStack.pushSignal(memo, currentScope().node);
          } else {
            warnShouldAssign(id ?? init);
          }
        } else if (matchImport("createStore", callee.name)) {
          const store = id && getNthDestructuredVar(id, 0, context);
          if (store) {
            scopeStack.pushProps(store, currentScope().node);
          } else {
            warnShouldDestructure(id ?? init, "first");
          }
        } else if (matchImport("mergeProps", callee.name)) {
          const merged = id && getReturnedVar(id, context);
          if (merged) {
            scopeStack.pushProps(merged, currentScope().node);
          } else {
            warnShouldAssign(id ?? init);
          }
        } else if (matchImport("splitProps", callee.name)) {
          if (id?.type === "ArrayPattern") {
            const vars = id.elements.map((_, i) => getNthDestructuredVar(id, i, context)).filter(Boolean);
            if (vars.length === 0) {
              warnShouldDestructure(id);
            } else {
              vars.forEach((v) => scopeStack.pushProps(v, currentScope().node));
            }
          } else {
            const v = id && getReturnedVar(id, context);
            if (v)
              scopeStack.pushProps(v, currentScope().node);
          }
        } else if (matchImport("createResource", callee.name)) {
          const resourceReturn = id && getNthDestructuredVar(id, 0, context);
          if (resourceReturn)
            scopeStack.pushProps(resourceReturn, currentScope().node);
        } else if (matchImport("createMutable", callee.name)) {
          const mutable = id && getReturnedVar(id, context);
          if (mutable)
            scopeStack.pushProps(mutable, currentScope().node);
        } else if (matchImport("mapArray", callee.name)) {
          const arg1 = init.arguments[1];
          if (isFunctionNode4(arg1) && arg1.params.length >= 2 && arg1.params[1].type === "Identifier") {
            const indexSignal = findVariable(context, arg1.params[1]);
            if (indexSignal)
              scopeStack.pushSignal(indexSignal);
          }
        } else if (matchImport("indexArray", callee.name)) {
          const arg1 = init.arguments[1];
          if (isFunctionNode4(arg1) && arg1.params.length >= 1 && arg1.params[0].type === "Identifier") {
            const valueSignal = findVariable(context, arg1.params[0]);
            if (valueSignal)
              scopeStack.pushSignal(valueSignal);
          }
        }
      }
    };
    const checkForTrackedScopes = (node) => {
      const pushTrackedScope = (n, expect) => {
        currentScope().trackedScopes.push({ node: n, expect });
        if (expect !== "called-function" && isFunctionNode4(n) && n.async) {
          context.report({ node: n, messageId: "noAsyncTrackedScope" });
        }
      };
      const permissivelyTrackNode = (n) => {
        walkTree(n, (childNode, skip) => {
          const traced = trace(childNode, context);
          if (isFunctionNode4(traced) || traced.type === "Identifier" && traced.parent?.type !== "MemberExpression" && !(traced.parent?.type === "CallExpression" && traced.parent.callee === traced)) {
            pushTrackedScope(childNode, "called-function");
            skip();
          }
        });
      };
      if (node.type === "JSXExpressionContainer") {
        if (node.parent?.type === "JSXAttribute" && context.sourceCode.getText(node.parent.name).startsWith("on") && node.parent.parent?.type === "JSXOpeningElement" && node.parent.parent.name.type === "JSXIdentifier" && isDOMElementName(node.parent.parent.name.name)) {
          pushTrackedScope(node.expression, "called-function");
        } else if (node.parent?.type === "JSXAttribute" && node.parent.name.type === "JSXNamespacedName" && node.parent.name.namespace.name === "use" && isFunctionNode4(node.expression)) {
          pushTrackedScope(node.expression, "called-function");
        } else if (node.parent?.type === "JSXAttribute" && node.parent.name.name === "value" && node.parent.parent?.type === "JSXOpeningElement" && (node.parent.parent.name.type === "JSXIdentifier" && node.parent.parent.name.name.endsWith("Provider") || node.parent.parent.name.type === "JSXMemberExpression" && node.parent.parent.name.property.name === "Provider")) {} else if (node.parent?.type === "JSXAttribute" && node.parent.name?.type === "JSXIdentifier" && /^static[A-Z]/.test(node.parent.name.name) && node.parent.parent?.type === "JSXOpeningElement" && node.parent.parent.name.type === "JSXIdentifier" && !isDOMElementName(node.parent.parent.name.name)) {} else if (node.parent?.type === "JSXAttribute" && node.parent.name.name === "ref" && isFunctionNode4(node.expression)) {
          pushTrackedScope(node.expression, "called-function");
        } else if (isJSXElementOrFragment(node.parent) && isFunctionNode4(node.expression)) {
          pushTrackedScope(node.expression, "function");
        } else {
          pushTrackedScope(node.expression, "expression");
        }
      } else if (node.type === "JSXSpreadAttribute") {
        pushTrackedScope(node.argument, "expression");
      } else if (node.type === "NewExpression") {
        const { callee, arguments: { 0: arg0 } } = node;
        if (callee.type === "Identifier" && arg0 && [
          "IntersectionObserver",
          "MutationObserver",
          "PerformanceObserver",
          "ReportingObserver",
          "ResizeObserver"
        ].includes(callee.name)) {
          pushTrackedScope(arg0, "called-function");
        }
      } else if (node.type === "CallExpression") {
        if (node.callee.type === "Identifier") {
          const { callee, arguments: { 0: arg0, 1: arg1 } } = node;
          if (matchImport([
            "createMemo",
            "children",
            "createEffect",
            "createRenderEffect",
            "createDeferred",
            "createComputed",
            "createSelector",
            "untrack",
            "mapArray",
            "indexArray",
            "observable"
          ], callee.name) || matchImport("createResource", callee.name) && node.arguments.length >= 2) {
            pushTrackedScope(arg0, "function");
          } else if (matchImport(["onMount", "onCleanup", "onError"], callee.name) || [
            "setInterval",
            "setTimeout",
            "setImmediate",
            "requestAnimationFrame",
            "requestIdleCallback"
          ].includes(callee.name)) {
            pushTrackedScope(arg0, "called-function");
          } else if (matchImport("on", callee.name)) {
            if (arg0) {
              if (arg0.type === "ArrayExpression") {
                arg0.elements.forEach((el) => {
                  if (el && el?.type !== "SpreadElement")
                    pushTrackedScope(el, "function");
                });
              } else {
                pushTrackedScope(arg0, "function");
              }
            }
            if (arg1)
              pushTrackedScope(arg1, "called-function");
          } else if (matchImport("createStore", callee.name) && arg0?.type === "ObjectExpression") {
            for (const property of arg0.properties) {
              if (property.type === "Property" && property.kind === "get" && isFunctionNode4(property.value)) {
                pushTrackedScope(property.value, "function");
              }
            }
          } else if (matchImport("runWithOwner", callee.name)) {
            if (arg1) {
              let isTrackedScope = true;
              const owner = arg0.type === "Identifier" && findVariable(context, arg0);
              if (owner) {
                const decl = owner.defs[0];
                if (decl?.node.type === "VariableDeclarator" && decl.node.init?.type === "CallExpression" && decl.node.init.callee.type === "Identifier" && matchImport("getOwner", decl.node.init.callee.name)) {
                  const ownerFunction = findParent(decl.node, isProgramOrFunctionNode);
                  const scopeStackIndex = scopeStack.findIndex(({ node: node2 }) => ownerFunction === node2);
                  if (scopeStackIndex >= 1 && !scopeStack[scopeStackIndex - 1].trackedScopes.some((ts) => ts.expect === "function" && ts.node === ownerFunction) || scopeStackIndex === 0) {
                    isTrackedScope = false;
                  }
                }
              }
              if (isTrackedScope)
                pushTrackedScope(arg1, "function");
            }
          } else if (/^(?:use|create)[A-Z]/.test(callee.name) || getCustomReactiveFunctions().includes(callee.name)) {
            for (const arg of node.arguments) {
              permissivelyTrackNode(arg);
            }
          }
        } else if (node.callee.type === "MemberExpression") {
          const { property } = node.callee;
          if (property.type === "Identifier" && property.name === "addEventListener" && node.arguments.length >= 2) {
            pushTrackedScope(node.arguments[1], "called-function");
          } else if (property.type === "Identifier" && (/^(?:use|create)[A-Z]/.test(property.name) || getCustomReactiveFunctions().includes(property.name))) {
            for (const arg of node.arguments) {
              permissivelyTrackNode(arg);
            }
          }
        }
      } else if (node.type === "VariableDeclarator") {
        if (node.init?.type === "CallExpression" && node.init.callee.type === "Identifier") {
          if (matchImport(["createReactive", "createReaction"], node.init.callee.name)) {
            const track = getReturnedVar(node.id, context);
            if (track) {
              for (const reference of track.references) {
                if (!reference.init && reference.isReadOnly() && reference.identifier.parent?.type === "CallExpression" && reference.identifier.parent.callee === reference.identifier) {
                  const a0 = reference.identifier.parent.arguments[0];
                  if (a0)
                    pushTrackedScope(a0, "function");
                }
              }
            }
            if (isFunctionNode4(node.init.arguments[0])) {
              pushTrackedScope(node.init.arguments[0], "called-function");
            }
          }
        }
      } else if (node.type === "AssignmentExpression") {
        if (node.left.type === "MemberExpression" && node.left.property.type === "Identifier" && isFunctionNode4(node.right) && /^on[a-z]+$/.test(node.left.property.name)) {
          pushTrackedScope(node.right, "called-function");
        }
      } else if (node.type === "TaggedTemplateExpression") {
        for (const expression of node.quasi.expressions) {
          if (isFunctionNode4(expression)) {
            pushTrackedScope(expression, "called-function");
            for (const param of expression.params) {
              if (param.type === "Identifier" && isPropsByName2(param.name)) {
                const variable = findVariable(context, param);
                if (variable)
                  scopeStack.pushProps(variable, currentScope().node);
              }
            }
          }
        }
      }
    };
    return {
      ImportDeclaration: handleImportDeclaration,
      JSXExpressionContainer(node) {
        checkForTrackedScopes(node);
      },
      JSXSpreadAttribute(node) {
        checkForTrackedScopes(node);
      },
      CallExpression(node) {
        checkForTrackedScopes(node);
        checkForSyncCallbacks(node);
        const parent = node.parent && ignoreTransparentWrappers(node.parent, true);
        if (parent?.type !== "AssignmentExpression" && parent?.type !== "VariableDeclarator") {
          checkForReactiveAssignment(null, node);
        }
      },
      NewExpression(node) {
        checkForTrackedScopes(node);
      },
      VariableDeclarator(node) {
        if (node.init) {
          checkForReactiveAssignment(node.id, node.init);
          checkForTrackedScopes(node);
        }
      },
      AssignmentExpression(node) {
        if (node.left.type !== "MemberExpression") {
          checkForReactiveAssignment(node.left, node.right);
        }
        checkForTrackedScopes(node);
      },
      TaggedTemplateExpression(node) {
        checkForTrackedScopes(node);
      },
      "JSXElement > JSXExpressionContainer > :function"(node) {
        if (isFunctionNode4(node) && node.parent?.type === "JSXExpressionContainer" && node.parent.parent?.type === "JSXElement") {
          const element = node.parent.parent;
          if (element.openingElement.name.type === "JSXIdentifier") {
            const tagName = element.openingElement.name.name;
            if (matchImport("For", tagName) && node.params.length === 2 && node.params[1].type === "Identifier") {
              const index = findVariable(context, node.params[1]);
              if (index)
                scopeStack.pushSignal(index, currentScope().node);
            } else if (matchImport("Index", tagName) && node.params.length >= 1 && node.params[0].type === "Identifier") {
              const item = findVariable(context, node.params[0]);
              if (item)
                scopeStack.pushSignal(item, currentScope().node);
            }
          }
        }
      },
      FunctionExpression: onFunctionEnter,
      ArrowFunctionExpression: onFunctionEnter,
      FunctionDeclaration: onFunctionEnter,
      Program: onFunctionEnter,
      "FunctionExpression:exit": onFunctionExit,
      "ArrowFunctionExpression:exit": onFunctionExit,
      "FunctionDeclaration:exit": onFunctionExit,
      "Program:exit": onFunctionExit,
      JSXElement() {
        if (scopeStack.length)
          currentScope().hasJSX = true;
      },
      JSXFragment() {
        if (scopeStack.length)
          currentScope().hasJSX = true;
      }
    };
  }
};

// packages/plugin-solid/src/rules/self-closing-comp.ts
var voidDOMElementRegex = /^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/;
function isComponent(node) {
  return node.name?.type === "JSXIdentifier" && !isDOMElementName(node.name.name) || node.name?.type === "JSXMemberExpression";
}
function childrenIsEmpty(node) {
  return (node.parent?.children?.length ?? 0) === 0;
}
function childrenIsMultilineSpaces(node) {
  const children = node.parent?.children ?? [];
  return children.length === 1 && children[0].type === "JSXText" && children[0].value.indexOf(`
`) !== -1 && children[0].value.replace(/(?!\xA0)\s/g, "") === "";
}
var self_closing_comp_default = {
  meta: {
    type: "layout",
    docs: {
      description: "Disallow extra closing tags for components without children.",
      recommended: "error"
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          component: {
            type: "string",
            description: "which Solid components should be self-closing when possible",
            enum: ["all", "none"],
            default: "all"
          },
          html: {
            type: "string",
            description: "which native elements should be self-closing when possible",
            enum: ["all", "void", "none"],
            default: "all"
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      selfClose: "Empty components are self-closing.",
      dontSelfClose: "This element should not be self-closing."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    function shouldBeSelfClosedWhenPossible(node) {
      if (isComponent(node)) {
        return (context.options[0]?.component ?? "all") === "all";
      } else if (node.name?.type === "JSXIdentifier" && isDOMElementName(node.name.name)) {
        const whichHtml = context.options[0]?.html ?? "all";
        switch (whichHtml) {
          case "all":
            return true;
          case "void":
            return voidDOMElementRegex.test(node.name.name);
          case "none":
            return false;
        }
      }
      return true;
    }
    return {
      JSXOpeningElement(node) {
        const canSelfClose = childrenIsEmpty(node) || childrenIsMultilineSpaces(node);
        if (canSelfClose) {
          const shouldSelfClose = shouldBeSelfClosedWhenPossible(node);
          if (shouldSelfClose && !node.selfClosing) {
            context.report({
              node,
              messageId: "selfClose",
              fix(fixer) {
                const openingElementEnding = node.range[1] - 1;
                const closingElementEnding = node.parent?.closingElement?.range?.[1];
                if (closingElementEnding == null)
                  return null;
                return fixer.replaceTextRange([openingElementEnding, closingElementEnding], " />");
              }
            });
          } else if (!shouldSelfClose && node.selfClosing) {
            context.report({
              node,
              messageId: "dontSelfClose",
              fix(fixer) {
                const sourceCode = context.sourceCode;
                const tagName = sourceCode.getText(node.name);
                const selfCloseEnding = node.range[1];
                const lastTokens = sourceCode.getLastTokens(node, { count: 3 });
                const isSpaceBeforeSelfClose = sourceCode.isSpaceBetween?.(lastTokens[0], lastTokens[1]);
                const range = [
                  isSpaceBeforeSelfClose ? selfCloseEnding - 3 : selfCloseEnding - 2,
                  selfCloseEnding
                ];
                return fixer.replaceTextRange(range, `></${tagName}>`);
              }
            });
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/rules/style-prop.ts
function toKebabCase(str) {
  return str.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
}
function parseStyleString(str) {
  const result = {};
  for (const decl of str.split(";")) {
    const trimmed = decl.trim();
    if (!trimmed)
      continue;
    const i = trimmed.indexOf(":");
    if (i === -1)
      return;
    const prop = trimmed.slice(0, i).trim();
    const value = trimmed.slice(i + 1).trim();
    if (!prop)
      return;
    result[prop] = value;
  }
  return result;
}
function getPropertyName2(node, scope) {
  if (!node.computed) {
    if (node.key?.type === "Identifier")
      return node.key.name;
    if (node.key?.type === "Literal" && typeof node.key.value === "string")
      return node.key.value;
  }
  if (node.computed && node.key) {
    const val = getStaticValue2(node.key, scope);
    if (val && typeof val.value === "string")
      return val.value;
  }
  return null;
}
function getStaticValue2(node, _scope) {
  if (!node)
    return null;
  if (node.type === "Literal")
    return { value: node.value };
  if (node.type === "TemplateLiteral" && node.expressions.length === 0) {
    return { value: node.quasis[0]?.value?.cooked ?? null };
  }
  return null;
}
var CSS_PROPERTIES = new Set(buildCssPropertyList());
function buildCssPropertyList() {
  const props = [
    "display",
    "position",
    "top",
    "right",
    "bottom",
    "left",
    "float",
    "clear",
    "z-index",
    "overflow",
    "overflow-x",
    "overflow-y",
    "overflow-wrap",
    "visibility",
    "opacity",
    "clip",
    "clip-path",
    "flex",
    "flex-basis",
    "flex-direction",
    "flex-flow",
    "flex-grow",
    "flex-shrink",
    "flex-wrap",
    "order",
    "justify-content",
    "align-content",
    "align-items",
    "align-self",
    "place-content",
    "place-items",
    "place-self",
    "grid",
    "grid-area",
    "grid-auto-columns",
    "grid-auto-flow",
    "grid-auto-rows",
    "grid-column",
    "grid-column-end",
    "grid-column-gap",
    "grid-column-start",
    "grid-gap",
    "grid-row",
    "grid-row-end",
    "grid-row-gap",
    "grid-row-start",
    "grid-template",
    "grid-template-areas",
    "grid-template-columns",
    "grid-template-rows",
    "gap",
    "row-gap",
    "column-gap",
    "width",
    "height",
    "min-width",
    "max-width",
    "min-height",
    "max-height",
    "margin",
    "margin-top",
    "margin-right",
    "margin-bottom",
    "margin-left",
    "margin-block",
    "margin-block-start",
    "margin-block-end",
    "margin-inline",
    "margin-inline-start",
    "margin-inline-end",
    "padding",
    "padding-top",
    "padding-right",
    "padding-bottom",
    "padding-left",
    "padding-block",
    "padding-block-start",
    "padding-block-end",
    "padding-inline",
    "padding-inline-start",
    "padding-inline-end",
    "box-sizing",
    "inline-size",
    "block-size",
    "min-inline-size",
    "max-inline-size",
    "min-block-size",
    "max-block-size",
    "border",
    "border-top",
    "border-right",
    "border-bottom",
    "border-left",
    "border-width",
    "border-top-width",
    "border-right-width",
    "border-bottom-width",
    "border-left-width",
    "border-style",
    "border-top-style",
    "border-right-style",
    "border-bottom-style",
    "border-left-style",
    "border-color",
    "border-top-color",
    "border-right-color",
    "border-bottom-color",
    "border-left-color",
    "border-radius",
    "border-top-left-radius",
    "border-top-right-radius",
    "border-bottom-left-radius",
    "border-bottom-right-radius",
    "border-image",
    "border-image-outset",
    "border-image-repeat",
    "border-image-slice",
    "border-image-source",
    "border-image-width",
    "border-collapse",
    "border-spacing",
    "border-block",
    "border-block-color",
    "border-block-end",
    "border-block-end-color",
    "border-block-end-style",
    "border-block-end-width",
    "border-block-start",
    "border-block-start-color",
    "border-block-start-style",
    "border-block-start-width",
    "border-block-style",
    "border-block-width",
    "border-inline",
    "border-inline-color",
    "border-inline-end",
    "border-inline-end-color",
    "border-inline-end-style",
    "border-inline-end-width",
    "border-inline-start",
    "border-inline-start-color",
    "border-inline-start-style",
    "border-inline-start-width",
    "border-inline-style",
    "border-inline-width",
    "border-start-start-radius",
    "border-start-end-radius",
    "border-end-start-radius",
    "border-end-end-radius",
    "background",
    "background-attachment",
    "background-blend-mode",
    "background-clip",
    "background-color",
    "background-image",
    "background-origin",
    "background-position",
    "background-position-x",
    "background-position-y",
    "background-repeat",
    "background-size",
    "color",
    "font",
    "font-family",
    "font-feature-settings",
    "font-kerning",
    "font-language-override",
    "font-optical-sizing",
    "font-size",
    "font-size-adjust",
    "font-stretch",
    "font-style",
    "font-synthesis",
    "font-variant",
    "font-variant-alternates",
    "font-variant-caps",
    "font-variant-east-asian",
    "font-variant-ligatures",
    "font-variant-numeric",
    "font-variant-position",
    "font-variation-settings",
    "font-weight",
    "letter-spacing",
    "line-break",
    "line-height",
    "text-align",
    "text-align-last",
    "text-combine-upright",
    "text-decoration",
    "text-decoration-color",
    "text-decoration-line",
    "text-decoration-skip-ink",
    "text-decoration-style",
    "text-decoration-thickness",
    "text-emphasis",
    "text-emphasis-color",
    "text-emphasis-position",
    "text-emphasis-style",
    "text-indent",
    "text-justify",
    "text-orientation",
    "text-overflow",
    "text-rendering",
    "text-shadow",
    "text-transform",
    "text-underline-offset",
    "text-underline-position",
    "white-space",
    "word-break",
    "word-spacing",
    "word-wrap",
    "writing-mode",
    "direction",
    "unicode-bidi",
    "hyphens",
    "tab-size",
    "quotes",
    "list-style",
    "list-style-image",
    "list-style-position",
    "list-style-type",
    "table-layout",
    "caption-side",
    "empty-cells",
    "transform",
    "transform-box",
    "transform-origin",
    "transform-style",
    "perspective",
    "perspective-origin",
    "backface-visibility",
    "animation",
    "animation-delay",
    "animation-direction",
    "animation-duration",
    "animation-fill-mode",
    "animation-iteration-count",
    "animation-name",
    "animation-play-state",
    "animation-timing-function",
    "transition",
    "transition-delay",
    "transition-duration",
    "transition-property",
    "transition-timing-function",
    "filter",
    "backdrop-filter",
    "mix-blend-mode",
    "isolation",
    "box-shadow",
    "outline",
    "outline-color",
    "outline-offset",
    "outline-style",
    "outline-width",
    "object-fit",
    "object-position",
    "resize",
    "contain",
    "content",
    "counter-increment",
    "counter-reset",
    "counter-set",
    "aspect-ratio",
    "container",
    "container-name",
    "container-type",
    "scroll-behavior",
    "scroll-margin",
    "scroll-margin-top",
    "scroll-margin-right",
    "scroll-margin-bottom",
    "scroll-margin-left",
    "scroll-margin-block",
    "scroll-margin-block-start",
    "scroll-margin-block-end",
    "scroll-margin-inline",
    "scroll-margin-inline-start",
    "scroll-margin-inline-end",
    "scroll-padding",
    "scroll-padding-top",
    "scroll-padding-right",
    "scroll-padding-bottom",
    "scroll-padding-left",
    "scroll-padding-block",
    "scroll-padding-block-start",
    "scroll-padding-block-end",
    "scroll-padding-inline",
    "scroll-padding-inline-start",
    "scroll-padding-inline-end",
    "scroll-snap-align",
    "scroll-snap-stop",
    "scroll-snap-type",
    "overscroll-behavior",
    "overscroll-behavior-x",
    "overscroll-behavior-y",
    "overscroll-behavior-block",
    "overscroll-behavior-inline",
    "cursor",
    "caret-color",
    "pointer-events",
    "touch-action",
    "user-select",
    "appearance",
    "will-change",
    "image-rendering",
    "columns",
    "column-count",
    "column-fill",
    "column-gap",
    "column-rule",
    "column-rule-color",
    "column-rule-style",
    "column-rule-width",
    "column-span",
    "column-width",
    "page-break-after",
    "page-break-before",
    "page-break-inside",
    "break-after",
    "break-before",
    "break-inside",
    "orphans",
    "widows",
    "all",
    "accent-color",
    "color-scheme",
    "forced-color-adjust",
    "print-color-adjust",
    "inset",
    "inset-block",
    "inset-block-start",
    "inset-block-end",
    "inset-inline",
    "inset-inline-start",
    "inset-inline-end",
    "mask",
    "mask-border",
    "mask-border-mode",
    "mask-border-outset",
    "mask-border-repeat",
    "mask-border-slice",
    "mask-border-source",
    "mask-border-width",
    "mask-clip",
    "mask-composite",
    "mask-image",
    "mask-mode",
    "mask-origin",
    "mask-position",
    "mask-repeat",
    "mask-size",
    "mask-type",
    "shape-image-threshold",
    "shape-margin",
    "shape-outside",
    "-webkit-appearance",
    "-webkit-font-smoothing",
    "-webkit-line-clamp",
    "-webkit-overflow-scrolling",
    "-webkit-tap-highlight-color",
    "-webkit-text-fill-color",
    "-webkit-text-stroke",
    "-webkit-text-stroke-color",
    "-webkit-text-stroke-width",
    "-webkit-text-size-adjust",
    "-moz-appearance",
    "-moz-osx-font-smoothing",
    "-ms-overflow-style",
    "-ms-text-size-adjust",
    "fill",
    "stroke",
    "stroke-dasharray",
    "stroke-dashoffset",
    "stroke-linecap",
    "stroke-linejoin",
    "stroke-miterlimit",
    "stroke-opacity",
    "stroke-width",
    "fill-opacity",
    "fill-rule",
    "paint-order",
    "dominant-baseline",
    "text-anchor",
    "block-size",
    "inline-size"
  ];
  return props;
}
var lengthPercentageRegex = /\b(?:width|height|margin|padding|border-width|font-size)\b/i;
var style_prop_default = {
  meta: {
    type: "problem",
    docs: {
      description: "Require CSS properties in the `style` prop to be valid and kebab-cased (ex. 'font-size'), not camel-cased (ex. 'fontSize') like in React, " + "and that property values with dimensions are strings, not numbers with implicit 'px' units.",
      url: "https://github.com/solidjs-community/eslint-plugin-solid/blob/main/packages/eslint-plugin-solid/docs/style-prop.md"
    },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          styleProps: {
            description: "an array of prop names to treat as a CSS style object",
            default: ["style"],
            type: "array",
            items: { type: "string" },
            minItems: 1,
            uniqueItems: true
          },
          allowString: {
            description: "if allowString is set to true, this rule will not convert a style string literal into a style object (not recommended for performance)",
            type: "boolean",
            default: false
          }
        },
        additionalProperties: false
      }
    ],
    messages: {
      kebabStyleProp: "Use {{ kebabName }} instead of {{ name }}.",
      invalidStyleProp: "{{ name }} is not a valid CSS property.",
      numericStyleValue: 'This CSS property value should be a string with a unit; Solid does not automatically append a "px" unit.',
      stringStyle: "Use an object for the style prop instead of a string."
    }
  },
  defaultOptions: [],
  createOnce(context) {
    return {
      JSXAttribute(node) {
        const allowString = Boolean(context.options?.[0]?.allowString);
        const styleProps = context.options?.[0]?.styleProps || ["style"];
        if (styleProps.indexOf(jsxPropName(node)) === -1)
          return;
        const style = node.value?.type === "JSXExpressionContainer" ? node.value.expression : node.value;
        if (!style) {
          return;
        } else if (style.type === "Literal" && typeof style.value === "string" && !allowString) {
          let objectStyles;
          try {
            objectStyles = parseStyleString(style.value);
          } catch {}
          context.report({
            node: style,
            messageId: "stringStyle",
            fix: objectStyles && ((fixer) => fixer.replaceText(node.value, `{${JSON.stringify(objectStyles)}}`))
          });
        } else if (style.type === "TemplateLiteral" && !allowString) {
          context.report({ node: style, messageId: "stringStyle" });
        } else if (style.type === "ObjectExpression") {
          const properties = style.properties.filter((p) => p.type === "Property");
          for (const prop of properties) {
            const scope = context.sourceCode?.getScope?.(prop);
            const name = getPropertyName2(prop, scope);
            if (name && !name.startsWith("--") && !CSS_PROPERTIES.has(name)) {
              const kebabName = toKebabCase(name);
              if (CSS_PROPERTIES.has(kebabName)) {
                context.report({
                  node: prop.key,
                  messageId: "kebabStyleProp",
                  data: { name, kebabName },
                  fix: (fixer) => fixer.replaceText(prop.key, `"${kebabName}"`)
                });
              } else {
                context.report({
                  node: prop.key,
                  messageId: "invalidStyleProp",
                  data: { name }
                });
              }
            } else if (!name || !name.startsWith("--") && lengthPercentageRegex.test(name)) {
              const value = getStaticValue2(prop.value)?.value;
              if (typeof value === "number" && value !== 0) {
                context.report({ node: prop.value, messageId: "numericStyleValue" });
              }
            }
          }
        }
      }
    };
  }
};

// packages/plugin-solid/src/index.ts
var plugin = eslintCompatPlugin({
  meta: { name: "oxlint-plugin-solidjs" },
  rules: {
    "components-return-once": components_return_once_default,
    "event-handlers": event_handlers_default,
    imports: imports_default,
    "jsx-no-duplicate-props": jsx_no_duplicate_props_default,
    "jsx-no-script-url": jsx_no_script_url_default,
    "jsx-no-undef": jsx_no_undef_default,
    "jsx-uses-vars": jsx_uses_vars_default,
    "no-array-handlers": no_array_handlers_default,
    "no-destructure": no_destructure_default,
    "no-innerhtml": no_innerhtml_default,
    "no-proxy-apis": no_proxy_apis_default,
    "no-react-deps": no_react_deps_default,
    "no-react-specific-props": no_react_specific_props_default,
    "no-unknown-namespaces": no_unknown_namespaces_default,
    "prefer-classlist": prefer_classlist_default,
    "prefer-for": prefer_for_default,
    "prefer-show": prefer_show_default,
    reactivity: reactivity_default,
    "self-closing-comp": self_closing_comp_default,
    "style-prop": style_prop_default
  },
  configs: {
    recommended: {
      rules: {
        "solid/jsx-no-duplicate-props": "error",
        "solid/jsx-no-undef": "error",
        "solid/jsx-uses-vars": "error",
        "solid/no-unknown-namespaces": "error",
        "solid/no-innerhtml": "error",
        "solid/jsx-no-script-url": "error",
        "solid/components-return-once": "warn",
        "solid/no-destructure": "error",
        "solid/prefer-for": "error",
        "solid/reactivity": "warn",
        "solid/event-handlers": "warn",
        "solid/imports": "warn",
        "solid/style-prop": "warn",
        "solid/no-react-deps": "warn",
        "solid/no-react-specific-props": "warn",
        "solid/self-closing-comp": "warn",
        "solid/no-array-handlers": "off",
        "solid/prefer-show": "off",
        "solid/no-proxy-apis": "off",
        "solid/prefer-classlist": "off"
      }
    }
  }
});
var src_default = plugin;
export {
  src_default as default
};

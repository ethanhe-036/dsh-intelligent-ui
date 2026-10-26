// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/json-schema.js
var deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => deepEqual(a[key], b[key]));
};

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/pointer.js
function parsePointer(pointer) {
  if (pointer === "") return [];
  if (!pointer.startsWith("/")) throw new Error(`Invalid JSON Pointer "${pointer}": must start with "/"`);
  return pointer.slice(1).split("/").map((token) => token.replace(/~1/g, "/").replace(/~0/g, "~"));
}
var escapePointerToken = (token) => String(token).replace(/~/g, "~0").replace(/\//g, "~1");
var joinPointer = (tokens) => tokens.map((token) => `/${escapePointerToken(token)}`).join("");
var isContainer = (value) => typeof value === "object" && value !== null;
var ARRAY_INDEX = /^(0|[1-9]\d*)$/;
function getAtPointer(doc, pointer) {
  const tokens = typeof pointer === "string" ? parsePointer(pointer) : pointer;
  let current = doc;
  for (const token of tokens) if (Array.isArray(current)) {
    if (!ARRAY_INDEX.test(token) || !Object.hasOwn(current, token)) return;
    current = current[Number(token)];
  } else if (isContainer(current)) {
    if (!Object.hasOwn(current, token)) return void 0;
    current = current[token];
  } else return;
  return current;
}
var FORBIDDEN = /* @__PURE__ */ new Set([
  "__proto__",
  "constructor",
  "prototype"
]);
function writeAtPointer(doc, tokens, mode, value, options = {}, arrayParents = []) {
  return writeAtPointerAt(doc, tokens, mode, value, options, arrayParents, []);
}
function writeAtPointerAt(doc, tokens, mode, value, options, arrayParents, prefix) {
  if (tokens.length === 0) {
    if (mode === "remove") throw new Error("Cannot remove the whole document");
    return value;
  }
  const [token, ...rest] = tokens;
  if (FORBIDDEN.has(token)) throw new Error(`Forbidden path token "${token}"`);
  const last = rest.length === 0;
  if (Array.isArray(doc)) {
    const copy2 = doc.slice();
    if (token === "-") {
      if (!last || mode !== "add") throw new Error('"-" can only be the last token of an add');
      copy2.push(value);
      return copy2;
    }
    if (!ARRAY_INDEX.test(token)) throw new Error(`"${token}" is not an array index`);
    const index = Number(token);
    if (last) {
      if (mode === "add") {
        if (index > copy2.length) throw new Error(`Index ${index} is out of bounds`);
        copy2.splice(index, 0, value);
      } else {
        if (index >= copy2.length) throw new Error(`Index ${index} is out of bounds`);
        if (mode === "remove") copy2.splice(index, 1);
        else copy2[index] = value;
      }
      return copy2;
    }
    if (index >= copy2.length) throw new Error(`Index ${index} is out of bounds`);
    copy2[index] = writeAtPointerAt(copy2[index], rest, mode, value, options, arrayParents, [...prefix, token]);
    return copy2;
  }
  if (!isContainer(doc)) {
    if (options.createMissing && doc === void 0 && mode !== "remove") return writeAtPointerAt(arrayParents.includes(joinPointer(prefix)) ? [] : {}, tokens, mode, value, options, arrayParents, prefix);
    throw new Error(`Path segment "${token}" does not exist`);
  }
  const copy = { ...doc };
  if (last) {
    if (mode === "remove" || mode === "replace" && !options.createMissing) {
      if (!Object.hasOwn(copy, token)) throw new Error(`Path segment "${token}" does not exist`);
    }
    if (mode === "remove") delete copy[token];
    else copy[token] = value;
    return copy;
  }
  if (!Object.hasOwn(copy, token) && !options.createMissing) throw new Error(`Path segment "${token}" does not exist`);
  copy[token] = writeAtPointerAt(copy[token], rest, mode, value, options, arrayParents, [...prefix, token]);
  return copy;
}

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/calc.js
var isNumber = (value) => typeof value === "number" && Number.isFinite(value);
var normalize = (value) => value === void 0 || typeof value === "number" && !Number.isFinite(value) ? null : value;
var pointerTokens = (path) => {
  try {
    return parsePointer(path && !path.startsWith("/") ? `/${path}` : path);
  } catch {
    return [];
  }
};
var readPath = (base, path) => getAtPointer(base, pointerTokens(path));
var readReference = (path, ctx) => {
  if (path === "$index") return ctx.index;
  if (path === "$item") return ctx.item;
  if (path.startsWith("$item/")) return readPath(ctx.item, path.slice(5));
  if (path === "$event") return ctx.event;
  if (path.startsWith("$event/")) return readPath(ctx.event, path.slice(6));
  return readPath(ctx.state, path);
};
var eachChild = (value, visit) => {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) if (Object.hasOwn(value, index) && !visit(value[index], String(index))) return false;
    return true;
  }
  for (const key in value) if (Object.hasOwn(value, key) && !visit(value[key], key)) return false;
  return true;
};
var visitAll = (value, step) => {
  step();
  if (typeof value === "object" && value !== null) eachChild(value, (child) => {
    visitAll(child, step);
    return true;
  });
};
var formatText = (value, step) => {
  if (value === null || value === void 0) return "";
  if (typeof value !== "object") return String(value);
  visitAll(value, step);
  return JSON.stringify(value);
};
var fractionDigits = (value) => Math.max(0, Math.min(20, Math.trunc(value)));
var numeric = (fn) => (args) => args.every(isNumber) ? fn(...args) : null;
var aggregate = (operation, args, step) => {
  const [list, field] = args;
  if (!Array.isArray(list) || args.length > 2) return null;
  if (args.length === 2 && typeof field !== "string") return null;
  if (typeof field === "string" && field.length > 500) return null;
  const tokens = typeof field === "string" ? pointerTokens(field) : void 0;
  if (tokens && tokens.length > 32) return null;
  let total = 0;
  let count = 0;
  let extreme = null;
  for (const item of list) {
    step();
    const value = tokens ? getAtPointer(item, tokens) : item;
    if (!isNumber(value)) continue;
    total += value;
    count++;
    if (extreme === null) extreme = value;
    else if (operation === "min") extreme = Math.min(extreme, value);
    else if (operation === "max") extreme = Math.max(extreme, value);
  }
  if (operation === "sum") return total;
  if (operation === "avg") return count ? total / count : null;
  return extreme;
};
var formatters = /* @__PURE__ */ new Map();
var formatNumber = (value, options) => {
  if (!isNumber(value)) return null;
  const key = JSON.stringify(options);
  let formatter = formatters.get(key);
  if (!formatter) {
    try {
      formatter = new Intl.NumberFormat("en-US", options);
    } catch {
      return null;
    }
    if (formatters.size >= 64) formatters.clear();
    formatters.set(key, formatter);
  }
  return formatter.format(value);
};
var decimalFormat = (args, style) => {
  const [value, digits] = args;
  if (args.length === 1) return formatNumber(value, { style });
  if (!isNumber(digits)) return null;
  const precision = fractionDigits(digits);
  return formatNumber(value, {
    style,
    minimumFractionDigits: precision,
    maximumFractionDigits: precision
  });
};
var functions = new Map([
  ["round", {
    min: 1,
    max: 2,
    run: numeric((x, digits = 0) => {
      const scale = 10 ** fractionDigits(digits);
      return Math.round(x * scale) / scale;
    })
  }],
  ["floor", {
    min: 1,
    max: 1,
    run: numeric(Math.floor)
  }],
  ["ceil", {
    min: 1,
    max: 1,
    run: numeric(Math.ceil)
  }],
  ["abs", {
    min: 1,
    max: 1,
    run: numeric(Math.abs)
  }],
  ["clamp", {
    min: 3,
    max: 3,
    run: numeric((x, low, high) => Math.min(Math.max(x, low), high))
  }],
  ...["min", "max"].map((name) => [name, {
    min: 1,
    max: Infinity,
    run: (args, step) => Array.isArray(args[0]) ? aggregate(name, args, step) : numeric(name === "min" ? Math.min : Math.max)(args, step)
  }]),
  ["count", {
    min: 1,
    max: 1,
    run: ([list]) => Array.isArray(list) ? list.length : null
  }],
  ...["sum", "avg"].map((name) => [name, {
    min: 1,
    max: 2,
    run: (args, step) => aggregate(name, args, step)
  }]),
  ["number", {
    min: 1,
    max: 2,
    run: (args) => decimalFormat(args, "decimal")
  }],
  ["currency", {
    min: 2,
    max: 2,
    run: ([value, code]) => typeof code === "string" ? formatNumber(value, {
      style: "currency",
      currency: code
    }) : null
  }],
  ["percent", {
    min: 1,
    max: 2,
    run: (args) => decimalFormat(args, "percent")
  }],
  ["time", {
    min: 1,
    max: 1,
    run: ([value]) => {
      if (!isNumber(value)) return null;
      const minutes = (Math.round(value) % 1440 + 1440) % 1440;
      const hour = Math.floor(minutes / 60);
      return `${hour % 12 || 12}:${String(minutes % 60).padStart(2, "0")} ${hour < 12 ? "AM" : "PM"}`;
    }
  }],
  ["plural", {
    min: 3,
    max: 3,
    run: ([n, one, other]) => n === 1 ? one : other
  }]
]);
var tokenize = (formula) => {
  const tokens = [];
  let offset = 0;
  while (offset < formula.length) {
    const char = formula[offset];
    if (/\s/.test(char)) offset++;
    else if (char === "'" || char === '"') {
      offset++;
      let value = "";
      while (offset < formula.length && formula[offset] !== char) {
        let next = formula[offset++];
        if (next === "\\") {
          next = formula[offset++] ?? "";
          if (next !== "\\" && next !== "'" && next !== '"') throw new Error("Invalid string escape");
        }
        value += next;
      }
      if (offset >= formula.length) throw new Error("Unterminated string");
      offset++;
      tokens.push({
        kind: "literal",
        value
      });
    } else if (char === "$" && formula[offset + 1] === "{") {
      const end = formula.indexOf("}", offset + 2);
      if (end === -1) throw new Error("Unterminated reference");
      tokens.push({
        kind: "reference",
        text: formula.slice(offset + 2, end).trim()
      });
      offset = end + 1;
    } else if (/[0-9]/.test(char)) {
      const start = offset++;
      while (/[0-9]/.test(formula[offset] ?? "")) offset++;
      if (formula[offset] === "." && /[0-9]/.test(formula[offset + 1] ?? "")) {
        offset++;
        while (/[0-9]/.test(formula[offset] ?? "")) offset++;
      }
      tokens.push({
        kind: "literal",
        value: Number(formula.slice(start, offset))
      });
    } else if (/[a-zA-Z_]/.test(char)) {
      const start = offset++;
      while (/[a-zA-Z0-9_]/.test(formula[offset] ?? "")) offset++;
      const name = formula.slice(start, offset);
      if (name === "true" || name === "false" || name === "null") tokens.push({
        kind: "literal",
        value: name === "null" ? null : name === "true"
      });
      else tokens.push({
        kind: "name",
        text: name
      });
    } else {
      const pair = formula.slice(offset, offset + 2);
      if ([
        "||",
        "&&",
        "==",
        "!=",
        "<=",
        ">="
      ].includes(pair)) {
        tokens.push({
          kind: "symbol",
          text: pair
        });
        offset += 2;
      } else if ("?:<>+-*/%!(),".includes(char)) {
        tokens.push({
          kind: "symbol",
          text: char
        });
        offset++;
      } else throw new Error(`Unexpected token "${char}"`);
    }
  }
  tokens.push({ kind: "end" });
  return tokens;
};
var precedence = [
  ["||"],
  ["&&"],
  ["==", "!="],
  [
    "<",
    "<=",
    ">",
    ">="
  ],
  ["+", "-"],
  [
    "*",
    "/",
    "%"
  ]
];
var parse = (formula) => {
  const tokens = tokenize(formula);
  let position = 0;
  const current = () => tokens[position];
  const match = (symbol) => {
    const token = current();
    if (token.kind !== "symbol" || token.text !== symbol) return false;
    position++;
    return true;
  };
  const expect = (symbol) => {
    if (!match(symbol)) throw new Error(`Expected "${symbol}"`);
  };
  const checkDepth = (depth) => {
    if (depth > 32) throw new Error("Formula exceeds 32 levels of nesting");
  };
  const primary = (depth) => {
    checkDepth(depth);
    const token = current();
    position++;
    if (token.kind === "literal") return token;
    if (token.kind === "reference") return {
      kind: "reference",
      path: token.text
    };
    if (token.kind === "symbol" && token.text === "(") {
      const node2 = conditional(depth + 1);
      expect(")");
      return node2;
    }
    if (token.kind === "name") {
      const fn = functions.get(token.text);
      if (!fn) throw new Error(`Unknown function "${token.text}"; known: ${[...functions.keys()].join(", ")}`);
      checkDepth(depth + 1);
      expect("(");
      const args = [];
      if (!match(")")) {
        do
          args.push(conditional(depth + 1));
        while (match(","));
        expect(")");
      }
      if (args.length < fn.min || args.length > fn.max) throw new Error(`Wrong argument count for "${token.text}"`);
      return {
        kind: "call",
        name: token.text,
        args
      };
    }
    throw new Error("Expected a value");
  };
  const unary = (depth) => {
    checkDepth(depth);
    const token = current();
    if (token.kind === "symbol" && (token.text === "-" || token.text === "!")) {
      position++;
      return {
        kind: "unary",
        operator: token.text,
        operand: unary(depth + 1)
      };
    }
    return primary(depth);
  };
  const binary = (level, depth) => {
    const operators = precedence[level];
    if (!operators) return unary(depth);
    let left = binary(level + 1, depth);
    for (; ; ) {
      const token = current();
      if (token.kind !== "symbol" || !operators.includes(token.text)) return left;
      position++;
      left = {
        kind: "binary",
        operator: token.text,
        left,
        right: binary(level + 1, depth)
      };
    }
  };
  const conditional = (depth) => {
    const condition = binary(0, depth);
    if (!match("?")) return condition;
    const then = conditional(depth + 1);
    expect(":");
    return {
      kind: "conditional",
      condition,
      then,
      otherwise: conditional(depth + 1)
    };
  };
  const node = conditional(0);
  if (current().kind !== "end") throw new Error("Unexpected trailing token");
  return node;
};
var parsedFormulas = /* @__PURE__ */ new Map();
var parsedFormula = (formula) => {
  if (formula.length > 500) return "Formula exceeds 500 characters";
  const cached = parsedFormulas.get(formula);
  if (cached !== void 0) return cached;
  let result;
  try {
    result = parse(formula);
  } catch (error) {
    result = error instanceof Error ? error.message : "Invalid formula";
  }
  if (parsedFormulas.size >= 500) parsedFormulas.clear();
  parsedFormulas.set(formula, result);
  return result;
};
var childCount = (value, step) => {
  let count = 0;
  eachChild(value, () => {
    step();
    count++;
    return true;
  });
  return count;
};
var equal = (a, b, step) => {
  step();
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (childCount(a, step) !== childCount(b, step)) return false;
  return eachChild(a, (child, key) => equal(child, b[key], step));
};
var calculate = (operator, left, right, step) => {
  if (operator === "==") return equal(left, right, step);
  if (operator === "!=") return !equal(left, right, step);
  if (operator === "+" && (typeof left === "string" || typeof right === "string")) return formatText(left, step) + formatText(right, step);
  if ([
    "<",
    "<=",
    ">",
    ">="
  ].includes(operator)) {
    if (!(typeof left === "number" && typeof right === "number") && !(typeof left === "string" && typeof right === "string")) return false;
    if (operator === "<") return left < right;
    if (operator === "<=") return left <= right;
    if (operator === ">") return left > right;
    return left >= right;
  }
  if (!isNumber(left) || !isNumber(right)) return null;
  switch (operator) {
    case "+":
      return left + right;
    case "-":
      return left - right;
    case "*":
      return left * right;
    case "/":
      return right === 0 ? null : left / right;
    case "%":
      return right === 0 ? null : left % right;
    default:
      return null;
  }
};
var evaluate = (node, ctx, step) => {
  step();
  const visit = (child) => normalize(evaluate(child, ctx, step));
  switch (node.kind) {
    case "literal":
      return node.value;
    case "reference":
      return readReference(node.path, ctx);
    case "unary": {
      const value = visit(node.operand);
      return node.operator === "!" ? !value : isNumber(value) ? -value : null;
    }
    case "conditional":
      return visit(node.condition) ? visit(node.then) : visit(node.otherwise);
    case "call":
      return functions.get(node.name).run(node.args.map(visit), step);
    case "binary": {
      const left = visit(node.left);
      if (node.operator === "&&") return Boolean(left) && Boolean(visit(node.right));
      if (node.operator === "||") return Boolean(left) || Boolean(visit(node.right));
      return calculate(node.operator, left, visit(node.right), step);
    }
  }
};
function evaluateFormula(formula, ctx) {
  try {
    const node = parsedFormula(formula);
    if (typeof node === "string") return null;
    let steps = 0;
    return normalize(evaluate(node, ctx, () => {
      if (++steps > 1e4) throw new Error("Formula exceeds 10000 evaluation steps");
    }));
  } catch {
    return null;
  }
}

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/expressions.js
var SOURCE_KEYS = [
  "$state",
  "$bindState",
  "$item",
  "$bindItem",
  "$index",
  "$event"
];
var EXPRESSION_KEYS = /* @__PURE__ */ new Set([
  ...SOURCE_KEYS,
  "$cond",
  "$calc",
  "$template"
]);
var COMPARATORS = [
  "eq",
  "neq",
  "gt",
  "gte",
  "lt",
  "lte"
];
var isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isExpression = (value) => isRecord(value) && Object.keys(value).some((key) => EXPRESSION_KEYS.has(key));
var readPath2 = (base, path) => typeof path === "string" && path !== "" ? getAtPointer(base, safeTokens(path)) : base;
var safeTokens = (path) => {
  try {
    return parsePointer(path.startsWith("/") ? path : `/${path}`);
  } catch {
    return [];
  }
};
var readSource = (expression, ctx) => {
  if ("$state" in expression) return readPath2(ctx.state, expression["$state"]);
  if ("$bindState" in expression) return readPath2(ctx.state, expression["$bindState"]);
  if ("$item" in expression) return readPath2(ctx.item, expression["$item"]);
  if ("$bindItem" in expression) return readPath2(ctx.item, expression["$bindItem"]);
  if ("$index" in expression) return ctx.index;
  if ("$event" in expression) return readPath2(ctx.event, expression["$event"]);
};
var formatTemplateValue = (value) => value === void 0 || value === null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
function renderTemplate(template, ctx) {
  const fill = (ref) => {
    if (ref === "$index") return formatTemplateValue(ctx.index);
    if (ref === "$item") return formatTemplateValue(ctx.item);
    if (ref.startsWith("$item/")) return formatTemplateValue(readPath2(ctx.item, ref.slice(5)));
    return formatTemplateValue(readPath2(ctx.state, ref));
  };
  let out = "";
  let from = 0;
  for (const { start, end, ref } of placeholders(template)) {
    out += template.slice(from, start) + fill(ref);
    from = end + 1;
  }
  return out + template.slice(from);
}
function* placeholders(template) {
  let from = 0;
  for (; ; ) {
    const start = template.indexOf("${", from);
    if (start === -1) return;
    const end = template.indexOf("}", start + 2);
    if (end === -1) return;
    yield {
      start,
      end,
      ref: template.slice(start + 2, end).trim()
    };
    from = end + 1;
  }
}
function resolveValue(value, ctx) {
  if (Array.isArray(value)) return value.map((item) => resolveValue(item, ctx));
  if (!isRecord(value)) return value;
  if ("$cond" in value) return evaluateCondition(value["$cond"], ctx) ? resolveValue(value["$then"], ctx) : resolveValue(value["$else"], ctx);
  if ("$calc" in value) return typeof value["$calc"] === "string" ? evaluateFormula(value["$calc"], ctx) : null;
  if ("$template" in value) return typeof value["$template"] === "string" ? renderTemplate(value["$template"], ctx) : "";
  if (SOURCE_KEYS.some((key) => key in value)) return readSource(value, ctx);
  const result = {};
  for (const [key, child] of Object.entries(value)) result[key] = resolveValue(child, ctx);
  return result;
}
var compare = (left, operator, right) => {
  switch (operator) {
    case "eq":
      return deepEqual(left, right);
    case "neq":
      return !deepEqual(left, right);
    default:
      if (!(typeof left === "number" && typeof right === "number") && !(typeof left === "string" && typeof right === "string")) return false;
      if (operator === "gt") return left > right;
      if (operator === "gte") return left >= right;
      if (operator === "lt") return left < right;
      return left <= right;
  }
};
function evaluateCondition(condition, ctx) {
  return evaluateConditionValue(condition, ctx) ?? false;
}
function evaluateConditionValue(condition, ctx) {
  if (condition === void 0) return true;
  if (typeof condition === "boolean") return condition;
  if (Array.isArray(condition)) {
    let result2 = true;
    for (const part of condition) {
      const value2 = evaluateConditionValue(part, ctx);
      if (value2 === false) return false;
      if (value2 === void 0) result2 = void 0;
    }
    return result2;
  }
  if (!isRecord(condition)) return Boolean(condition);
  if (Array.isArray(condition["$and"])) return evaluateConditionValue(condition["$and"], ctx);
  if (Array.isArray(condition["$or"])) {
    let result2 = false;
    for (const part of condition["$or"]) {
      const value2 = evaluateConditionValue(part, ctx);
      if (value2 === true) return true;
      if (value2 === void 0) result2 = void 0;
    }
    return result2;
  }
  const hasSource = SOURCE_KEYS.some((key) => key in condition);
  if (!hasSource && "not" in condition) {
    const value2 = evaluateConditionValue(condition["not"], ctx);
    return value2 === void 0 ? void 0 : !value2;
  }
  if (!hasSource) {
    if (!isExpression(condition)) return void 0;
    let expression = condition;
    while (isRecord(expression) && "$cond" in expression) {
      const matches = evaluateConditionValue(expression["$cond"], ctx);
      if (matches === void 0) return void 0;
      expression = expression[matches ? "$then" : "$else"];
    }
    return Boolean(resolveValue(expression, ctx));
  }
  const value = readSource(condition, ctx);
  let result = true;
  let compared = false;
  for (const operator of COMPARATORS) {
    if (!(operator in condition)) continue;
    compared = true;
    result &&= compare(value, operator, resolveValue(condition[operator], ctx));
  }
  if (!compared) result = Boolean(value);
  return condition["not"] === true ? !result : result;
}
var normalizePath = (path) => path === "" || path.startsWith("/") ? path : `/${path}`;
function resolveProps(props, ctx) {
  const resolved = {};
  const bindings = {};
  for (const [key, value] of Object.entries(props ?? {})) {
    if (isRecord(value) && typeof value["$bindState"] === "string") bindings[key] = normalizePath(value["$bindState"]);
    else if (isRecord(value) && typeof value["$bindItem"] === "string" && ctx.itemPath !== void 0) {
      const field = value["$bindItem"];
      bindings[key] = field ? `${ctx.itemPath}${normalizePath(field)}` : ctx.itemPath;
    }
    resolved[key] = resolveValue(value, ctx);
  }
  return {
    props: resolved,
    bindings
  };
}
var itemPointer = (path, index) => `${path === "" ? "" : normalizePath(path)}${joinPointer([index])}`;

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/state.js
var normalize2 = (path) => path === "" || path.startsWith("/") ? path : `/${path}`;
function createStateStore(initial = {}, options = {}) {
  let base = initial;
  let state = initial;
  let writes = [];
  const shifting = /* @__PURE__ */ new WeakSet();
  const listeners = /* @__PURE__ */ new Set();
  const arrayParentsAt = (target, path) => {
    const tokens = parsePointer(path);
    return tokens.flatMap((_, index) => {
      const parent = joinPointer(tokens.slice(0, index));
      return Array.isArray(getAtPointer(target, parent)) ? [parent] : [];
    });
  };
  const parentOf = (path) => path.slice(0, path.lastIndexOf("/"));
  const apply = (target, path, value, mode, savedArrayParents = []) => {
    const arrayParents = [.../* @__PURE__ */ new Set([...savedArrayParents, ...arrayParentsAt(target, path)])];
    const parent = path === "" ? void 0 : getAtPointer(target, parentOf(path));
    const inserted = mode === "add" && path !== "" && (Array.isArray(parent) || parent === void 0 && arrayParents.includes(parentOf(path)));
    return {
      next: writeAtPointer(target, parsePointer(path), mode, value, { createMissing: true }, arrayParents),
      inserted,
      arrayParents
    };
  };
  const entryFor = (path, value, mode, arrayParents) => {
    if (arrayParents.length > 0) return [
      path,
      value,
      mode,
      arrayParents
    ];
    return mode === "replace" ? [
      path,
      value,
      mode
    ] : [path, value];
  };
  const record2 = (entry, inserted) => {
    const path = entry[0];
    if (inserted) {
      if (!path.endsWith("/-")) shifting.add(entry);
      writes = [...writes, entry];
      return;
    }
    const moved = writes.findLastIndex((write) => shifting.has(write) && path.startsWith(`${parentOf(write[0])}/`));
    writes = [...writes.filter(([written], index) => index <= moved || written !== path && !written.startsWith(`${path}/`)), entry];
  };
  const modeOf = (saved) => saved === "replace" ? "replace" : "add";
  const emit = () => {
    for (const listener of [...listeners]) listener(state);
  };
  for (const [rawPath, value, saved, savedArrayParents] of options.writes ?? []) {
    const path = normalize2(rawPath);
    const mode = modeOf(saved);
    try {
      const result = apply(state, path, value, mode, savedArrayParents?.map(normalize2));
      state = result.next;
      record2(entryFor(path, value, mode, result.arrayParents), result.inserted);
    } catch {
    }
  }
  return {
    getState: () => state,
    get: (path) => getAtPointer(state, normalize2(path)),
    set(rawPath, value, mode = "add") {
      const path = normalize2(rawPath);
      const result = apply(state, path, value, mode);
      record2(entryFor(path, value, mode, result.arrayParents), result.inserted);
      state = result.next;
      emit();
    },
    writes: () => writes,
    seed(next) {
      if (next === base) return;
      base = next;
      let merged = next;
      let changed = false;
      const applied = [];
      for (const write of writes) {
        const [path, value, saved, savedArrayParents] = write;
        const mode = modeOf(saved);
        try {
          const result = apply(merged, path, value, mode, savedArrayParents);
          merged = result.next;
          if (result.arrayParents.length === (savedArrayParents?.length ?? 0)) {
            applied.push(write);
            continue;
          }
          const entry = entryFor(path, value, mode, result.arrayParents);
          if (shifting.has(write)) shifting.add(entry);
          applied.push(entry);
          changed = true;
        } catch {
          changed = true;
        }
      }
      if (changed) writes = applied;
      state = merged;
      emit();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    }
  };
}

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/tree.js
var childIdsOf = (element, slot) => (slot === "default" ? element.children : element.slots?.[slot]) ?? [];
var safePointer = (path) => path.startsWith("/") || path === "" ? path : `/${path}`;
function repeatItems(repeat, state) {
  const items = getAtPointer(state, safePointer(repeat.path));
  if (!Array.isArray(items)) return void 0;
  return items.map((item, index) => ({
    key: repeat.key && item && typeof item === "object" ? String(item[repeat.key] ?? index) : String(index),
    scope: {
      item,
      index,
      itemPath: itemPointer(repeat.path, index)
    }
  }));
}

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/resolve.js
function resolveSpec(spec, options = {}) {
  const state = options.state === void 0 ? spec.state ?? {} : options.state;
  const resolve = (id, scope, ancestors, key) => {
    if (typeof id !== "string" || ancestors.includes(id) || !Object.hasOwn(spec.elements, id)) return null;
    const element = spec.elements[id];
    if (!element || typeof element !== "object" || typeof element.type !== "string") return null;
    const ctx = {
      ...scope,
      state
    };
    if (!evaluateCondition(element.visible, ctx)) return null;
    const { props, bindings } = resolveProps(element.props, ctx);
    const on = {};
    for (const [event, bound] of Object.entries(element.on ?? {})) on[event] = (Array.isArray(bound) ? bound : [bound]).filter((binding) => typeof binding?.action === "string").map((binding) => ({
      action: binding.action,
      params: resolveValue(binding.params ?? {}, ctx) ?? {}
    }));
    const inside = [...ancestors, id];
    const list = (ids, childScope, itemKey) => ids.flatMap((childId) => resolve(childId, childScope, inside, itemKey) ?? []);
    const children = element.repeat && typeof element.repeat.path === "string" ? (repeatItems(element.repeat, state) ?? []).flatMap((item) => list(childIdsOf(element, "default"), item.scope, item.key)) : list(childIdsOf(element, "default"), scope);
    const slots = {};
    for (const [slot, ids] of Object.entries(element.slots ?? {})) if (slot !== "default" && Array.isArray(ids)) slots[slot] = list(ids, scope);
    return {
      id,
      type: element.type,
      props,
      bindings,
      on,
      children,
      slots,
      ...key !== void 0 ? { key } : {},
      ...scope.itemPath !== void 0 ? { itemPath: scope.itemPath } : {}
    };
  };
  return resolve(spec.root, {}, []);
}

// src/catalog.generated.json
var catalog_generated_default = {
  components: {
    Header: {
      description: "A section heading. Renders as a bold title.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          text: {
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ],
            description: "The heading text or number."
          },
          size: {
            description: "Heading size; defaults to `lg`.",
            type: "string",
            enum: [
              "sm",
              "md",
              "lg",
              "xl",
              "2xl",
              "3xl"
            ]
          }
        },
        required: [
          "text"
        ]
      },
      slots: [
        "default"
      ]
    },
    Text: {
      description: "A run of text. Use for paragraphs, labels, or inline copy.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          value: {
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ],
            description: "The text or number to display."
          },
          size: {
            description: "Text size; defaults to `md`.",
            type: "string",
            enum: [
              "sm",
              "md",
              "lg",
              "xl",
              "2xl",
              "3xl"
            ]
          },
          weight: {
            description: "Font weight.",
            type: "string",
            enum: [
              "normal",
              "medium",
              "semibold",
              "bold"
            ]
          },
          color: {
            description: "Foreground color token.",
            type: "string",
            enum: [
              "emphasis",
              "secondary",
              "alpha-70",
              "white",
              "white-70",
              "white-50"
            ]
          }
        },
        required: [
          "value"
        ]
      },
      slots: [
        "default"
      ]
    },
    Caption: {
      description: "Secondary, de-emphasized text under a primary element.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          value: {
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ],
            description: "The caption text or number."
          }
        },
        required: [
          "value"
        ]
      },
      slots: [
        "default"
      ]
    },
    Divider: {
      description: "A horizontal rule between sections.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          flush: {
            description: "Whether the divider spans the full width with no inset.",
            type: "boolean"
          }
        }
      }
    },
    Fact: {
      description: "A label/value pair, rendered as a key followed by its value. Use for compact metadata, and put an answer's key figures side by side in a `Row`.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          label: {
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ],
            description: "The fact label (key) as text or a number."
          },
          value: {
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ],
            description: "The fact value as text or a number."
          },
          delta: {
            description: "Change from before.",
            type: "string"
          },
          trend: {
            description: "Change direction.",
            type: "string",
            enum: [
              "up",
              "down",
              "flat"
            ]
          },
          upIsGood: {
            description: "Whether up is good.",
            type: "boolean"
          }
        },
        required: [
          "label",
          "value"
        ]
      },
      slots: [
        "default"
      ]
    },
    Button: {
      description: "A clickable button. Emits `press` on click. Set `submit` to submit an ancestor Form or Card instead.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          label: {
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ],
            description: "Button label text or number."
          },
          buttonStyle: {
            description: "Visual style.",
            type: "string",
            enum: [
              "primary",
              "secondary",
              "outline",
              "ghost",
              "danger"
            ]
          },
          block: {
            description: "Whether the button spans the full width.",
            type: "boolean"
          },
          submit: {
            description: "Render as a submit button for an ancestor Form/Card instead of a click button.",
            type: "boolean"
          },
          undoable: {
            description: "Delay the action with an undo control, for sends and other hard-to-reverse actions.",
            type: "boolean"
          }
        },
        required: [
          "label"
        ]
      },
      slots: [
        "default"
      ],
      events: [
        "press"
      ]
    },
    Select: {
      description: "A dropdown selector. Emits `change` with the selected value.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string"
                },
                value: {
                  type: "string"
                }
              },
              required: [
                "label",
                "value"
              ]
            },
            description: "Selectable options."
          },
          placeholder: {
            description: "Placeholder text or number shown when nothing is selected.",
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ]
          },
          label: {
            description: "Accessible label for the control.",
            type: "string"
          },
          name: {
            description: "Field name used inside a Form.",
            type: "string"
          },
          defaultValue: {
            description: "Initially selected value.",
            type: "string"
          }
        },
        required: [
          "options"
        ]
      },
      slots: [
        "default"
      ],
      events: [
        "change"
      ]
    },
    Input: {
      description: "A text input. Outside a Form it emits `submit` with its text on Enter (Ctrl or Cmd+Enter when `multiline`); inside a Form its value arrives with the Form's `submit`.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          inputType: {
            description: "Single-line input type. Values remain strings.",
            type: "string",
            enum: [
              "text",
              "password",
              "number"
            ]
          },
          placeholder: {
            description: "Placeholder text.",
            type: "string"
          },
          multiline: {
            description: 'Render a textarea instead of a single-line input; ignored when `inputType` is `"password"` or `"number"`.',
            type: "boolean"
          },
          label: {
            description: "Accessible label for the control.",
            type: "string"
          },
          name: {
            description: "Field name used inside a Form.",
            type: "string"
          },
          defaultValue: {
            description: "Initial text.",
            type: "string"
          }
        }
      },
      events: [
        "submit"
      ]
    },
    DatePicker: {
      description: "A date, datetime, or time input. Emits `change` once per committed value: a pick from the picker, or a typed value on blur or Enter.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          inputType: {
            description: 'Temporal input type. Defaults to "date". Values remain strings.',
            type: "string",
            enum: [
              "date",
              "datetime",
              "time"
            ]
          },
          value: {
            description: "Initial value: YYYY-MM-DD for date, HH:mm or HH:mm:ss with optional fraction of at most 9 digits for time, YYYY-MM-DDTHH:mm with optional :ss and fraction of at most 9 digits for datetime. A datetime with Z or \xB1HH:mm is an instant, displayed in the viewer's time zone and submitted with the same offset and precision. A datetime without an offset is local and submitted unchanged. An empty datetime submits with the viewer's offset and seconds.",
            type: "string"
          },
          min: {
            description: "Minimum value: YYYY-MM-DD for date, HH:mm or HH:mm:ss with optional fraction of at most 9 digits for time, YYYY-MM-DDTHH:mm with optional :ss and fraction of at most 9 digits for datetime. Datetimes with Z or \xB1HH:mm are converted to the viewer's time zone.",
            type: "string"
          },
          max: {
            description: "Maximum value: YYYY-MM-DD for date, HH:mm or HH:mm:ss with optional fraction of at most 9 digits for time, YYYY-MM-DDTHH:mm with optional :ss and fraction of at most 9 digits for datetime. Datetimes with Z or \xB1HH:mm are converted to the viewer's time zone.",
            type: "string"
          },
          label: {
            description: "Accessible label for the control.",
            type: "string"
          },
          name: {
            description: "Field name used inside a Form.",
            type: "string"
          }
        }
      },
      events: [
        "change"
      ]
    },
    Checkbox: {
      description: "A checkbox with a label. Emits `change` with whether it is checked.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          label: {
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ],
            description: "Label text or number next to the checkbox."
          },
          name: {
            description: "Field name used inside a Form.",
            type: "string"
          },
          defaultChecked: {
            description: "Whether the checkbox starts checked.",
            type: "boolean"
          },
          variant: {
            description: "Whether to render a checkbox or switch.",
            type: "string",
            enum: [
              "checkbox",
              "switch"
            ]
          }
        },
        required: [
          "label"
        ]
      },
      events: [
        "change"
      ]
    },
    Slider: {
      description: "A numeric range control. Emits `change` with the value once an adjustment finishes.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          name: {
            description: "Field name used inside a Form.",
            type: "string"
          },
          label: {
            description: "Accessible label for the control.",
            type: "string"
          },
          min: {
            type: "number",
            description: "Minimum value."
          },
          max: {
            type: "number",
            description: "Maximum value."
          },
          step: {
            description: "Value increment. Defaults to 1.",
            type: "number"
          },
          defaultValue: {
            description: "Initial value.",
            type: "number"
          },
          unit: {
            description: "Unit shown with the value.",
            type: "string"
          }
        },
        required: [
          "min",
          "max"
        ]
      },
      events: [
        "change"
      ]
    },
    RadioGroup: {
      description: "A group of mutually exclusive radio options. Emits `change` with the selected value.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string"
                },
                value: {
                  type: "string"
                },
                description: {
                  type: "string"
                }
              },
              required: [
                "label",
                "value"
              ]
            },
            description: "Selectable options."
          },
          name: {
            description: "Field name used inside a Form.",
            type: "string"
          },
          label: {
            description: "Accessible name for the group.",
            type: "string"
          },
          defaultValue: {
            description: "Initially selected value.",
            type: "string"
          }
        },
        required: [
          "options"
        ]
      },
      slots: [
        "default"
      ],
      events: [
        "change"
      ]
    },
    CheckboxGroup: {
      description: "A group of checkbox options where any number can be checked. Set `progress` for a checklist the user works through. Emits `change` with the checked values.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          options: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string"
                },
                value: {
                  type: "string"
                },
                description: {
                  type: "string"
                }
              },
              required: [
                "label",
                "value"
              ]
            },
            description: "Selectable options."
          },
          name: {
            description: "Field name used inside a Form.",
            type: "string"
          },
          label: {
            description: "Accessible name for the group.",
            type: "string"
          },
          defaultValue: {
            description: "Initially checked values.",
            type: "array",
            items: {
              type: "string"
            }
          },
          progress: {
            description: "Show how many options are checked, with a progress bar.",
            type: "boolean"
          }
        },
        required: [
          "options"
        ]
      },
      slots: [
        "default"
      ],
      events: [
        "change"
      ]
    },
    Card: {
      description: "A module the reader scans or acts on, such as a summary, a checklist, a form, or one option in a comparison. It renders as a panel, so keep plain sections (a `Header` with `Text` or `Markdown`) outside cards, and do not wrap the whole answer in one card or nest cards. It takes on a framed surface when `background` is set, when `confirm`/`cancel` add a footer, or when it is a slot in a `Carousel`. Set `asForm` to collect named child control values on submit.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          title: {
            description: "Optional card title text or number.",
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ]
          },
          padding: {
            description: "Padding in 4px units (e.g. 2 = 8px). 0 to 8 is the supported range.",
            type: "number",
            minimum: 0,
            maximum: 8
          },
          background: {
            description: "Background color or gradient (any CSS background value). Setting this also switches the card's own text to white, since a custom background makes the card a tinted surface; children can still opt into a different color explicitly.",
            type: "string"
          },
          asForm: {
            description: "Render as a form; submitting it, through the confirm button or a child Button with `submit`, emits `confirm` with every named child control's value, keyed by `name`.",
            type: "boolean"
          },
          confirm: {
            description: "Confirm button shown in the footer; emits `confirm`.",
            type: "object",
            properties: {
              label: {
                anyOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "number"
                  }
                ],
                description: "Footer button label text or number."
              }
            },
            required: [
              "label"
            ]
          },
          cancel: {
            description: "Cancel button shown in the footer; emits `cancel`.",
            type: "object",
            properties: {
              label: {
                anyOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "number"
                  }
                ],
                description: "Footer button label text or number."
              }
            },
            required: [
              "label"
            ]
          }
        }
      },
      slots: [
        "default"
      ],
      events: [
        "confirm",
        "cancel"
      ]
    },
    Col: {
      description: "A vertical stack; children laid out top to bottom.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          gap: {
            description: "Gap between children in 4px units. 0 to 8 is the supported range.",
            type: "number",
            minimum: 0,
            maximum: 8
          },
          align: {
            description: "Cross-axis alignment.",
            type: "string",
            enum: [
              "start",
              "center",
              "end"
            ]
          }
        }
      },
      slots: [
        "default"
      ]
    },
    Row: {
      description: "A horizontal row; children laid out left to right.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          gap: {
            description: "Gap between children in 4px units. 0 to 8 is the supported range.",
            type: "number",
            minimum: 0,
            maximum: 8
          },
          align: {
            description: "Cross-axis alignment.",
            type: "string",
            enum: [
              "start",
              "center",
              "end"
            ]
          },
          justify: {
            description: "Main-axis distribution.",
            type: "string",
            enum: [
              "start",
              "center",
              "end",
              "between"
            ]
          }
        }
      },
      slots: [
        "default"
      ]
    },
    Spacer: {
      description: "Empty space that pushes neighbors apart.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {}
      }
    },
    Badge: {
      description: "A small labeled tag, e.g. for status or category.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          value: {
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ],
            description: "Badge text or number."
          },
          variant: {
            description: "Visual variant token.",
            type: "string"
          }
        },
        required: [
          "value"
        ]
      },
      slots: [
        "default"
      ]
    },
    Box: {
      description: "A generic container for composition, e.g. a progress bar built from an outer track Box containing a partial-width fill Box. Size, radius, and background accept arbitrary values, so they render as inline styles rather than data-attribute hooks.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          width: {
            description: "Width; a number is pixels.",
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ]
          },
          height: {
            description: "Height; a number is pixels.",
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ]
          },
          radius: {
            description: 'Corner radius; "full" is a pill/circle, a number is pixels.',
            anyOf: [
              {
                type: "string",
                const: "full"
              },
              {
                type: "number"
              }
            ]
          },
          background: {
            description: "Background color or gradient (any CSS background value).",
            type: "string"
          }
        }
      },
      slots: [
        "default"
      ]
    },
    Tabs: {
      description: "Panels the user switches between with tabs, one visible at a time. Use it for parallel content the user looks at one part at a time, such as options, plans, or days. Each child is one panel, usually a Col, labeled by the matching entry in `tabs`.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          tabs: {
            type: "array",
            items: {
              anyOf: [
                {
                  type: "string"
                },
                {
                  type: "number"
                }
              ]
            },
            description: "Tab labels as text or numbers, one per child panel, in order."
          },
          label: {
            description: "Accessible name as text or a number for the row of tabs.",
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ]
          }
        },
        required: [
          "tabs"
        ]
      },
      slots: [
        "default"
      ]
    },
    ListView: {
      description: "A vertical list container. Wrap `ListViewItem` children as rows.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {}
      },
      slots: [
        "default"
      ]
    },
    ListViewItem: {
      description: "A row inside a ListView. Emits `press` when the row is clicked or activated with Enter or Space.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {}
      },
      slots: [
        "default"
      ],
      events: [
        "press"
      ]
    },
    Steps: {
      description: "Numbered steps to follow in order, such as instructions or a how-to guide. Each step has a short `title` saying what to do and an optional `detail` on how.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          steps: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: {
                  anyOf: [
                    {
                      type: "string"
                    },
                    {
                      type: "number"
                    }
                  ],
                  description: "What to do, in a few words, as text or a number."
                },
                detail: {
                  description: "How to do it, or what to watch for, as text or a number.",
                  anyOf: [
                    {
                      type: "string"
                    },
                    {
                      type: "number"
                    }
                  ]
                }
              },
              required: [
                "title"
              ]
            },
            description: "The steps, in order."
          }
        },
        required: [
          "steps"
        ]
      }
    },
    Timeline: {
      description: "Events in time order, each with a time or date label, such as a schedule, an itinerary, or a history.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          items: {
            type: "array",
            items: {
              type: "object",
              properties: {
                time: {
                  anyOf: [
                    {
                      type: "string"
                    },
                    {
                      type: "number"
                    }
                  ],
                  description: "When it happens, as the user should read it, such as `Day 1`, `6:00 pm`, or `1969`, as text or a number."
                },
                title: {
                  anyOf: [
                    {
                      type: "string"
                    },
                    {
                      type: "number"
                    }
                  ],
                  description: "What happens, as text or a number."
                },
                detail: {
                  description: "More about it, as text or a number.",
                  anyOf: [
                    {
                      type: "string"
                    },
                    {
                      type: "number"
                    }
                  ]
                }
              },
              required: [
                "time",
                "title"
              ]
            },
            description: "The events, in time order."
          }
        },
        required: [
          "items"
        ]
      }
    },
    Table: {
      description: "Tabular data. Provide `columns` and `rows`; each row is an array of cells matching the columns.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          columns: {
            description: "Column definitions.",
            type: "array",
            items: {
              type: "object",
              properties: {
                label: {
                  type: "string",
                  description: "Column header label."
                },
                align: {
                  description: "Cell alignment.",
                  type: "string",
                  enum: [
                    "start",
                    "end"
                  ]
                },
                format: {
                  description: "Cell value format.",
                  type: "object",
                  properties: {
                    kind: {
                      type: "string",
                      enum: [
                        "number",
                        "currency",
                        "percent",
                        "date"
                      ],
                      description: "Format kind. `percent` takes a fraction, so 0.25 renders as 25%."
                    },
                    currency: {
                      description: "Currency code.",
                      type: "string"
                    },
                    decimals: {
                      description: "Decimal places.",
                      type: "number"
                    }
                  },
                  required: [
                    "kind"
                  ]
                }
              },
              required: [
                "label"
              ]
            }
          },
          rows: {
            description: "Rows of cells.",
            type: "array",
            items: {
              type: "array",
              items: {
                anyOf: [
                  {
                    type: "string"
                  },
                  {
                    type: "number"
                  },
                  {
                    type: "boolean"
                  }
                ],
                description: "A cell value."
              }
            }
          },
          sortable: {
            description: "Allow header sorting.",
            type: "boolean"
          }
        }
      },
      slots: [
        "default"
      ]
    },
    Chart: {
      description: "A chart. `variant` selects bar, line, sparkline, or area rendering. Provide `data` for a single series, or `series` for multiple named series (`series` takes precedence over `data` when both are present). Set `stacked` to accumulate series values instead of overlaying them, and `showAxis`/`showLegend` to add y-axis ticks, x-axis point labels, and a legend.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          variant: {
            type: "string",
            enum: [
              "bar",
              "line",
              "sparkline",
              "area"
            ],
            description: "Chart variant."
          },
          data: {
            description: "Data points for a single series.",
            type: "array",
            items: {
              type: "object",
              properties: {
                label: {
                  description: "Point label.",
                  type: "string"
                },
                value: {
                  type: "number",
                  description: "Point value."
                }
              },
              required: [
                "value"
              ]
            }
          },
          series: {
            description: "Multiple named series; takes precedence over `data` when present.",
            type: "array",
            items: {
              type: "object",
              properties: {
                label: {
                  description: "Series label, shown in the legend.",
                  type: "string"
                },
                color: {
                  description: "Series color. One of `emphasis`, `secondary`, `alpha-70`, `white`, `white-70`, or `white-50`, matching Text's `color` tokens; other values have no visual effect.",
                  type: "string"
                },
                data: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      label: {
                        description: "Point label.",
                        type: "string"
                      },
                      value: {
                        type: "number",
                        description: "Point value."
                      }
                    },
                    required: [
                      "value"
                    ]
                  },
                  description: "Data points for this series."
                }
              },
              required: [
                "data"
              ]
            }
          },
          stacked: {
            description: "Accumulate series values instead of overlaying them (bar and area variants; ignored for line and sparkline).",
            type: "boolean"
          },
          showAxis: {
            description: "Show y-axis ticks and x-axis point labels.",
            type: "boolean"
          },
          showLegend: {
            description: "Show a legend mapping each series to its color.",
            type: "boolean"
          },
          color: {
            description: "Series color (single-series mode only). One of `emphasis`, `secondary`, `alpha-70`, `white`, `white-70`, or `white-50`, matching Text's `color` tokens; other values have no visual effect.",
            type: "string"
          }
        },
        required: [
          "variant"
        ]
      }
    },
    Alert: {
      description: "A highlighted message conveying urgency. `tone` drives the severity.",
      props: {
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: {
          title: {
            description: "Alert title text or number.",
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ]
          },
          description: {
            description: "Supporting description text or number.",
            anyOf: [
              {
                type: "string"
              },
              {
                type: "number"
              }
            ]
          },
          tone: {
            description: "Severity tone; defaults to `info`.",
            type: "string",
            enum: [
              "info",
              "success",
              "warning",
              "danger"
            ]
          }
        }
      },
      slots: [
        "default"
      ]
    },
    Grid: {
      description: "Responsive equal-width layout, in document order. columns is the maximum (default 2): below 560px content width use one column, below 900px at most two. gap uses 4px units, including fractions. Layout only; no input state.",
      props: {
        type: "object",
        properties: {
          columns: {
            type: "integer",
            enum: [
              1,
              2,
              3
            ],
            default: 2
          },
          gap: {
            type: "number",
            minimum: 0,
            maximum: 8,
            default: 4
          }
        },
        additionalProperties: false
      },
      slots: [
        "default"
      ]
    },
    NumberInput: {
      description: "Editable numeric value. Bind value with $bindState to a number or null; unlike text Input this stays numeric for formulas. Clearing writes null. Optional showSlider shares this ONE value and requires finite min < max; null disables the slider. step only controls slider/arrow increments, never rounds numeric text. unit is display only.",
      props: {
        type: "object",
        properties: {
          label: {
            type: "string"
          },
          value: {
            type: [
              "number",
              "null"
            ]
          },
          min: {
            type: "number"
          },
          max: {
            type: "number"
          },
          step: {
            type: "number",
            exclusiveMinimum: 0
          },
          showSlider: {
            type: "boolean",
            default: false
          },
          unit: {
            type: "string"
          }
        },
        required: [
          "label",
          "value"
        ],
        additionalProperties: false
      },
      events: [
        "change"
      ]
    }
  },
  actions: {
    analyze: {
      description: "Explicitly send selected current input values for a new agent answer. Bind only to Button press; ordinary changes and watches never send.",
      params: {
        type: "object",
        properties: {
          prompt: {
            type: "string"
          },
          paths: {
            type: "array",
            items: {
              type: "string"
            }
          }
        },
        required: [
          "prompt",
          "paths"
        ],
        additionalProperties: false
      }
    }
  }
};

// src/state.ts
var UiStateError = class extends Error {
  constructor(code, path, current) {
    super(code);
    this.code = code;
    this.path = path;
    this.current = current;
    this.name = "UiStateError";
  }
};
var forbidden = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
var expressionKeys = /* @__PURE__ */ new Set([
  "$state",
  "$bindState",
  "$item",
  "$bindItem",
  "$index",
  "$event",
  "$calc",
  "$template",
  "$cond",
  "$then",
  "$else",
  "$and",
  "$or"
]);
function record(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function jsonSafe(value, ancestors = /* @__PURE__ */ new Set()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || !Array.isArray(value) && !record(value)) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const keys = Reflect.ownKeys(value).filter((key) => !(Array.isArray(value) && key === "length"));
  const valid = (!Array.isArray(value) || keys.length === value.length) && keys.every((key) => {
    if (typeof key !== "string" || forbidden.has(key) || expressionKeys.has(key)) return false;
    if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return false;
    const property = Object.getOwnPropertyDescriptor(value, key);
    return property.enumerable && "value" in property && jsonSafe(property.value, ancestors);
  });
  ancestors.delete(value);
  return valid;
}
function safePath(path) {
  if (!path.startsWith("/") || /~(?![01])/u.test(path)) return false;
  return path.slice(1).split("/").every((token) => {
    const decoded = token.replace(/~1/g, "/").replace(/~0/g, "~");
    return !forbidden.has(decoded) && decoded !== "-";
  });
}
var controls = {
  NumberInput: { prop: "value", kind: "numberOrNull" },
  Input: { prop: "defaultValue", kind: "string" },
  Select: { prop: "defaultValue", kind: "string" },
  RadioGroup: { prop: "defaultValue", kind: "string" },
  CheckboxGroup: { prop: "defaultValue", kind: "strings" },
  Checkbox: { prop: "defaultChecked", kind: "boolean" },
  Slider: { prop: "defaultValue", kind: "number" },
  DatePicker: { prop: "value", kind: "string" }
};
function uiControlInput(element) {
  const control = controls[element.type];
  if (!control) return void 0;
  const binding = element.props?.[control.prop];
  if (record(binding) && typeof binding.$bindState === "string") return void 0;
  const paths = /* @__PURE__ */ new Set();
  const components = catalog_generated_default.components;
  for (const event of components[element.type]?.events ?? []) {
    const actions = element.on?.[event];
    for (const action of actions ? Array.isArray(actions) ? actions : [actions] : []) {
      const value = action.params?.value;
      const path = action.params?.path;
      if (action.action === "setState" && typeof path === "string" && safePath(path) && record(value) && Object.keys(value).length === 1 && (value.$event === true || value.$event === "")) paths.add(path);
    }
  }
  return paths.size === 1 ? { prop: control.prop, path: [...paths][0] } : void 0;
}
function reachable(spec) {
  const found = [];
  const visited = /* @__PURE__ */ new Set();
  const pending = [spec.root];
  while (pending.length) {
    const id = pending.pop();
    if (visited.has(id) || !Object.hasOwn(spec.elements, id)) continue;
    visited.add(id);
    const element = spec.elements[id];
    found.push(element);
    pending.push(...element.children ?? [], ...Object.values(element.slots ?? {}).flat());
  }
  return found;
}
function watchTargets(elements, state = {}) {
  const targets = /* @__PURE__ */ new Set();
  for (const element of elements) {
    if (!element.watch) continue;
    const resolved = resolveSpec({ root: "input", elements: { input: {
      type: element.type,
      on: element.watch
    } }, state });
    for (const actions of Object.values(resolved?.on ?? {})) {
      for (const action of actions) {
        if (action.action === "setState" && typeof action.params.path === "string") {
          targets.add(action.params.path);
        }
      }
    }
  }
  return targets;
}
function derivedPath(path, targets) {
  return [...targets].some((other) => other === "" || path === other || path.startsWith(other + "/") || other.startsWith(path + "/"));
}
function declarations(spec) {
  const writable = /* @__PURE__ */ new Map();
  const elements = reachable(spec);
  const derived = watchTargets(elements, spec.state);
  const seed = createStateStore(spec.state);
  const add = (path, declaration) => {
    if (typeof path !== "string" || !safePath(path)) return;
    writable.set(path, [...writable.get(path) ?? [], declaration]);
  };
  for (const element of elements) {
    const control = Object.hasOwn(controls, element.type) ? controls[element.type] : void 0;
    const binding = control && element.props?.[control.prop];
    if (record(binding) && Object.keys(binding).length === 1) {
      add(binding.$bindState, { element, control: true });
    }
    const components = catalog_generated_default.components;
    const events = Object.hasOwn(components, element.type) ? components[element.type].events ?? [] : [];
    for (const event of events) {
      const bound = element.on?.[event];
      for (const action of bound ? Array.isArray(bound) ? bound : [bound] : []) {
        const path = action.params?.path;
        if (action.action !== "setState" || typeof path !== "string" || !safePath(path)) continue;
        const resolved = resolveSpec({ root: "input", elements: { input: {
          type: element.type,
          on: { [event]: action }
        } }, state: spec.state });
        const initial = seed.get(path);
        const sample = initial === void 0 ? resolved?.on[event]?.[0]?.params.value : initial;
        const payload = action.params?.value;
        const directControlEvent = control !== void 0 && record(payload) && Object.keys(payload).length === 1 && (payload.$event === true || payload.$event === "");
        add(path, { element, control: directControlEvent, sample });
      }
    }
  }
  for (const path of writable.keys()) {
    if (derivedPath(path, derived)) writable.delete(path);
  }
  return writable;
}
function writableUiPaths(spec) {
  return [...declarations(spec).keys()].sort();
}
function sameShape(value, sample) {
  if (sample === null) return value === null;
  if (Array.isArray(sample)) {
    return Array.isArray(value) && (sample.length === 0 ? value.length === 0 : value.every((item) => sample.some((candidate) => sameShape(item, candidate))));
  }
  if (record(sample)) {
    return record(value) && Object.keys(value).length === Object.keys(sample).length && Object.keys(sample).every((key) => Object.hasOwn(value, key) && sameShape(value[key], sample[key]));
  }
  return sample !== void 0 && typeof value === typeof sample;
}
function temporal(value, kind) {
  const date = /(\d{4})-(\d{2})-(\d{2})/.source;
  const time = /(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?/.source;
  const zonePattern = /(Z|[+-]\d{2}:\d{2})?/.source;
  const pattern = kind === "time" ? `^${time}$` : kind === "datetime" ? `^${date}T${time}${zonePattern}$` : `^${date}$`;
  const match = new RegExp(pattern).exec(value);
  if (!match) return void 0;
  let dateValue = 0;
  if (kind !== "time") {
    const [, year, month, day] = match;
    const parsed = /* @__PURE__ */ new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (+year < 1 || parsed.getUTCFullYear() !== +year || parsed.getUTCMonth() + 1 !== +month || parsed.getUTCDate() !== +day) return void 0;
    dateValue = parsed.getTime() / 1e3;
  }
  if (kind !== "time" && kind !== "datetime") return dateValue;
  const offset = kind === "time" ? 1 : 4;
  const hour = Number(match[offset]), minute = Number(match[offset + 1]);
  const second = Number(match[offset + 2] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return void 0;
  const zone = kind === "datetime" ? match[8] : void 0;
  let zoneSeconds = 0;
  if (zone && zone !== "Z") {
    const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4));
    if (hours > 23 || minutes > 59) return void 0;
    zoneSeconds = (hours * 3600 + minutes * 60) * (zone[0] === "+" ? 1 : -1);
  }
  return dateValue + hour * 3600 + minute * 60 + second + Number("0." + (match[offset + 3] ?? "0")) - zoneSeconds;
}
function validControl(value, declaration, state) {
  const { element } = declaration;
  const control = controls[element.type];
  if (control.kind === "numberOrNull") {
    if (value !== null && typeof value !== "number") return false;
  } else if (control.kind === "strings") {
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string")) return false;
  } else if (typeof value !== control.kind) return false;
  const props = resolveSpec({ root: "input", elements: { input: {
    type: element.type,
    props: element.props
  } } }, { state })?.props ?? {};
  if (element.type === "NumberInput") {
    return value === null || typeof value === "number" && Number.isFinite(value) && (typeof props.min !== "number" || value >= props.min) && (typeof props.max !== "number" || value <= props.max);
  }
  if (element.type === "Slider") {
    const finite = (candidate) => typeof candidate === "number" && Number.isFinite(candidate);
    const min = finite(props.min) ? props.min : 0;
    const max = finite(props.max) ? Math.max(props.max, min) : min + 100;
    const step = finite(props.step) && props.step > 0 ? props.step : 1;
    const number = value;
    const ticks = (number - min) / step;
    return number >= min && number <= max && Math.abs(ticks - Math.round(ticks)) <= Number.EPSILON * Math.max(1, Math.abs(ticks)) * 8;
  }
  if (["Select", "RadioGroup", "CheckboxGroup"].includes(element.type)) {
    const options = Array.isArray(props.options) ? props.options : [];
    const candidates = Array.isArray(value) ? value : [value];
    if (element.type === "Select" && value === "" && props.placeholder !== void 0) return true;
    return new Set(candidates).size === candidates.length && candidates.every((candidate) => options.some((option) => record(option) && option.value === candidate));
  }
  if (element.type === "DatePicker" && value !== "") {
    const current = temporal(value, props.inputType);
    if (current === void 0) return false;
    const bound = (raw) => {
      if (typeof raw !== "string") return void 0;
      const hasZone = (text) => /(?:Z|[+-]\d{2}:\d{2})$/.test(text);
      if (props.inputType === "datetime" && hasZone(raw) !== hasZone(value)) return void 0;
      return temporal(raw, props.inputType);
    };
    const min = bound(props.min);
    const max = bound(props.max);
    return (min === void 0 || current >= min) && (max === void 0 || current <= max);
  }
  return true;
}
function validateUiValues(spec, values) {
  if (!record(values) || !jsonSafe(values)) throw new UiStateError("INVALID_VALUE", "/values/*");
  const writable = declarations(spec);
  const state = createStateStore(spec.state);
  for (const [path, value] of Object.entries(values)) {
    if (!safePath(path)) throw new UiStateError("INVALID_PATH", "/values/*");
    if (!writable.has(path)) throw new UiStateError("UNDECLARED_INPUT", "/values/*");
    if (Object.keys(values).some((other) => other !== path && path.startsWith(other + "/"))) {
      throw new UiStateError("INVALID_PATH", "/values/*");
    }
    try {
      state.set(path, value, "replace");
    } catch {
      throw new UiStateError("INVALID_PATH", "/values/*");
    }
  }
  const derived = watchTargets(reachable(spec), state.getState());
  for (const [path, value] of Object.entries(values)) {
    if (derivedPath(path, derived)) throw new UiStateError("UNDECLARED_INPUT", "/values/*");
    const declarations2 = writable.get(path);
    const bound = declarations2.filter((item) => item.control);
    const valid = bound.length ? bound.every((item) => validControl(value, item, state.getState())) : declarations2.some((item) => sameShape(value, item.sample));
    if (!valid) throw new UiStateError("INVALID_VALUE", "/values/*");
  }
  return structuredClone(values);
}
function freezeUiSaveRequest(request) {
  if (!record(request) || !jsonSafe(request)) throw new UiStateError("INVALID_REQUEST", "/request");
  if (Object.keys(request).sort().join(",") !== "document_revision,expected_revision,operation_id,values") {
    throw new UiStateError("INVALID_REQUEST", "/request");
  }
  for (const key of ["document_revision", "expected_revision"]) {
    if (!Number.isSafeInteger(request[key]) || request[key] < 0) {
      throw new UiStateError("INVALID_REQUEST", "/" + key);
    }
  }
  if (typeof request.operation_id !== "string" || !request.operation_id.length) {
    throw new UiStateError("INVALID_REQUEST", "/operation_id");
  }
  if (!record(request.values)) throw new UiStateError("INVALID_REQUEST", "/values");
  return structuredClone(request);
}
function uiRequestFingerprint(request) {
  const canonical = (value) => Array.isArray(value) ? value.map(canonical) : record(value) ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(request));
}
export {
  UiStateError,
  freezeUiSaveRequest,
  uiControlInput,
  uiRequestFingerprint,
  validateUiValues,
  writableUiPaths
};
//# sourceMappingURL=state.js.map

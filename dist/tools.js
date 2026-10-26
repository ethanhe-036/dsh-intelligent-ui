// src/tools.ts
import { defineTool, ToolArgsError } from "@deepseek-ai/dsh-tools";
import "@deepseek-ai/dsh-system-prompt";

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/types.js
var emptySpec = () => ({
  root: "",
  elements: {},
  state: {}
});

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/json-schema.js
var isStandardSchema = (value) => typeof value === "object" && value !== null && "~standard" in value && typeof value["~standard"]?.validate === "function";
var toJsonSchema = (schema) => {
  if (!schema) return void 0;
  if (!isStandardSchema(schema)) return schema;
  try {
    return schema["~standard"].jsonSchema?.input({ target: "draft-2020-12" });
  } catch {
    return;
  }
};
var escapeToken = (token) => String(token).replace(/~/g, "~0").replace(/\//g, "~1");
var typeOf = (value) => {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
};
var matchesType = (value, type) => {
  const actual = typeOf(value);
  if (type === "number") return actual === "number" || actual === "integer";
  return actual === type;
};
var deepEqual = (a, b) => {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  return keysA.length === keysB.length && keysA.every((key) => deepEqual(a[key], b[key]));
};
function validateJsonSchema(schema, value, options = {}, path = "") {
  if (options.skip?.(value)) return [];
  const issues = [];
  const at = path || "/";
  if (schema.anyOf || schema.oneOf) {
    if (!(schema.anyOf ?? schema.oneOf).some((branch) => validateJsonSchema(branch, value, options, path).length === 0)) {
      issues.push({
        path: at,
        message: "does not match any allowed shape"
      });
      return issues;
    }
  }
  if (schema.type !== void 0) {
    const types = typeof schema.type === "string" ? [schema.type] : schema.type;
    if (!types.some((type) => matchesType(value, type))) {
      issues.push({
        path: at,
        message: `expected ${types.join(" or ")}, got ${typeOf(value)}`
      });
      return issues;
    }
  }
  if (schema.const !== void 0 && !deepEqual(schema.const, value)) issues.push({
    path: at,
    message: `must be ${JSON.stringify(schema.const)}`
  });
  if (schema.enum && !schema.enum.some((option) => deepEqual(option, value))) issues.push({
    path: at,
    message: `must be one of ${schema.enum.map((o) => JSON.stringify(o)).join(", ")}`
  });
  if (typeof value === "string") {
    if (schema.minLength !== void 0 && value.length < schema.minLength) issues.push({
      path: at,
      message: `must be at least ${schema.minLength} characters`
    });
    if (schema.maxLength !== void 0 && value.length > schema.maxLength) issues.push({
      path: at,
      message: `must be at most ${schema.maxLength} characters`
    });
  }
  if (typeof value === "number") {
    if (schema.minimum !== void 0 && value < schema.minimum) issues.push({
      path: at,
      message: `must be >= ${schema.minimum}`
    });
    if (schema.maximum !== void 0 && value > schema.maximum) issues.push({
      path: at,
      message: `must be <= ${schema.maximum}`
    });
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== void 0 && value.length < schema.minItems) issues.push({
      path: at,
      message: `must have at least ${schema.minItems} items`
    });
    if (schema.maxItems !== void 0 && value.length > schema.maxItems) issues.push({
      path: at,
      message: `must have at most ${schema.maxItems} items`
    });
    if (schema.items) value.forEach((item, index) => issues.push(...validateJsonSchema(schema.items, item, options, `${path}/${index}`)));
  }
  if (typeOf(value) === "object") {
    const record = value;
    for (const key of schema.required ?? []) if (record[key] === void 0) issues.push({
      path: `${path}/${escapeToken(key)}`,
      message: "is required"
    });
    for (const [key, child] of Object.entries(record)) {
      const childPath = `${path}/${escapeToken(key)}`;
      const childSchema = schema.properties?.[key];
      if (childSchema) {
        if (child !== void 0) issues.push(...validateJsonSchema(childSchema, child, options, childPath));
      } else if (schema.additionalProperties === false) issues.push({
        path: childPath,
        message: "is not an allowed property"
      });
      else if (typeof schema.additionalProperties === "object") issues.push(...validateJsonSchema(schema.additionalProperties, child, options, childPath));
    }
  }
  return issues;
}
var containsSkipped = (value, skip) => skip(value) || typeof value === "object" && value !== null && Object.values(value).some((child) => containsSkipped(child, skip));
function validateSchema(schema, value, options = {}) {
  if (!isStandardSchema(schema)) return validateJsonSchema(schema, value, options);
  if (options.skip && containsSkipped(value, options.skip)) return [];
  const result = schema["~standard"].validate(value);
  if (result instanceof Promise) return [];
  return (result.issues ?? []).map((issue) => ({
    path: (issue.path ?? []).map((segment) => `/${escapeToken(String(typeof segment === "object" && segment !== null ? segment.key : segment))}`).join("") || "/",
    message: issue.message
  }));
}
var describeType = (schema, depth) => {
  if (!schema) return "unknown";
  if (schema.const !== void 0) return JSON.stringify(schema.const);
  if (schema.enum) return schema.enum.map((o) => JSON.stringify(o)).join(" | ");
  const branches = schema.anyOf ?? schema.oneOf;
  if (branches) return branches.map((b) => describeType(b, depth)).join(" | ");
  const types = schema.type === void 0 ? [] : typeof schema.type === "string" ? [schema.type] : [...schema.type];
  if (types.length > 1) return types.map((type) => describeType({
    ...schema,
    type
  }, depth)).join(" | ");
  switch (types[0]) {
    case "integer":
      return "integer";
    case "array":
      return `${describeType(schema.items, depth)}[]`.replace(/^(.* \| .*)\[\]$/, "($1)[]");
    case "object":
      return schema.properties && depth < 3 ? describeObject(schema, depth + 1) : "object";
    case void 0:
      return schema.properties ? describeObject(schema, depth + 1) : "unknown";
    default:
      return types[0];
  }
};
var describeObject = (schema, depth) => {
  const required = new Set(schema.required ?? []);
  const fields = Object.entries(schema.properties ?? {}).map(([key, child]) => `${key}${required.has(key) ? "" : "?"}: ${describeType(child, depth)}`);
  return fields.length ? `{ ${fields.join("; ")} }` : "{}";
};
var describeSchema = (schema) => describeType(schema, 0);

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
  const [list2, field] = args;
  if (!Array.isArray(list2) || args.length > 2) return null;
  if (args.length === 2 && typeof field !== "string") return null;
  if (typeof field === "string" && field.length > 500) return null;
  const tokens = typeof field === "string" ? pointerTokens(field) : void 0;
  if (tokens && tokens.length > 32) return null;
  let total = 0;
  let count = 0;
  let extreme = null;
  for (const item of list2) {
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
  ...["min", "max"].map((name2) => [name2, {
    min: 1,
    max: Infinity,
    run: (args, step) => Array.isArray(args[0]) ? aggregate(name2, args, step) : numeric(name2 === "min" ? Math.min : Math.max)(args, step)
  }]),
  ["count", {
    min: 1,
    max: 1,
    run: ([list2]) => Array.isArray(list2) ? list2.length : null
  }],
  ...["sum", "avg"].map((name2) => [name2, {
    min: 1,
    max: 2,
    run: (args, step) => aggregate(name2, args, step)
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
      const name2 = formula.slice(start, offset);
      if (name2 === "true" || name2 === "false" || name2 === "null") tokens.push({
        kind: "literal",
        value: name2 === "null" ? null : name2 === "true"
      });
      else tokens.push({
        kind: "name",
        text: name2
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
function formulaIssue(formula) {
  const result = parsedFormula(formula);
  return typeof result === "string" ? result : void 0;
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
var isExpressionKey = (value) => EXPRESSION_KEYS.has(value.trim());
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

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/prompt.js
var list = (items) => items.map((item) => `- ${item}`).join("\n");
var joinClauses = (clauses, conjunction = "and") => clauses.length > 2 ? `${clauses.slice(0, -1).join(", ")}, ${conjunction} ${clauses.at(-1)}` : clauses.join(` ${conjunction} `);
var compositionRules = (catalog2) => {
  const has = (type) => catalog2.component(type) !== void 0;
  const nests = (type) => catalog2.component(type)?.slots?.includes("default") ?? false;
  const emits = (type) => (catalog2.component(type)?.events?.length ?? 0) > 0;
  const nestsAny = Object.keys(catalog2.components).some(nests);
  const rules = [has("Header") && has("Text") ? "Open with a `Header` that names the answer and a `Text` with the one-line takeaway, then give each part of the answer its own section." : "Open with a heading that names the answer and its one-line takeaway, then give each part of the answer its own section."];
  const modules = [
    ...nests("Card") ? ["Make each module a `Card`: a summary, a checklist, a form, or one option, with running prose outside cards."] : [],
    ...nests("Row") && has("Fact") ? ["Put the answer's key figures side by side in a `Row` of `Fact`s."] : [],
    ...has("Badge") ? ["Show short tags, such as a duration or a price tier, as `Badge`s."] : []
  ];
  if (modules.length) rules.push(modules.join(" "));
  const layouts = [
    ...has("Map") ? ["put places with coordinates on a `Map`"] : [],
    ...has("Timeline") ? ["lay out a schedule or itinerary as a `Timeline`"] : [],
    ...has("Steps") ? ["write instructions as `Steps`"] : [],
    ...has("Table") ? ["compare options attribute by attribute in a `Table`"] : []
  ];
  if (layouts.length) {
    const sentence = joinClauses(layouts);
    rules.push(`${sentence[0].toUpperCase()}${sentence.slice(1)}.`);
  }
  if (has("Image")) {
    const placements = [
      ...nestsAny ? [`lead with two or three photos${nests("Row") ? " in a `Row`" : ""}`] : [],
      ...nests("Card") ? ["open each option's `Card` with its photo"] : [],
      ...nests("Row") ? ["put a small photo beside each item's text"] : []
    ];
    rules.push(`Show what can be seen with \`Image\`, but only from an image URL a tool returned, never one you write yourself${placements.length ? `: ${joinClauses(placements, "or")}` : ""}.`);
  }
  if (emits("Button") && nestsAny) rules.push(`For a number the user adjusts, such as guests or servings, put it between a \`-\` and a \`+\` \`Button\`${nests("Row") ? " in a `Row`" : ""}, each stepping it with a \`setState\` whose \`$calc\` value stays in a sensible range, and compute every amount that depends on it with \`$calc\`.`);
  if (nestsAny) rules.push("Keep lists in `/state` and render them with `repeat`, except a list a component takes as a prop, such as table rows or chart series, which you bind to that prop.");
  rules.push("Keep the tree shallow and give every element a job: no filler, and no decoration that adds nothing.");
  return rules;
};
var specRules = (catalog2, customRules = []) => [...compositionRules(catalog2), ...customRules];
var componentSection = (catalog2) => {
  return `## Components

Use only these types.

${Object.entries(catalog2.components).map(([name2, def]) => {
    const lines = [`### ${name2}`, def.description];
    const props = catalog2.propsSchema(name2);
    lines.push(`props: ${props ? describeSchema(props) : "none"}`);
    const propDocs = Object.entries(props?.properties ?? {}).filter(([, schema]) => schema.description).map(([key, schema]) => `  - ${key}: ${schema.description}`);
    if (propDocs.length) lines.push(...propDocs);
    const slots = def.slots ?? [];
    lines.push(slots.length === 0 ? "children: none" : `children: ${slots.map((slot) => slot === "default" ? "`children`" : `\`slots.${slot}\``).join(", ")}`);
    if (def.events?.length) lines.push(`events: ${def.events.map((e) => `\`${e}\``).join(", ")}`);
    return lines.join("\n");
  }).join("\n\n")}`;
};
var actionSection = (catalog2, hostApi) => {
  return `## Actions

Bind actions to a component's events with \`on\`: \`"on": { "press": { "action": "setState", "params": { "path": "/tab", "value": "b" } } }\`. A list runs in order. Params may use expressions, and \`{ "$event": "" }\` reads the payload the event carried.

${[
    "- `setState` \u2014 params `{ path: string; value?: unknown }`. Writes `value` at the JSON Pointer `path` in state. Built in.",
    ...hostApi.prompt ? ["- `sendMessage` \u2014 params `{ text: string }`. Sends `text` as the user's next message, as if they typed it. Use it behind a button for a follow-up the user asks for. Built in."] : [],
    ...hostApi.clipboard ? ['- `copyText` \u2014 params `{ text: string }`. Copies `text` to the user\'s clipboard, such as a shopping list behind a "Copy list" button; follow it with a `setState` that shows a short confirmation. Built in.'] : [],
    ...hostApi.modelContext ? ["- `updateModelContext` \u2014 params `{ text?: string; data?: unknown }`. Tells you what the user chose in this UI, with every later message, replacing what it shared before, and clears it when both are missing; nothing is sent. Use it when a choice should shape your next answer, such as the option the user picked. Built in."] : [],
    ...Object.entries(catalog2.actions).map(([name2, def]) => {
      const params = catalog2.paramsSchema(name2);
      const schema = params ? describeSchema(params) : void 0;
      return `- \`${name2}\` \u2014 ${schema && schema !== "unknown" ? `params \`${schema}\`. ` : ""}${def.description}`;
    })
  ].join("\n")}`;
};
var protocolSection = (mode) => `## Output protocol

A spec is flat: \`{ "root": id, "elements": { id: element }, "state": { \u2026 } }\`. An element is \`{ "type", "props", "children": [ids], "slots"?, "visible"?, "repeat"?, "on"?, "watch"? }\`. Children are ids, never nested elements.

Build it with JSON Patch (RFC 6902) operations, one JSON object per line (JSONL), so the UI renders while you write:

${list([
  'Set the root first: `{"op":"add","path":"/root","value":"main"}`.',
  'Then add each element whole, parents before children, in reading order: `{"op":"add","path":"/elements/main","value":{\u2026}}`. A child id may be listed before its element is added.',
  'Put initial state under `/state` before elements that read it: `{"op":"add","path":"/state/filter","value":"all"}`.',
  "Append to an array with `-`: `/elements/main/children/-`. Escape `/` in a key as `~1` and `~` as `~0`.",
  "To change something, `replace` or `remove` its path; do not repeat unchanged elements.",
  "Ids are short, unique, kebab-case, and describe the element (`revenue-card`)."
])}

${mode === "inline" ? "Write your reply as usual and put the patch lines in a fenced block that starts with ```spec and ends with ```. Text outside the fence is shown to the user as prose; keep it short and do not repeat what the UI shows." : "Output only patch lines: no prose, no code fences, no comments."}`;
var expressionSection = () => `## Expressions

Any prop or action param, or any value nested inside one, may be an expression object instead of a literal:

${list([
  '`{ "$state": "/path" }` reads state.',
  '`{ "$bindState": "/path" }` reads state and lets the component write it back (inputs, toggles, selects).',
  '`{ "$template": "Hello ${/user/name}" }` fills `${\u2026}` placeholders with state values; outside `$template` and `$calc`, a placeholder shows as written.',
  '`{ "$cond": condition, "$then": a, "$else": b }` picks a value.',
  "`{ \"$calc\": \"round(${/guests} * 0.5, 1) + ' lb'\" }` computes a value with a formula over `${\u2026}` references, numbers, and `'text'`: `+ - * / %`, `== != < <= > >=`, `a ? b : c`, and `&& || !`, which give `true` or `false` (write a default as `${/name} ? ${/name} : 'Guest'`). Functions: `round(x, digits)`, `floor`, `ceil`, `abs`, `clamp(x, low, high)`, `min` and `max` (of numbers, or of a list), `count(list)`, `sum(list)` and `avg(list)` (or of a field, `sum(list, '/price')`), and, formatting in en-US, `number(x, digits)`, `currency(x, 'USD')`, `percent(fraction)`, `time(minutesAfterMidnight)`, and `plural(n, 'item', 'items')`. `+` joins text when either side is text. A formula that cannot compute gives `null`.",
  'Inside `repeat`: `{ "$item": "/field" }`, `{ "$bindItem": "/field" }`, `{ "$index": true }`, and `${$item/field}` in templates.'
])}

## Visibility and repetition

${list([
  '`"visible"` takes a condition: `true`/`false`, `{ "$state": "/open" }` (truthy), a comparison `{ "$state": "/count", "gt": 0 }` with `eq`, `neq`, `gt`, `gte`, `lt`, or `lte`, a formula `{ "$calc": "${/count} > 2" }`, `{ "not": condition }`, `{ "$or": [ \u2026 ] }`, `{ "$and": [ \u2026 ] }`, or an array (all must hold).',
  '`"repeat": { "path": "/items", "key": "id" }` renders the element\'s children once per item of the state array at `path`.',
  '`"watch": { "/path": action }` runs an action whenever that state value changes.'
])}`;
var EXAMPLE = `## Example

{"op":"add","path":"/root","value":"main"}
{"op":"add","path":"/state","value":{"count":0}}
{"op":"add","path":"/elements/main","value":{"type":"Stack","props":{"gap":"md"},"children":["title","counter","bump"]}}
{"op":"add","path":"/elements/title","value":{"type":"Heading","props":{"text":"Clicks"}}}
{"op":"add","path":"/elements/counter","value":{"type":"Text","props":{"text":{"$template":"Clicked \${/count} times"}}}}
{"op":"add","path":"/elements/bump","value":{"type":"Button","props":{"label":"Click"},"on":{"press":{"action":"setState","params":{"path":"/count","value":{"$calc":"\${/count} + 1"}}}}}}

(The example's types are illustrative; use the components listed above.)`;
function buildSpecPrompt(catalog2, options = {}) {
  const mode = options.mode ?? "jsonl";
  const rules = [
    "Use only the listed component types, props, events, and actions.",
    "Every id in `children` or `slots` must be added as an element; every element except the root must be someone's child.",
    "Give props literal values unless they depend on state; keep data (rows, series) in props or `/state`, not in text.",
    ...specRules(catalog2, options.customRules)
  ];
  return [
    "# Declarative UI",
    "You describe UI as a spec of trusted components that the host renders with its own design system. You choose components and data; the host owns styling.",
    protocolSection(mode),
    componentSection(catalog2),
    actionSection(catalog2, options.hostApi ?? {}),
    expressionSection(),
    `## Rules

${list(rules)}`,
    ...options.omitExample ? [] : [EXAMPLE]
  ].join("\n\n");
}

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/catalog.js
var SET_STATE_ACTION = {
  description: "Writes `value` at the JSON Pointer `path` in state.",
  params: {
    type: "object",
    properties: {
      path: {
        type: "string",
        description: "JSON Pointer into state"
      },
      value: { description: "The value to write" }
    },
    required: ["path"]
  }
};
var BUILT_IN_ACTIONS = {
  setState: SET_STATE_ACTION,
  sendMessage: {
    description: "Sends `text` as the user's next message.",
    params: {
      type: "object",
      properties: { text: {
        type: "string",
        description: "The message"
      } },
      required: ["text"]
    }
  },
  updateModelContext: {
    description: "Replaces what this UI tells the model about the user's choices with `text` and `data`.",
    params: {
      type: "object",
      properties: {
        text: {
          type: "string",
          description: "The choices in words"
        },
        data: { description: "The choices as data" }
      }
    }
  },
  copyText: {
    description: "Copies `text` to the user's clipboard.",
    params: {
      type: "object",
      properties: { text: {
        type: "string",
        description: "The text to copy"
      } },
      required: ["text"]
    }
  }
};
var skipExpressions = { skip: isExpression };
function defineCatalog(definition) {
  const components = definition.components;
  const actions = definition.actions ?? {};
  const schemaCache = /* @__PURE__ */ new Map();
  const component = (type) => Object.hasOwn(components, type) ? components[type] : void 0;
  for (const name2 of Object.keys(BUILT_IN_ACTIONS)) if (Object.hasOwn(actions, name2)) throw new Error(`The action name "${name2}" is reserved for the built-in action.`);
  const action = (name2) => Object.hasOwn(BUILT_IN_ACTIONS, name2) ? BUILT_IN_ACTIONS[name2] : Object.hasOwn(actions, name2) ? actions[name2] : void 0;
  const catalog2 = {
    components,
    actions,
    component,
    action,
    propsSchema(type) {
      if (!schemaCache.has(type)) schemaCache.set(type, toJsonSchema(component(type)?.props));
      return schemaCache.get(type);
    },
    paramsSchema(name2) {
      const key = `action:${name2}`;
      if (!schemaCache.has(key)) schemaCache.set(key, toJsonSchema(action(name2)?.params));
      return schemaCache.get(key);
    },
    validateProps(type, props) {
      const schema = component(type)?.props;
      if (!schema) return [];
      return validateSchema(schema, props ?? {}, skipExpressions);
    },
    validateParams(name2, params) {
      const schema = action(name2)?.params;
      if (!schema) return [];
      return validateSchema(schema, params ?? {}, skipExpressions);
    },
    prompt: (options) => buildSpecPrompt(catalog2, options)
  };
  return catalog2;
}

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/patch.js
var OPS = /* @__PURE__ */ new Set([
  "add",
  "replace",
  "remove",
  "move",
  "copy",
  "test"
]);
function checkPatchOperation(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {
    ok: false,
    error: "a patch operation must be a JSON object"
  };
  const op = value;
  if (typeof op["op"] !== "string" || !OPS.has(op["op"])) return {
    ok: false,
    error: `"op" must be one of ${[...OPS].join(", ")}`
  };
  if (typeof op["path"] !== "string") return {
    ok: false,
    error: '"path" must be a string'
  };
  if ((op["op"] === "move" || op["op"] === "copy") && typeof op["from"] !== "string") return {
    ok: false,
    error: `"${op["op"]}" needs a string "from"`
  };
  if ((op["op"] === "add" || op["op"] === "replace" || op["op"] === "test") && !("value" in op)) return {
    ok: false,
    error: `"${op["op"]}" needs a "value"`
  };
  return {
    ok: true,
    op
  };
}
var clone = (value) => value === void 0 ? value : JSON.parse(JSON.stringify(value));
function applyPatchOperation(doc, operation, options = {}) {
  const path = parsePointer(operation.path);
  switch (operation.op) {
    case "add":
      return writeAtPointer(doc, path, "add", operation.value, options);
    case "replace":
      return writeAtPointer(doc, path, "replace", operation.value, options);
    case "remove":
      return writeAtPointer(doc, path, "remove");
    case "move": {
      const from = parsePointer(operation.from);
      if (from.length < path.length && from.every((token, index) => path[index] === token)) throw new Error("Cannot move a value into one of its own children");
      const value = getAtPointer(doc, from);
      if (value === void 0) throw new Error(`Nothing to move at "${operation.from}"`);
      const removed = writeAtPointer(doc, from, "remove");
      return writeAtPointer(removed, path, "add", value, options);
    }
    case "copy": {
      const value = getAtPointer(doc, operation.from);
      if (value === void 0) throw new Error(`Nothing to copy at "${operation.from}"`);
      return writeAtPointer(doc, path, "add", clone(value), options);
    }
    case "test":
      if (!deepEqual(getAtPointer(doc, path), operation.value)) throw new Error(`Test failed at "${operation.path}"`);
      return doc;
  }
}

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/stream.js
var FENCE = /^\s*(`{3,}|~{3,})\s*([\w-]*)\s*$/;
var SPEC_FENCES = /* @__PURE__ */ new Set([
  "spec",
  "jsonl",
  "json-patch",
  "spec-jsonl"
]);
var LOOKS_LIKE_PATCH = /^\s*\{\s*"op"\s*:/;
var PROSE_START = /^\s*[^\s{`~]/;
var isRecord2 = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
var isSpecShape = (value) => isRecord2(value) && typeof value["root"] === "string" && isRecord2(value["elements"]) && (value["state"] === void 0 || isRecord2(value["state"]));
function createSpecStream(options = {}) {
  const mode = options.mode ?? "jsonl";
  let spec = options.initial ?? emptySpec();
  let buffer = "";
  let lineNumber = 0;
  let fence;
  let fenceIsSpec = false;
  let finished = false;
  let proseEmitted = 0;
  const allPatches = [];
  const allErrors = [];
  let allText = "";
  const applyLine = (raw, update, terminated) => {
    lineNumber++;
    const line = raw.replace(/\r$/, "");
    const emitted = proseEmitted;
    proseEmitted = 0;
    const prose = () => {
      const text = (terminated ? `${line}
` : line).slice(emitted);
      update.text += text;
      allText += text;
    };
    if (mode === "inline") {
      const fenceMatch = FENCE.exec(line);
      if (fenceMatch) {
        if (fence === void 0) {
          fence = fenceMatch[1];
          fenceIsSpec = SPEC_FENCES.has(fenceMatch[2].toLowerCase());
          if (!fenceIsSpec) prose();
          return;
        }
        if (fenceMatch[1].startsWith(fence) && !fenceMatch[2]) {
          if (!fenceIsSpec) prose();
          fence = void 0;
          fenceIsSpec = false;
          return;
        }
      }
      if (!(fence !== void 0 && fenceIsSpec || fence === void 0 && LOOKS_LIKE_PATCH.test(line))) {
        prose();
        return;
      }
    }
    const trimmed = line.trim();
    if (!trimmed) return;
    const fail = (message) => {
      const error = {
        line: lineNumber,
        message,
        text: trimmed.slice(0, 200)
      };
      update.errors.push(error);
      allErrors.push(error);
    };
    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      fail("not valid JSON");
      return;
    }
    if (isSpecShape(parsed)) {
      spec = {
        state: {},
        ...parsed
      };
      return;
    }
    const operations = Array.isArray(parsed) ? parsed : [parsed];
    for (const candidate of operations) {
      const checked = checkPatchOperation(candidate);
      if (!checked.ok) {
        fail(checked.error);
        continue;
      }
      try {
        const next = applyPatchOperation(spec, checked.op, { createMissing: true });
        if (!isSpecShape(next)) throw new Error("A spec needs a string root, an elements object, and optional state object");
        spec = next;
        update.patches.push(checked.op);
        allPatches.push(checked.op);
      } catch (error) {
        fail(error instanceof Error ? error.message : String(error));
      }
    }
  };
  const push = (chunk) => {
    if (finished) throw new Error("The spec stream already finished");
    const update = {
      patches: [],
      text: "",
      errors: []
    };
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      applyLine(line, update, true);
      newline = buffer.indexOf("\n");
    }
    if (mode === "inline" && fence === void 0 && buffer.length > proseEmitted && PROSE_START.test(buffer)) {
      const end = buffer.endsWith("\r") ? buffer.length - 1 : buffer.length;
      const text = buffer.slice(proseEmitted, end);
      proseEmitted = end;
      update.text += text;
      allText += text;
    }
    return {
      spec,
      ...update
    };
  };
  return {
    push,
    result() {
      if (!finished && buffer) {
        const rest = buffer;
        buffer = "";
        applyLine(rest, {
          patches: [],
          text: "",
          errors: []
        }, false);
      }
      finished = true;
      return {
        spec,
        patches: [...allPatches],
        text: allText,
        errors: [...allErrors]
      };
    },
    get spec() {
      return spec;
    }
  };
}

// node_modules/.pnpm/generative-frame@0.0.8_@types+react@19.2.2_react@19.2.8/node_modules/generative-frame/dist/spec/validate.js
var elementPath = (id) => `/elements/${escapePointerToken(id)}`;
var PLACEHOLDER = /\$\{\s*(?:\/|\$item\b|\$index\b)[^}]*\}/;
var bindingsOf = (value) => value === void 0 ? [] : Array.isArray(value) ? value : [value];
function validateSpec(spec, catalog2, options = {}) {
  const issues = [];
  const error = (issue) => issues.push({
    severity: "error",
    ...issue
  });
  const elements = spec && typeof spec.elements === "object" && spec.elements ? spec.elements : {};
  if (!spec?.root) error({
    code: "missing-root",
    message: "The spec has no root element id.",
    path: "/root"
  });
  else if (!Object.hasOwn(elements, spec.root) && !options.partial) error({
    code: "unknown-root",
    message: `The root "${spec.root}" is not an element.`,
    path: "/root"
  });
  const specState = spec?.state;
  if (specState !== void 0 && (typeof specState !== "object" || specState === null || Array.isArray(specState))) error({
    code: "invalid-state",
    message: "The spec's state is not an object.",
    path: "/state"
  });
  const childLists = (id, element) => {
    const lists = [];
    if (element.children !== void 0) lists.push({
      slot: "default",
      path: `${elementPath(id)}/children`,
      ids: element.children
    });
    for (const [slot, ids] of Object.entries(element.slots ?? {})) lists.push({
      slot,
      path: `${elementPath(id)}/slots/${escapePointerToken(slot)}`,
      ids
    });
    return lists;
  };
  const checkBindings = (id, path, bindings) => {
    bindings.forEach((binding, index) => {
      const at = bindings.length > 1 ? `${path}/${index}` : path;
      if (!binding || typeof binding.action !== "string") {
        error({
          code: "unknown-action",
          elementId: id,
          path: at,
          message: "An action binding needs an `action` name."
        });
        return;
      }
      if (!catalog2.action(binding.action)) {
        error({
          code: "unknown-action",
          elementId: id,
          path: `${at}/action`,
          message: `Unknown action "${binding.action}". Known: ${[
            "setState",
            "sendMessage",
            "updateModelContext",
            "copyText",
            ...Object.keys(catalog2.actions)
          ].join(", ")}.`
        });
        return;
      }
      for (const issue of catalog2.validateParams(binding.action, binding.params)) error({
        code: "invalid-params",
        elementId: id,
        path: `${at}/params${issue.path === "/" ? "" : issue.path}`,
        message: `${binding.action} params ${issue.path === "/" ? "" : `${issue.path} `}${issue.message}`
      });
    });
  };
  const checkExpressions = (id, path, value) => {
    const seen = /* @__PURE__ */ new Set();
    const pending = [[path, value]];
    for (let next = pending.pop(); next; next = pending.pop()) {
      const [at, current] = next;
      if (typeof current !== "object" || current === null) continue;
      if (seen.has(current)) continue;
      seen.add(current);
      const children = [];
      for (const [key, child] of Object.entries(current)) {
        const childPath = `${at}/${escapePointerToken(key)}`;
        if (key !== "$calc" || Array.isArray(current)) {
          const plain = typeof child === "string" && (key !== "$template" || Array.isArray(current)) ? child : void 0;
          const placeholder = plain === void 0 ? void 0 : PLACEHOLDER.exec(plain.slice(0, plain.lastIndexOf("}") + 1))?.[0];
          if (placeholder) error({
            code: "unfilled-placeholder",
            elementId: id,
            path: childPath,
            message: `"${id}" shows \`${placeholder}\` as written, since only \`$template\` and \`$calc\` fill placeholders. Write the string as \`{ "$template": "\u2026" }\`, or compute the value with \`$calc\`.`
          });
          if (plain !== void 0 && isExpressionKey(plain)) {
            const name2 = plain.trim();
            error({
              code: "unfilled-placeholder",
              elementId: id,
              path: childPath,
              message: `"${id}" shows \`"${name2}"\` as written, since an expression is an object, not a string. Write it as \`{ "${name2}": \u2026 }\`.`
            });
          }
          children.push([childPath, child]);
          continue;
        }
        const issue = typeof child === "string" ? formulaIssue(child) : "`$calc` needs a formula string";
        if (issue) error({
          code: "invalid-formula",
          elementId: id,
          path: childPath,
          message: `Formula in "${id}": ${issue}.`
        });
      }
      for (let i = children.length - 1; i >= 0; i--) pending.push(children[i]);
    }
  };
  for (const [id, element] of Object.entries(elements)) {
    const path = elementPath(id);
    if (!element || typeof element !== "object" || typeof element.type !== "string") {
      error({
        code: "invalid-element",
        elementId: id,
        path,
        message: `Element "${id}" needs a string \`type\`.`
      });
      continue;
    }
    const definition = catalog2.component(element.type);
    if (!definition) error({
      code: "unknown-type",
      elementId: id,
      path: `${path}/type`,
      message: `Element "${id}" has unknown type "${element.type}". Known: ${Object.keys(catalog2.components).join(", ")}.`
    });
    else {
      for (const issue of catalog2.validateProps(element.type, element.props)) error({
        code: "invalid-props",
        elementId: id,
        path: `${path}/props${issue.path === "/" ? "" : issue.path}`,
        message: `${element.type} "${id}" prop ${issue.path === "/" ? "" : `${issue.path.slice(1)} `}${issue.message}.`
      });
      const slots = definition.slots ?? [];
      for (const list2 of childLists(id, element)) {
        if (Array.isArray(list2.ids) && list2.ids.length === 0) continue;
        if (!slots.includes(list2.slot)) error({
          code: list2.slot === "default" ? "children-not-allowed" : "unknown-slot",
          elementId: id,
          path: list2.path,
          message: list2.slot === "default" ? `${element.type} "${id}" takes no children.` : `${element.type} "${id}" has no slot "${list2.slot}"${slots.length ? `; slots: ${slots.join(", ")}` : ""}.`
        });
      }
      for (const event of Object.keys(element.on ?? {})) if (!(definition.events ?? []).includes(event)) error({
        code: "unknown-event",
        elementId: id,
        path: `${path}/on/${escapePointerToken(event)}`,
        message: `${element.type} "${id}" does not emit "${event}"${definition.events?.length ? `; events: ${definition.events.join(", ")}` : ""}.`
      });
    }
    for (const list2 of childLists(id, element)) {
      if (!Array.isArray(list2.ids)) {
        error({
          code: "invalid-element",
          elementId: id,
          path: list2.path,
          message: `Children of "${id}" must be an array of ids.`
        });
        continue;
      }
      list2.ids.forEach((childId, index) => {
        if (typeof childId !== "string") error({
          code: "invalid-element",
          elementId: id,
          path: `${list2.path}/${index}`,
          message: `Child ${index} of "${id}" must be an element id string.`
        });
        else if (!Object.hasOwn(elements, childId) && !options.partial) error({
          code: "missing-child",
          elementId: id,
          path: `${list2.path}/${index}`,
          message: `"${id}" lists child "${childId}", which is not an element.`
        });
      });
    }
    for (const [event, bindings] of Object.entries(element.on ?? {})) checkBindings(id, `${path}/on/${escapePointerToken(event)}`, bindingsOf(bindings));
    for (const [watched, bindings] of Object.entries(element.watch ?? {})) checkBindings(id, `${path}/watch/${escapePointerToken(watched)}`, bindingsOf(bindings));
    checkExpressions(id, `${path}/props`, element.props);
    checkExpressions(id, `${path}/visible`, element.visible);
    for (const key of ["on", "watch"]) for (const [name2, bindings] of Object.entries(element[key] ?? {})) {
      const at = `${path}/${key}/${escapePointerToken(name2)}`;
      if (Array.isArray(bindings)) bindings.forEach((binding, index) => checkExpressions(id, `${at}/${index}/params`, binding?.params));
      else checkExpressions(id, `${at}/params`, bindings?.params);
    }
    if (element.repeat !== void 0 && typeof element.repeat?.path !== "string") error({
      code: "invalid-repeat",
      elementId: id,
      path: `${path}/repeat`,
      message: `"repeat" of "${id}" needs a state \`path\`.`
    });
  }
  const childIds = (element) => childLists("", element).flatMap((list2) => Array.isArray(list2.ids) ? list2.ids.filter((c) => typeof c === "string") : []);
  const state = /* @__PURE__ */ new Map();
  const reported = /* @__PURE__ */ new Set();
  const visit = (id, trail) => {
    const element = elements[id];
    if (!element || typeof element !== "object") return;
    state.set(id, "visiting");
    for (const child of childIds(element)) if (state.get(child) === "visiting") {
      const stack = [...trail, id];
      const loop = [...stack.slice(stack.indexOf(child)), child];
      const key = [...loop].sort().join("|");
      if (!reported.has(key)) {
        reported.add(key);
        error({
          code: "cycle",
          elementId: id,
          path: elementPath(id),
          message: `Children form a cycle: ${loop.join(" \u2192 ")}.`
        });
      }
    } else if (!state.has(child)) visit(child, [...trail, id]);
    state.set(id, "done");
  };
  if (spec?.root) visit(spec.root, []);
  for (const id of Object.keys(elements)) {
    if (state.has(id)) continue;
    if (!options.partial) issues.push({
      code: "unreachable",
      severity: "warning",
      elementId: id,
      path: elementPath(id),
      message: `"${id}" is not reachable from the root.`
    });
    visit(id, []);
  }
  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues
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
    const list2 = (ids, childScope, itemKey) => ids.flatMap((childId) => resolve(childId, childScope, inside, itemKey) ?? []);
    const children = element.repeat && typeof element.repeat.path === "string" ? (repeatItems(element.repeat, state) ?? []).flatMap((item) => list2(childIdsOf(element, "default"), item.scope, item.key)) : list2(childIdsOf(element, "default"), scope);
    const slots = {};
    for (const [slot, ids] of Object.entries(element.slots ?? {})) if (slot !== "default" && Array.isArray(ids)) slots[slot] = list2(ids, scope);
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

// src/core.ts
var protocol = "intelligent-ui/1";
var toolName = "render_intelligent_ui";
var catalogVersion = "core-v2";
var catalog = defineCatalog(catalog_generated_default);
function presentationIssues(spec, selectedCatalog) {
  const issues = [];
  const elementFields = /* @__PURE__ */ new Set(["type", "props", "children", "slots", "visible", "repeat", "on", "watch"]);
  for (const element of Object.values(spec.elements)) {
    const properties = selectedCatalog.propsSchema(element.type)?.properties ?? {};
    for (const property of Object.keys(properties)) {
      if (!elementFields.has(property) && Object.hasOwn(element, property)) {
        issues.push({ code: "invalid-props", path: "/elements/*/" + property.replace(/~/g, "~0").replace(/\//g, "~1") });
        if (issues.length === 12) return issues;
      }
    }
  }
  if (issues.length) return issues;
  const root = resolveSpec(spec);
  const pending = root ? [root] : [];
  while (pending.length && issues.length < 12) {
    const node = pending.pop();
    if (node.type === "NumberInput" && node.props.showSlider === true && !(typeof node.props.min === "number" && Number.isFinite(node.props.min) && typeof node.props.max === "number" && Number.isFinite(node.props.max) && node.props.min < node.props.max))
      issues.push({ code: "invalid-props", path: "/elements/*/props/showSlider" });
    if (node.type === "NumberInput" && node.props.step !== void 0 && !(typeof node.props.step === "number" && Number.isFinite(node.props.step) && node.props.step > 0))
      issues.push({ code: "invalid-props", path: "/elements/*/props/step" });
    pending.push(...node.children, ...Object.values(node.slots).flat());
  }
  return issues;
}
function validateDocument(title, jsonl, selectedCatalog = catalog, version = catalogVersion) {
  const parser = createSpecStream();
  parser.push(jsonl);
  const result = parser.result();
  if (result.errors.length) return { ok: false, issues: result.errors.slice(0, 12).map((error) => ({ code: "invalid-patch", path: "/jsonl/lines/" + error.line })) };
  const validation = validateSpec(result.spec, selectedCatalog);
  if (!validation.ok) return { ok: false, issues: validation.issues.filter((x) => x.severity === "error").slice(0, 12).map((x) => ({ code: x.code, path: x.path.replace(/\/elements\/[^/]+/g, "/elements/*").replace(/\/state(?:\/.*)?$/, "/state/*") })) };
  const issues = presentationIssues(result.spec, selectedCatalog);
  if (issues.length) return { ok: false, issues };
  return { ok: true, document: { protocol, catalog: version, title, spec: result.spec } };
}

// src/examples.ts
var firstUseExample = {
  title: "Budget comparison",
  jsonl: [
    { op: "add", path: "", value: { root: "plan", state: { items: [{ amount: 30 }, { amount: 20 }], limit: 60 }, elements: {} } },
    { op: "add", path: "/elements/plan", value: { type: "Col", props: {}, children: ["first", "second", "total", "over"] } },
    { op: "add", path: "/elements/first", value: { type: "NumberInput", props: { label: "First amount", value: { $bindState: "/items/0/amount" } } } },
    { op: "add", path: "/elements/second", value: { type: "NumberInput", props: { label: "Second amount", value: { $bindState: "/items/1/amount" } } } },
    { op: "add", path: "/elements/total", value: { type: "Fact", props: { label: "Total", value: { $calc: "sum(${/items}, '/amount')" } } } },
    { op: "add", path: "/elements/over", value: { type: "Alert", props: { tone: "warning", title: "Over budget" } } },
    { op: "add", path: "/elements/over/visible", value: { $calc: "sum(${/items}, '/amount') > ${/limit}" } }
  ].map((patch) => JSON.stringify(patch)).join("\n")
};
var precomputedExample = {
  title: "Fixed compound-growth snapshot",
  jsonl: [
    { op: "add", path: "", value: { root: "snapshot", elements: {
      snapshot: { type: "Col", props: {}, children: ["result", "update"] },
      result: { type: "Fact", props: { label: "Precomputed: principal 100, annual rate 3%, 2 years", value: 106.09 } },
      update: { type: "Text", props: { value: "This result is fixed. Request a new calculation to change the rate or term; it does not recalculate when other controls change." } }
    } } }
  ].map((patch) => JSON.stringify(patch)).join("\n")
};

// src/tools.ts
var formulaGuidance = "Each $calc accepts at most 500 characters and 32 nesting levels. Use the listed scalar grammar and native sum/avg/min/max over an existing state array, with an optional JSON-pointer field; split long prose into separate elements. There is no pow, exponentiation, loop, or JavaScript. Displaying a calculated value does not create a state path for other formulas to reference. Compound-interest and amortization results must be precomputed outside this UI, clearly labelled with their fixed assumptions and update method. Do not present arbitrary parameter changes as exact recalculation of those fixed results.";
var name = "dsh-intelligent-ui-tools";
var inject = ["tools", "systemPrompt"];
function apply(ctx) {
  registerIntelligentUiTools(ctx);
}
function registerIntelligentUiTools(ctx, options = {}) {
  const catalog2 = options.catalog ?? catalog;
  const version = options.catalogVersion ?? catalogVersion;
  ctx.systemPrompt.section({
    name: "intelligent-ui:catalog",
    order: 180,
    text: "Use render_intelligent_ui for in-chat tables, checklists, data collection, adjustable budgets and comparisons, charts, or multi-day plans with a cost breakdown. Ordinary requests such as wanting to change numbers, tick items, or see where money goes already express this intent; no technical UI terminology is required. Choose the smallest useful interface and state shape: one control for one adjustable assumption, without inventing a detailed schedule or additional parameters. Use a file when an export is requested or calculation genuinely exceeds this UI's capabilities. CALL render_intelligent_ui directly with {title,jsonl}; never print its JSONL in an ordinary assistant reply. One intended interface belongs in ONE call containing the complete new document. Streaming happens INSIDE its jsonl argument: do not split one interface into several calls. Every call starts from an empty spec and creates a NEW UI, even with the same title. Never edit a previous UI by title. Build root/state/containers first, then complete child nodes as JSONL patches so usable controls appear while generating. Bind ordinary input state with $bindState. Use formulas for derived values. Only an explicit Button press may analyze selected input paths. Unsent saved controls are not part of your context. Do not invoke through run_code or nested tools: those calls have no streaming UI surface."
  });
  ctx.tools.register(defineTool({
    name: toolName,
    description: "Create a complete NEW controlled interactive UI with charts, tables, comparison and calculations in ONE call. Supply a display title and newline-separated RFC6902 spec patches. Each real direct call has independent identity and starts from an EMPTY spec; never send continuation-only patches. This only publishes UI; it never changes business facts or sends a user message. Catalog: " + version + ". " + (options.instructions ?? "") + " The following reference defines ONLY this tool's jsonl argument, not the ordinary assistant response:\n\n" + catalog2.prompt({ omitExample: true, customRules: [
      "For records that the user will maintain, such as expense sheets, budgets, packing or task trackers, provide bound controls for the underlying entries even when the user gives all initial values. A Table is a read-only summary, not an editable ledger: pair it with NumberInput or the relevant input, using concrete $bindState paths as in the complete example below. Keep totals and charts derived from those values. One-off analytical reports may remain read-only. Do not make the user request technical editing controls explicitly.",
      'Component properties belong inside props, never beside type. Correct Alert: {"type":"Alert","props":{"tone":"warning","title":"Notice","description":"Details"}}. Putting title, description or tone at the element level does not render that content and is rejected. Keep native element fields such as children, slots, visible and on outside props. Correct a misplaced property by moving it into props in a complete new document; do not omit the intended message.',
      'visible is an ELEMENT field, alongside type and props; props.visible does not hide an element. Example: {"type":"Alert","props":{"tone":"danger","title":"Over budget"},"visible":{"$calc":"${/total} > ${/budget}"}}. Give mutually exclusive alerts complementary element-level conditions, such as > and <=. To correct a misplaced condition, move it from /elements/<id>/props/visible to /elements/<id>/visible and supply the complete corrected document in a new call. Open props schemas can accept unknown fields; successful validation does not give those fields rendering behavior.',
      "$calc is a SCALAR formula grammar, NOT JavaScript. It cannot construct array/object literals and cannot call methods such as .map(). Construct Table.rows and Chart.data as ordinary JSON arrays with a $calc expression at each scalar cell/value. Derived values belong in expressions, not watch actions.",
      formulaGuidance,
      "For repeated numeric inputs, prefer an array in state and sum(${/items}, '/amount') over a long expansion of every row. The field argument is a JSON pointer, including its leading slash. The aggregate reads stored numbers, not a formula per row. Bind editable array fields with $bindState and concrete paths such as /items/0/amount. Keep totals, chart values and conditional conclusions tied to the same inputs. Verify trend direction, denominator and period against those values before writing prose.",
      '$template only substitutes paths, not formulas. Its placeholders are ${/path}, ${$item/path}, ${$item}, or ${$index}; never put arithmetic, functions, nested placeholders, or ${$calc} inside it. For a computed number use {"$calc":"${/people} * ${/minutes}"} directly. For computed text use {"$calc":"\'Total \' + (${/people} * ${/minutes}) + \' min\'"}. Do not create a placeholder for a derived state field that does not exist.',
      'Each JSONL line must be a complete JSON patch object. A nested expression must close its expression object, props, element, and outer patch separately. Example: {"op":"add","path":"/elements/total","value":{"type":"Fact","props":{"label":"Total","value":{"$calc":"${/amount} * 2"}}}}. An invalid-patch error occurs before formula validation; first check JSON syntax, balanced braces, escaped quotes, and patch op/path instead of repeatedly changing the formula.',
      'For editable NUMBERS use NumberInput.props.value={"$bindState":"/venue"} or Slider.props.defaultValue={"$bindState":"/meal"}, with numeric state seeds. Text Input returns strings, which cannot participate in strict numeric $calc arithmetic; number() formats a number and is NOT a string conversion. Do not use an unbound literal defaultValue plus a submit-only handler when immediate recalculation is requested. Any explanatory text that depends on controls must also use an expression rather than frozen example numbers.',
      "For immediate editing and saved-state restoration, bind Input.props.defaultValue with $bindState, including multiline Input. Select, RadioGroup and CheckboxGroup also bind defaultValue; Checkbox binds defaultChecked; DatePicker binds value. A submit-only Input handler does not update summaries on each edit. Input, Select and DatePicker already render their label visibly and accessibly: do not add a Text or Header repeating that field label.",
      'Example Table props: {"columns":[{"label":"People"},{"label":"Cost"}],"rows":[[10,{"$calc":"10 * ${/meal} + ${/venue}"}],[20,{"$calc":"20 * ${/meal} + ${/venue}"}]]}. Example Chart props: {"variant":"bar","data":[{"label":"10","value":{"$calc":"10 * ${/meal} + ${/venue}"}},{"label":"20","value":{"$calc":"20 * ${/meal} + ${/venue}"}}]}.',
      'Example Button: {"type":"Button","props":{"label":"Analyze"},"on":{"press":{"action":"analyze","params":{"prompt":"Analyze this plan","paths":["/people","/meal","/venue"]}}}}. The host freezes selected values; do not interpolate parameters into prompt strings.',
      "Use Grid for equal-width parameter groups: columns is 1, 2 (default), or 3, reduced by actual container width; gap and Card.padding use 4px units and accept fractional numbers from 0 to 8. Use ordinary Col/Row for non-grid content. The host already displays the tool title: do not add another introductory Header for the same interface, even with synonymous wording. Use Header for actual subsections, and do not wrap every paragraph in a Card.",
      "Every id referenced by children or slots must have its own definition in elements, including initially hidden tab or expandable content. A missing-child error means a reference has no element definition. Define the missing elements or correct the referencing list; changing text, formulas or events cannot fix that reference. Any correction is a complete new document.",
      "After a successful render, let the interface present its own values and controls. Do not create additional demonstration or debugging UIs after success. Keep any accompanying answer brief; do not repeat its title, list every control, or expose JSON, bindings and tool implementation details unless the user requested that explanation.",
      'For an adjustable numeric parameter, NumberInput may use showSlider:true with finite min < max and a display-only unit. Its text field and slider share ONE value binding; do not add a second Slider bound to the same path. null stays empty and disables its slider. step affects slider/arrow increments but never rounds typed values. Example props: {"label":"Minutes","value":{"$bindState":"/minutes"},"min":0,"max":120,"step":0.5,"showSlider":true,"unit":"min"}.'
    ] }) + "\n\nComplete first-use example (title: " + JSON.stringify(firstUseExample.title) + "). Pass these lines as the jsonl string in ONE direct call:\n" + firstUseExample.jsonl + "\nIf a nested line has a bracket error, use a shallow property patch after defining that element and props, as the final visible patch above demonstrates. Resend the entire corrected document in one new call, not only the changed line.\n\nCapability-boundary example: an unsupported compound-growth formula is replaced by an independently calculated, explicitly fixed snapshot (title: " + JSON.stringify(precomputedExample.title) + "). Its complete jsonl is:\n" + precomputedExample.jsonl,
    parameters: { title: { type: "string", required: true, description: "Display title; never an identity or an update key." }, jsonl: { type: "string", required: true, description: "Newline-separated spec patches. Root, elements and state follow the visible Intelligent UI catalog. Use controls and safe expressions, not HTML or scripts." } },
    output: { schema: { type: "json" }, render: (_args, result) => [{ type: "text", text: JSON.stringify(result) }] },
    presentCall: (args) => ({ card: "generic", title: args.title, rawInput: { protocol, title: args.title, jsonl: args.jsonl } }),
    presentResult: (args) => ({ card: "generic", title: args.title, content: [] }),
    execute: async (args, execution) => {
      execution.signal.throwIfAborted();
      if (execution.parent) throw new ToolArgsError(["direct-call-required /"]);
      const validation = validateDocument(args.title, args.jsonl, catalog2, version);
      if (!validation.ok) {
        const diagnostics = validation.issues.map((issue) => issue.code + " " + (options.redactDiagnosticPaths ? "/jsonl" : issue.path));
        const placementIndex = validation.issues.findIndex((issue) => issue.code === "invalid-props" && /^\/elements\/\*\/[^/]+$/.test(issue.path) && !issue.path.endsWith("/props"));
        if (placementIndex >= 0) diagnostics[placementIndex] += " \u2014 Component properties belong inside props, not at the element level. Move the reported field into props and resend a complete corrected document. Keep children, slots, visible and on at the element level.";
        const patchIndex = validation.issues.findIndex((issue) => issue.code === "invalid-patch");
        if (patchIndex >= 0) diagnostics[patchIndex] += " \u2014 Patch parsing failed before formula validation. Each JSONL line must be a complete JSON patch object; check balanced braces, escaped quotes, and op/path. Close expression, props, element, and outer patch separately.";
        const formulaIndex = validation.issues.findIndex((issue) => issue.code === "invalid-formula");
        if (formulaIndex >= 0) diagnostics[formulaIndex] += " \u2014 " + formulaGuidance;
        const childIndex = validation.issues.findIndex((issue) => issue.code === "missing-child");
        if (childIndex >= 0) diagnostics[childIndex] += " \u2014 A children/slots reference has no element definition. Define every referenced id, including initially hidden content, or correct the referencing list. Resend a complete new document; changing text, formulas or events does not repair a missing reference.";
        throw new ToolArgsError(diagnostics);
      }
      return { ok: true, protocol, catalog: version, title: args.title };
    }
  }));
}
export {
  apply,
  inject,
  name,
  registerIntelligentUiTools
};
//# sourceMappingURL=tools.js.map

import { describe, expect, it } from "vitest";
import { createStateStore, type Spec, type SpecElement } from "generative-frame/spec";
import {
  freezeUiSaveRequest, UiStateError, uiRequestFingerprint, validateUiValues, writableUiPaths,
} from "../src/state.js";

function spec(elements: Record<string, SpecElement>, state: Record<string, unknown> = {}): Spec {
  return { root: "root", state, elements: {
    root: { type: "Col", children: Object.keys(elements) }, ...elements,
  } };
}

function code(run: () => unknown, expected: string, path = "/values/*"): void {
  try { run(); throw new Error("expected rejection"); }
  catch (error) {
    expect(error).toBeInstanceOf(UiStateError);
    expect(error).toMatchObject({ code: expected, path });
    expect((error as Error).message).toBe(expected);
    expect(JSON.stringify(error)).not.toContain("private");
  }
}

describe("declared UI input state", () => {
  const document = spec({
    amount: { type: "Input", props: { inputType: "number", defaultValue: { $bindState: "/amount" } } },
    people: { type: "Button", props: { label: "+" }, on: { press: {
      action: "setState", params: { path: "/people", value: { $calc: "${/people} + 1" } },
    } } },
    derived: { type: "Text", props: { value: { $state: "/total" } }, watch: {
      "/people": { action: "setState", params: { path: "/total", value: { $calc: "${/people} * 50" } } },
    } },
    flag: { type: "Checkbox", props: { defaultChecked: { $bindState: "/flag" } } },
  }, { amount: 20, people: 2, total: 100, flag: false, businessFact: "private" });

  it("accepts only bound controls and literal setState paths from trusted user events", () => {
    expect(writableUiPaths(document)).toEqual(["/amount", "/flag", "/people"]);
    const values = { "/amount": "12.5", "/people": 3, "/flag": true };
    expect(validateUiValues(document, values)).toEqual(values);
    expect(document.state?.people).toBe(2);
  });

  it.each(["", "0", "-", "1e", "001.20"])("keeps Input number edit %j as a string", value => {
    expect(validateUiValues(document, { "/amount": value })).toEqual({ "/amount": value });
  });

  it("does not derive an Input type from its numeric seed", () => {
    code(() => validateUiValues(document, { "/amount": 12.5 }), "INVALID_VALUE");
    code(() => validateUiValues(document, { "/people": "3" }), "INVALID_VALUE");
    code(() => validateUiValues(document, { "/flag": "true" }), "INVALID_VALUE");
  });

  it.each(["/total", "/businessFact", "/private-unknown"])("rejects undeclared or derived input %s", path => {
    code(() => validateUiValues(document, { [path]: "private-value" }), "UNDECLARED_INPUT");
  });

  it("does not persist bindings in labels, nested props, unknown components or invented events", () => {
    const excluded = spec({
      label: { type: "Text", props: { value: { $bindState: "/label" } } },
      nested: { type: "Input", props: { defaultValue: { nested: { $bindState: "/nested" } } } },
      other: { type: "Private", on: { press: { action: "setState", params: { path: "/other", value: 1 } } } },
      wrong: { type: "Button", on: { change: { action: "setState", params: { path: "/wrong", value: 1 } } } },
      dynamic: { type: "Button", on: { press: { action: "setState", params: { path: { $state: "/where" }, value: 1 } } } },
    }, { where: "/dynamic" });
    expect(writableUiPaths(excluded)).toEqual([]);
  });

  it("keeps hidden declared inputs, excludes orphan nodes and watch-owned paths even if bound", () => {
    const candidate = spec({
      hidden: { type: "Input", visible: false, props: { defaultValue: { $bindState: "/hidden" } } },
      derived: { type: "Input", props: { defaultValue: { $bindState: "/derived" } }, watch: {
        "/source": { action: "setState", params: { path: "/derived", value: 1 } },
      } },
    });
    candidate.elements.orphan = { type: "Input", props: { defaultValue: { $bindState: "/orphan" } } };
    expect(writableUiPaths(candidate)).toEqual(["/hidden"]);
  });

  it("infers literal action targets and direct control event payloads without storing expressions", () => {
    const candidate = spec({
      button: { type: "Button", on: { press: [
        { action: "setState", params: { path: "/flag", value: true } },
        { action: "setState", params: { path: "/count", value: { $calc: "1 + 2" } } },
      ] } },
      input: { type: "Input", on: { submit: { action: "setState", params: { path: "/draft", value: { $event: true } } } } },
    });
    expect(validateUiValues(candidate, { "/flag": false, "/count": 4, "/draft": "" })).toEqual({
      "/flag": false, "/count": 4, "/draft": "",
    });
    code(() => validateUiValues(candidate, { "/count": { $calc: "private" } }), "INVALID_VALUE");
  });

  it("excludes dynamic watch targets resolved from both source and proposed input state", () => {
    const candidate = spec({
      destination: { type: "Input", props: { defaultValue: { $bindState: "/destination" } } },
      first: { type: "Input", props: { defaultValue: { $bindState: "/first" } } },
      second: { type: "Input", props: { defaultValue: { $bindState: "/second" } } },
      watcher: { type: "Text", watch: { "/trigger": { action: "setState", params: {
        path: { $state: "/destination" }, value: "derived",
      } } } },
    }, { destination: "/first", first: "derived", second: "input" });
    expect(writableUiPaths(candidate)).toEqual(["/destination", "/second"]);
    code(() => validateUiValues(candidate, { "/first": "private" }), "UNDECLARED_INPUT");
    code(() => validateUiValues(candidate, { "/destination": "/second", "/second": "private" }), "UNDECLARED_INPUT");
  });

  it.each(["", "amount", "/private~2key", "/x~", "/__proto__/x", "/constructor", "/prototype/x", "/rows/-"])(
    "rejects unsafe pointer %j without reflecting it", path => {
      code(() => validateUiValues(document, { [path]: "private-value" }), "INVALID_PATH");
    },
  );

  it("uses upstream pointer semantics for escaped tokens and array replacement", () => {
    const candidate = spec({
      escaped: { type: "Input", props: { defaultValue: { $bindState: "/a~1b~0c" } } },
      row: { type: "Input", props: { defaultValue: { $bindState: "/rows/0/name" } } },
    }, { "a/b~c": "before", rows: [{ name: "first" }, { name: "second" }] });
    const values = validateUiValues(candidate, { "/a~1b~0c": "after", "/rows/0/name": "edit" });
    const restored = createStateStore(candidate.state, { writes: Object.entries(values).map(([path, value]) => [path, value, "replace"]) });
    expect(restored.getState()).toEqual({ "a/b~c": "after", rows: [{ name: "edit" }, { name: "second" }] });
  });

  it("rejects invalid array indices and overlapping pointer snapshots", () => {
    const candidate = spec({
      input: { type: "Input", props: { defaultValue: { $bindState: "/rows/01" } } },
      parent: { type: "Button", on: { press: { action: "setState", params: { path: "/form", value: { name: "x" } } } } },
      child: { type: "Input", props: { defaultValue: { $bindState: "/form/name" } } },
    }, { rows: ["zero", "one"], form: { name: "x" } });
    code(() => validateUiValues(candidate, { "/rows/01": "private" }), "INVALID_PATH");
    code(() => validateUiValues(candidate, { "/form": { name: "x" }, "/form/name": "y" }), "INVALID_PATH");
  });

  it.each([NaN, Infinity, undefined, 1n, () => 1, new Date(), new Map(), { $state: "/private" }])(
    "rejects non-JSON or expression values", value => {
      code(() => validateUiValues(document, { "/amount": value }), "INVALID_VALUE");
    },
  );

  it("rejects cycles, sparse arrays, symbols and getters without executing them", () => {
    const cycle: Record<string, unknown> = {}; cycle.self = cycle;
    const getter = Object.defineProperty({}, "value", { enumerable: true, get() { throw new Error("private getter ran"); } });
    const sparse = new Array(1);
    const disguised = Object.assign(new Array(1), { private: "x" });
    for (const value of [cycle, getter, sparse, disguised, { [Symbol("private")]: "x" }]) {
      code(() => validateUiValues(document, { "/amount": value }), "INVALID_VALUE");
    }
  });
});

describe("actual control constraints", () => {
  it("checks Slider min/max/step, resolves bounds using upstream expressions, and prevents event bypass", () => {
    const document = spec({
      slider: { type: "Slider", props: { min: 0.1, max: { $calc: "${/limit} * 2" }, step: 0.1, defaultValue: { $bindState: "/value" } } },
      button: { type: "Button", on: { press: { action: "setState", params: { path: "/value", value: 9 } } } },
    }, { limit: 1, value: 0.1 });
    expect(validateUiValues(document, { "/value": 0.3 })).toEqual({ "/value": 0.3 });
    for (const value of [0, 2.1, 0.35, "0.3"]) code(() => validateUiValues(document, { "/value": value }), "INVALID_VALUE");
  });

  it("uses the Slider renderer defaults for invalid step and reversed bounds", () => {
    const document = spec({ slider: { type: "Slider", props: { min: 3, max: 1, step: 0, defaultValue: { $bindState: "/v" } } } });
    expect(validateUiValues(document, { "/v": 3 })).toEqual({ "/v": 3 });
    code(() => validateUiValues(document, { "/v": 4 }), "INVALID_VALUE");
  });

  it.each(["Select", "RadioGroup", "CheckboxGroup"])("checks %s choices and value type", type => {
    const document = spec({ choice: { type, props: {
      options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], defaultValue: { $bindState: "/choice" },
    } } });
    const good = type === "CheckboxGroup" ? ["a", "b"] : "a";
    expect(validateUiValues(document, { "/choice": good })).toEqual({ "/choice": good });
    for (const value of [type === "CheckboxGroup" ? ["private"] : "private", 1, type === "CheckboxGroup" ? ["a", "a"] : ["a"]]) {
      code(() => validateUiValues(document, { "/choice": value }), "INVALID_VALUE");
    }
  });

  it("checks dates, temporal ranges and empty edits", () => {
    const document = spec({ date: { type: "DatePicker", props: {
      min: "2024-02-01", max: "2024-02-29", value: { $bindState: "/date" },
    } } });
    for (const value of ["", "2024-02-29"]) expect(validateUiValues(document, { "/date": value })["/date"]).toBe(value);
    for (const value of ["2024-02-30", "2023-02-29", "2024-03-01", "private"]) {
      code(() => validateUiValues(document, { "/date": value }), "INVALID_VALUE");
    }
  });

  it("keeps unselected Select placeholders", () => {
    const document = spec({ choice: { type: "Select", props: {
      options: [{ label: "A", value: "a" }], placeholder: "Choose", defaultValue: { $bindState: "/choice" },
    } } });
    expect(validateUiValues(document, { "/choice": "" })).toEqual({ "/choice": "" });
  });

  it("compares temporal bounds with matching timezone semantics without guessing the browser zone", () => {
    const document = spec({ date: { type: "DatePicker", props: {
      inputType: "datetime", min: "2026-10-24T00:00:00Z", max: "2026-10-24T12:00:00Z", value: { $bindState: "/date" },
    } } });
    expect(validateUiValues(document, { "/date": "2026-10-24T12:00:00+08:00" })["/date"]).toBe("2026-10-24T12:00:00+08:00");
    code(() => validateUiValues(document, { "/date": "2026-10-24T12:00:01Z" }), "INVALID_VALUE");
    document.elements.date.props!.min = "2026-10-24T06:00";
    expect(validateUiValues(document, { "/date": "2026-10-24T12:00:00+08:00" })["/date"]).toBe("2026-10-24T12:00:00+08:00");
    document.elements.date.props!.inputType = "time";
    document.elements.date.props!.min = "09:00";
    document.elements.date.props!.max = "12:00";
    expect(validateUiValues(document, { "/date": "09:00:00.123456789" })["/date"]).toBe("09:00:00.123456789");
    code(() => validateUiValues(document, { "/date": "25:00" }), "INVALID_VALUE");
  });
});

describe("frozen save requests", () => {
  const request = () => ({ document_revision: 1, expected_revision: 0, operation_id: "op", values: { "/a": "", "/b": ["x"] } });

  it("copies nested values and compares semantic JSON independently of key order", () => {
    const draft = request();
    const frozen = freezeUiSaveRequest(draft);
    (draft.values["/b"] as string[]).push("private");
    expect(frozen.values["/b"]).toEqual(["x"]);
    expect(uiRequestFingerprint(frozen)).toBe(uiRequestFingerprint({ ...frozen, values: { "/b": ["x"], "/a": "" } }));
    expect(uiRequestFingerprint(frozen)).not.toBe(uiRequestFingerprint({ ...frozen, values: { "/a": 0, "/b": ["x"] } }));
  });

  it.each([
    { document_revision: -1 }, { expected_revision: 0.5 }, { expected_revision: Number.MAX_SAFE_INTEGER + 1 },
    { operation_id: "" }, { operation_id: 4 }, { values: [] }, { private: "value" },
  ])("rejects invalid envelopes without exposing extra keys", change => {
    expect(() => freezeUiSaveRequest({ ...request(), ...change })).toThrow(UiStateError);
  });
});

import { describe, expect, it } from "vitest";
import { createStateStore, resolveSpec, type Spec } from "generative-frame/spec";
import { validateUiValues, writableUiPaths } from "../src/state.js";

const spec: Spec = { root: "root", state: { people: 20, meal: 50 }, elements: {
  root: { type: "Col", children: ["meal", "total"] },
  meal: { type: "NumberInput", props: { label: "Meal", min: 0, max: 1000, value: { $bindState: "/meal" } } },
  total: { type: "Fact", props: { label: "Total", value: { $calc: "$" + "{/people} * $" + "{/meal}" } } },
} };

describe("numeric input formula contract", () => {
  it("persists a numeric input and restores the numeric formula result", () => {
    expect(writableUiPaths(spec)).toEqual(["/meal"]);
    const saved = validateUiValues(spec, { "/meal": 55 });
    const state = createStateStore(spec.state, { writes: Object.entries(saved) });
    expect(resolveSpec(spec, { state: state.getState() })?.children[1].props.value).toBe(1100);
  });
  it("allows an explicit empty numeric field without coercing it to zero", () => {
    expect(validateUiValues(spec, { "/meal": null })).toEqual({ "/meal": null });
  });
  it.each(["55", -1, 1001, NaN, Infinity])("rejects non-numeric or out-of-range saved values", value => {
    expect(() => validateUiValues(spec, { "/meal": value })).toThrow();
  });
});

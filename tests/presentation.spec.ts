import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { catalog, catalogVersion, UiArgumentStream, uiDocumentRevision, validateDocument, type Spec } from "../src/core.js";
import { validateUiValues, writableUiPaths } from "../src/state.js";

const fixture = (props: Record<string, unknown> = {}): Spec => ({ root: "grid", state: { amount: 2.125 }, elements: {
  grid: { type: "Grid", props: { columns: 2, gap: 1.5 }, children: ["amount"] },
  amount: { type: "NumberInput", props: { label: "Amount", value: { $bindState: "/amount" }, showSlider: true, min: -10, max: 10, step: 1, unit: "min", ...props } },
} });
const validate = (spec: Spec) => validateDocument("Parameters", JSON.stringify({ op: "add", path: "", value: spec }));

describe("R2 presentation contract", () => {
  it("publishes Grid and numeric presentation properties from the generated catalog", () => {
    expect(catalogVersion).toBe("core-v2");
    expect(Object.keys(catalog.components)).toHaveLength(29);
    expect(validate(fixture()).ok).toBe(true);
    expect(writableUiPaths(fixture())).toEqual(["/amount"]);
  });
  it.each([0, 1.5, 8])("keeps fractional spacing and padding %s valid", amount => {
    const spec = fixture();
    spec.elements.grid.props!.gap = amount;
    spec.elements.card = { type: "Card", props: { padding: amount }, children: ["amount"] };
    spec.elements.grid.children = ["card"];
    expect(validate(spec).ok).toBe(true);
  });
  it.each([0, 4, 1.5])("rejects invalid Grid columns %s", columns => {
    const spec = fixture(); spec.elements.grid.props!.columns = columns;
    expect(validate(spec).ok).toBe(false);
  });
  it.each([{ min: undefined }, { max: undefined }, { min: 10 }, { min: 11 }, { max: "10" }, { step: 0 }, { unit: 1 }])("rejects an invalid completed slider without echoing values", props => {
    const result = validate(fixture(props));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.every(issue => issue.path.startsWith("/elements/*/props"))).toBe(true);
  });
  it("keeps null and exact numeric text values even when they are off the slider step", () => {
    for (const amount of [null, 0, -1.125, 2.125]) expect(validateUiValues(fixture(), { "/amount": amount })).toEqual({ "/amount": amount });
    expect(() => validateUiValues(fixture(), { "/amount": 11 })).toThrow();
  });
  it("allows a partial numeric control before slider bounds arrive and rejects an invalid final document", () => {
    const spec = fixture({ max: undefined });
    const raw = JSON.stringify({ title: "Partial", jsonl: JSON.stringify({ op: "add", path: "", value: spec }) + "\n" });
    const stream = new UiArgumentStream();
    const partial = stream.push(raw.slice(0, -2));
    expect(partial.spec.elements.amount).toBeDefined();
    expect(partial.valid).toBe(true);
    expect(stream.push(raw).valid).toBe(false);
  });
  it("preserves the exact previous core document digest after a catalog-only release", async () => {
    const spec: Spec = { root: "n", elements: { n: { type: "NumberInput", props: { label: "N", value: 2 } } } };
    const canonical = JSON.stringify({ elements: { n: { props: { label: "N", value: 2 }, type: "NumberInput" } }, root: "n" });
    const expected = parseInt(createHash("sha256").update(canonical).digest("hex").slice(0, 13), 16);
    expect(await uiDocumentRevision(spec)).toBe(expected);
    expect(await uiDocumentRevision(spec, "core-v1")).toBe(expected);
  });
});

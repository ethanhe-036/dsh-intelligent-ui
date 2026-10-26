import { describe, expect, it } from "vitest";
import { UiArgumentStream, validateDocument, createStateStore } from "../src/core.js";

const patches = [
  { op: "add", path: "/root", value: "main" },
  { op: "add", path: "/state", value: { people: 20 } },
  { op: "add", path: "/elements/main", value: { type: "Col", props: { gap: 2 }, children: ["people", "total"] } },
  { op: "add", path: "/elements/people", value: { type: "Input", props: { inputType: "number", label: "人数", defaultValue: { $bindState: "/people" } } } },
  { op: "add", path: "/elements/total", value: { type: "Text", props: { value: { $calc: "$" + "{/people} * 50" } } } },
];
const jsonl = patches.map(patch => JSON.stringify(patch)).join("\n");

describe("fixed tool argument stream", () => {
  it("renders complete controls before the outer JSON string finishes, preserving every escape", () => {
    const raw = JSON.stringify({ title: '引号" / 反斜线\\ / 🌏', jsonl });
    const parser = new UiArgumentStream();
    let first = -1;
    let final;
    for (let i = 1; i <= raw.length; i++) {
      final = parser.push(raw.slice(0, i));
      if (final.valid && final.spec.elements.people && first < 0) first = i;
    }
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThan(raw.length - 10);
    expect(final?.title).toBe('引号" / 反斜线\\ / 🌏');
    expect(final?.valid).toBe(true);
    expect(final?.spec).toEqual(validateDocument("x", jsonl).ok ? { root: "main", state: { people: 20 }, elements: Object.fromEntries(patches.slice(2).map(patch => [patch.path.split("/").at(-1), patch.value])) } : null);
  });
  it("handles split unicode escapes and a replaced raw stream without mixing documents", () => {
    const parser = new UiArgumentStream();
    parser.push('{"title":"\\u4e');
    expect(parser.push('{"title":"\\u4e2d","jsonl":"').title).toBe("中");
    const replacement = JSON.stringify({ jsonl, title: "new" });
    expect(parser.push(replacement).title).toBe("new");
    expect(parser.push(replacement).spec.elements.people).toBeDefined();
    expect(parser.push(replacement + " ").spec.elements.people).toBeDefined();
  });
  it("reports a stable line path without leaking invalid source text", () => {
    const result = validateDocument("x", jsonl + '\n{"secret-field":"do-not-echo"');
    expect(result).toEqual({ ok: false, issues: [{ code: "invalid-patch", path: "/jsonl/lines/6" }] });
  });
  it("rejects unsafe or unknown components and invalid formulas", () => {
    expect(validateDocument("x", jsonl.replace('"Input"', '"Script"')).ok).toBe(false);
    expect(validateDocument("x", jsonl.replace("* 50", "; fetch('x')")).ok).toBe(false);
  });
  it("accepts table/chart scalar formulas and rejects JavaScript array formulas", () => {
    const extra = [
      {op:"add",path:"/elements/main/children/-",value:"table"},
      {op:"add",path:"/elements/table",value:{type:"Table",props:{columns:[{label:"People"},{label:"Cost"}],rows:[[10,{$calc:"10 * 50"}],[20,{$calc:"20 * 50"}]]}}},
      {op:"add",path:"/elements/main/children/-",value:"chart"},
      {op:"add",path:"/elements/chart",value:{type:"Chart",props:{variant:"bar",data:[{label:"10",value:{$calc:"10 * 50"}},{label:"20",value:{$calc:"20 * 50"}}]}}},
    ];
    expect(validateDocument("x",jsonl+"\n"+extra.map(x=>JSON.stringify(x)).join("\n")).ok).toBe(true);
    extra[3].value = {type:"Chart",props:{variant:"bar",data:{$calc:"[10,20].map(x => x * 50)"}}} as never;
    expect(validateDocument("x",jsonl+"\n"+extra.map(x=>JSON.stringify(x)).join("\n")).ok).toBe(false);
  });
  it("re-seeding streamed or historical defaults cannot replace a user's write", () => {
    const state = createStateStore({ people: 20 });
    state.set("/people", "37");
    state.seed({ people: 20, later: "ready" });
    expect(state.get("/people")).toBe("37");
    expect(state.get("/later")).toBe("ready");
  });
});

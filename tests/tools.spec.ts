import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime, type ToolExecutionInput } from "@deepseek-ai/dsh-tools";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { apply } from "../src/tools.js";
import { firstUseExample, precomputedExample } from "../src/examples.js";
import { createSpecStream, resolveSpec } from "generative-frame/spec";

const contexts: Context[] = [];
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); });

function fixture() {
  const ctx = new Context(); contexts.push(ctx);
  new SystemPrompt(ctx, {});
  const tools = new ToolRuntime(ctx);
  apply(ctx);
  return tools;
}
const valid = { title: "Budget", jsonl: JSON.stringify({ op: "add", path: "", value: {
  root: "amount", state: { amount: 30 }, elements: { amount: { type: "NumberInput", props: { label: "Amount", value: { $bindState: "/amount" } } } },
} }) };
const invoke = (tools: ToolRuntime, args: unknown) => tools.execute({ callId: "tool-ui-test" as ToolExecutionInput["callId"], name: "render_intelligent_ui", arguments: args, signal: new AbortController().signal });

describe("official DSH tool registration", () => {
  it("executes the model-visible complete example and recalculates totals and warnings after edits", async () => {
    const tools = fixture();
    expect(tools.get("render_intelligent_ui")!.description).toContain(firstUseExample.jsonl);
    expect((await invoke(tools, firstUseExample)).isError).toBe(false);
    const parser = createSpecStream();
    parser.push(firstUseExample.jsonl);
    const spec = parser.result().spec;
    const before = resolveSpec(spec)!;
    expect(before.children.find(node => node.id === "total")?.props.value).toBe(50);
    expect(before.children.some(node => node.id === "over")).toBe(false);
    const after = resolveSpec(spec, { state: { items: [{ amount: 90 }, { amount: 20 }], limit: 60 } })!;
    expect(after.children.find(node => node.id === "total")?.props.value).toBe(110);
    expect(after.children.some(node => node.id === "over")).toBe(true);
  });
  it("rejects overlong and unsupported formulas with bounded guidance, then accepts native aggregation", async () => {
    const tools = fixture();
    const document = (formula: string) => ({ title: "Totals", jsonl: JSON.stringify({ op: "add", path: "", value: {
      root: "total", state: { values: [12, 18] }, elements: {
        total: { type: "Fact", props: { label: "Total", value: { $calc: formula } } },
      },
    } }) });
    for (const formula of [Array(260).fill("1").join("+"), "pow(2, 3)"]) {
      const result = await invoke(tools, document(formula));
      expect(result.isError).toBe(true);
      const diagnostic = JSON.stringify(result);
      expect(diagnostic).toContain("invalid-formula");
      expect(diagnostic).toContain("500 characters");
      expect(diagnostic).toContain("precomputed");
      expect(diagnostic).not.toContain(formula);
    }
    expect((await invoke(tools, document("sum(${/values})"))).isError).toBe(false);
    const parser = createSpecStream();
    parser.push(document("sum(${/values})").jsonl);
    expect(resolveSpec(parser.result().spec)?.props.value).toBe(30);
  });
  it("publishes a valid fixed snapshot with assumptions and an update method for unsupported compound growth", async () => {
    const tools = fixture();
    expect(tools.get("render_intelligent_ui")!.description).toContain(precomputedExample.jsonl);
    expect((await invoke(tools, precomputedExample)).isError).toBe(false);
    const parser = createSpecStream(); parser.push(precomputedExample.jsonl);
    const resolved = resolveSpec(parser.result().spec)!;
    expect(resolved.children[0].props.value).toBeCloseTo(100 * 1.03 * 1.03, 8);
    expect(resolved.children[0].props.label).toContain("3%, 2 years");
    expect(resolved.children[1].props.value).toContain("fixed");
    expect(resolved.children[1].props.value).toContain("Request a new calculation");
  });
  it("registers the actual model-visible schema and controlled numeric catalog", () => {
    const tool = fixture().get("render_intelligent_ui")!;
    expect(tool).toBeDefined();
    expect(JSON.stringify(tool)).toContain("jsonl");
    expect(tool.description).toContain("NumberInput");
    expect(tool.description).toContain("Input.props.defaultValue");
    expect(tool.description).toContain("DatePicker binds value");
  });
  it("accepts a valid complete document without embedding the full UI into the model result", async () => {
    const result = await invoke(fixture(), valid);
    expect(result.isError).toBe(false);
    if (!result.isError) expect(result.value).toEqual({ ok: true, protocol: "intelligent-ui/1", catalog: "core-v2", title: "Budget" });
    expect(JSON.stringify(result.content)).not.toContain("$bindState");
  });
  it("publishes a computed-text example that evaluates and follows edits in the pinned resolver", async () => {
    const tools = fixture();
    const expression = { $calc: "'Total ' + (${/people} * ${/minutes}) + ' min'" };
    expect(tools.get("render_intelligent_ui")!.description).toContain(JSON.stringify(expression));
    const spec = { root: "summary", state: { people: 8, minutes: 5 }, elements: {
      summary: { type: "Text", props: { value: expression } },
    } };
    expect((await invoke(tools, { title: "Plan", jsonl: JSON.stringify({ op: "add", path: "", value: spec }) })).isError).toBe(false);
    expect(resolveSpec(spec)?.props.value).toBe("Total 40 min");
    expect(resolveSpec(spec, { state: { people: 9, minutes: 5 } })?.props.value).toBe("Total 45 min");
  });
  it("returns bounded corrective feedback, then accepts a corrected document in the same registry", async () => {
    const tools = fixture();
    const failure = await invoke(tools, { title: "Budget", jsonl: valid.jsonl.replace('"NumberInput"', '"Unknown-private-value"') });
    expect(failure.isError).toBe(true);
    expect(JSON.stringify(failure)).not.toContain("Unknown-private-value");
    expect((await invoke(tools, valid)).isError).toBe(false);
  });
  it("rejects incomplete JSONL and wrongly typed outer arguments through the real execution boundary", async () => {
    const tools = fixture();
    expect((await invoke(tools, { title: "Budget", jsonl: '{"op":' })).isError).toBe(true);
    expect((await invoke(tools, { title: "Budget", jsonl: 123 })).isError).toBe(true);
  });
  it("distinguishes a missing JSON brace from formula errors without echoing input, then accepts correction", async () => {
    const tools = fixture();
    const prefix = JSON.stringify({ op: "add", path: "", value: { root: "total", state: { amount: 30 }, elements: {} } });
    const fact = JSON.stringify({ op: "add", path: "/elements/total", value: { type: "Fact", props: { label: "Private-synthetic-label", value: { $calc: "${/amount} * 2" } } } });
    const failure = await invoke(tools, { title: "Budget", jsonl: prefix + "\n" + fact.slice(0, -1) });
    expect(failure.isError).toBe(true);
    const feedback = JSON.stringify(failure);
    expect(feedback).toContain("invalid-patch /jsonl/lines/2");
    expect(feedback).toContain("before formula validation");
    expect(feedback).toContain("balanced braces");
    expect(feedback).not.toContain("Private-synthetic-label");
    expect(feedback).not.toContain("${/amount}");
    expect((await invoke(tools, { title: "Budget", jsonl: prefix + "\n" + fact })).isError).toBe(false);
    expect(tools.get("render_intelligent_ui")!.description).toContain("outer patch separately");
  });
  it("rejects invalid Grid and slider props, then accepts the corrected R2 document", async () => {
    const tools = fixture();
    const parameters = { title: "Parameters", jsonl: JSON.stringify({ op: "add", path: "", value: {
      root: "layout", state: { amount: 2.125 }, elements: {
        layout: { type: "Grid", props: { columns: 2, gap: 1.5 }, children: ["amount"] },
        amount: { type: "NumberInput", props: { label: "Amount", value: { $bindState: "/amount" }, showSlider: true, unit: "min", min: 0, max: 10, step: 1 } },
      },
    } }) };
    expect((await invoke(tools, { ...parameters, jsonl: parameters.jsonl.replace('"columns":2', '"columns":4') })).isError).toBe(true);
    expect((await invoke(tools, { ...parameters, jsonl: parameters.jsonl.replace('"max":10', '"max":0') })).isError).toBe(true);
    expect((await invoke(tools, parameters)).isError).toBe(false);
  });
  it("explains dangling child references without echoing identifiers and accepts definitions for hidden content", async () => {
    const tools = fixture();
    const spec = { root: "private-panel", state: {}, elements: {
      "private-panel": { type: "Col", props: {}, children: ["private-content"] },
    } };
    const failure = await invoke(tools, { title: "Plan", jsonl: JSON.stringify({ op: "add", path: "", value: spec }) });
    expect(failure.isError).toBe(true);
    const feedback = JSON.stringify(failure);
    expect(feedback).toContain("missing-child /elements/*/children/0");
    expect(feedback).toContain("including initially hidden content");
    expect(feedback).not.toContain("private-panel");
    expect(feedback).not.toContain("private-content");
    const corrected = { ...spec, elements: { ...spec.elements, "private-content": { type: "Text", props: { value: "Details" }, visible: false } } };
    expect((await invoke(tools, { title: "Plan", jsonl: JSON.stringify({ op: "add", path: "", value: corrected }) })).isError).toBe(false);
  });
});

import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime, type ToolExecutionInput } from "@deepseek-ai/dsh-tools";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { resolveSpec, type ResolvedElement, type Spec } from "generative-frame/spec";
import { catalog, UiArgumentStream, validateDocument } from "../src/core.js";
import { catalog as sourceCatalog } from "../src/catalog.js";
import { apply } from "../src/tools.js";
import budget from "./fixtures/budget-visibility.json" assert { type: "json" };

const contexts: Context[] = [];
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); });

function registry() {
  const ctx = new Context(); contexts.push(ctx);
  new SystemPrompt(ctx, {});
  const tools = new ToolRuntime(ctx);
  apply(ctx);
  return tools;
}

function document(): Spec {
  const result = validateDocument(budget.title, budget.jsonl);
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("Synthetic budget document did not validate");
  return result.document.spec;
}

function alerts(node: ResolvedElement | null): ResolvedElement[] {
  if (!node) return [];
  return [
    ...(node.type === "Alert" ? [node] : []),
    ...node.children.flatMap(alerts),
  ];
}

function corrected(): Spec {
  const spec = document();
  for (const id of ["alert-over", "alert-ok"]) {
    const element = spec.elements[id];
    const visible = element.props?.visible;
    if (!visible || typeof visible !== "object" || Array.isArray(visible)) {
      throw new Error("Synthetic visibility condition is missing");
    }
    element.visible = visible as { readonly [key: string]: unknown };
    delete element.props!.visible;
  }
  return spec;
}

const request = (spec: Spec) => ({ title: budget.title, jsonl: JSON.stringify({ op: "add", path: "", value: spec }) });
const invoke = (tools: ToolRuntime, args: typeof budget) => tools.execute({
  callId: "visibility-test" as ToolExecutionInput["callId"],
  name: "render_intelligent_ui", arguments: args, signal: new AbortController().signal,
});

describe("locked native visibility contract", () => {
  it("reproduces the original accepted sample without silently closing the upstream input schema", async () => {
    const schema = catalog.propsSchema("Alert");
    expect(schema).toEqual(sourceCatalog.propsSchema("Alert"));
    expect(schema?.additionalProperties).toBeUndefined();
    expect(Object.keys(schema?.properties ?? {})).toEqual(["title", "description", "tone"]);
    expect(catalog.validateProps("Alert", { title: "Budget", visible: false })).toEqual([]);
    expect((await invoke(registry(), budget)).isError).toBe(false);
    const spec = document();
    expect(new UiArgumentStream().push(JSON.stringify(budget))).toMatchObject({ valid: true, complete: true, spec });
    expect(alerts(resolveSpec(spec)).map(node => [node.id, node.props.visible])).toEqual([
      ["alert-over", false], ["alert-ok", true],
    ]);
  });

  it.each([
    [25, 75, 2000, "alert-ok"],
    [25, 76, 2000, "alert-ok"],
    [25, 77, 2000, "alert-over"],
  ])("native element visibility keeps one alert for %s people at %s with budget %s", (people, perPerson, budgetAmount, expected) => {
    const spec = corrected();
    const input = request(spec);
    expect(validateDocument(input.title, input.jsonl).ok).toBe(true);
    expect(new UiArgumentStream().push(JSON.stringify(input))).toMatchObject({ valid: true, complete: true });
    expect(alerts(resolveSpec(spec, { state: { ...spec.state, people, perPerson, budget: budgetAmount } })).map(node => node.id)).toEqual([expected]);
  });

  it("accepts the corrected document through the same actual tool registry", async () => {
    expect((await invoke(registry(), request(corrected()))).isError).toBe(false);
  });

  it("makes the native visibility position and correction explicit to the model", () => {
    const description = registry().get("render_intelligent_ui")!.description;
    expect(description).toContain("visible is an ELEMENT field, alongside type and props");
    expect(description).toContain("props.visible does not hide an element");
    expect(description).toContain('{"type":"Alert","props":{"tone":"danger","title":"Over budget"},"visible":{"$calc":"${/total} > ${/budget}"}}');
  });
});

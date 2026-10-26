import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { ToolRuntime, type ToolExecutionInput } from "@deepseek-ai/dsh-tools";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { resolveSpec } from "generative-frame/spec";
import { UiArgumentStream, validateDocument } from "../src/core.js";
import { apply } from "../src/tools.js";

const contexts: Context[] = [];
afterEach(async () => { for (const ctx of contexts.splice(0)) await ctx.fiber.dispose(); });
const request = (element: Record<string, unknown>) => ({ title: "Notice", jsonl: JSON.stringify({ op: "add", path: "", value: {
  root: "private-element", elements: { "private-element": element },
} }) });
const wrong = request({ type: "Alert", tone: "warning", title: "Private title", description: "Private content" });
const correct = request({ type: "Alert", props: { tone: "warning", title: "Notice", description: "Content" } });

describe("component property placement", () => {
  it("rejects the completed empty-alert pattern without silently moving its fields", () => {
    const result = validateDocument(wrong.title, wrong.jsonl);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toEqual(expect.arrayContaining([
      { code: "invalid-props", path: "/elements/*/title" },
      { code: "invalid-props", path: "/elements/*/description" },
      { code: "invalid-props", path: "/elements/*/tone" },
    ]));
    const preview = new UiArgumentStream().push(JSON.stringify(wrong));
    expect(preview).toMatchObject({ complete: true, valid: false });
    expect(resolveSpec(preview.spec)?.props).toEqual({});
  });
  it("keeps partial patches valid until the complete document exposes the wrong placement", () => {
    const stream = new UiArgumentStream();
    const raw = JSON.stringify({ ...wrong, jsonl: wrong.jsonl + "\n" });
    expect(stream.push(raw.slice(0, -2)).valid).toBe(true);
    expect(stream.push(raw).valid).toBe(false);
  });
  it("preserves native props, element visibility and unknown open metadata", () => {
    for (const input of [correct, request({ type: "Alert", props: { title: 0, description: 0, extra: "open" }, visible: false, metadata: "open" })]) {
      expect(validateDocument(input.title, input.jsonl).ok).toBe(true);
      expect(new UiArgumentStream().push(JSON.stringify(input))).toMatchObject({ complete: true, valid: true });
    }
  });
  it("rejects hidden misplaced content as well as visible content", () => {
    const input = request({ type: "Alert", visible: false, description: "Hidden private content" });
    expect(validateDocument(input.title, input.jsonl).ok).toBe(false);
  });
  it("gives corrective feedback through the actual registry and accepts a complete correction", async () => {
    const ctx = new Context(); contexts.push(ctx); new SystemPrompt(ctx, {});
    const tools = new ToolRuntime(ctx); apply(ctx);
    const invoke = (args: typeof wrong) => tools.execute({ callId: "placement-test" as ToolExecutionInput["callId"], name: "render_intelligent_ui", arguments: args, signal: new AbortController().signal });
    const failure = await invoke(wrong);
    expect(failure.isError).toBe(true);
    const feedback = JSON.stringify(failure);
    expect(feedback).toContain("inside props");
    expect(feedback).not.toContain("Private content");
    expect(feedback).not.toContain("private-element");
    expect((await invoke(correct)).isError).toBe(false);
    expect(tools.get("render_intelligent_ui")!.description).toContain('"props":{"tone":"warning","title":"Notice","description":"Details"}');
  });
});

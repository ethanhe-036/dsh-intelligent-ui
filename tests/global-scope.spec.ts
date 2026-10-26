import { afterEach, describe, expect, it } from "vitest";
import { Context } from "@deepseek-ai/cordis";
import { createScope } from "@deepseek-ai/dsh-scope";
import { SystemPrompt } from "@deepseek-ai/dsh-system-prompt";
import { ToolRuntime } from "@deepseek-ai/dsh-tools";
import * as uiTools from "../src/tools.js";

const roots: Context[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await root.fiber.dispose(); });

async function fixture() {
  const root = new Context(); roots.push(root);
  await root.plugin(SystemPrompt, {}).await();
  await root.plugin(ToolRuntime, {}).await();
  const standard = {}, custom = {}, child = {};
  let standardContext!: Context;
  await root.plugin({ name: "test-scope-owner", inject: ["tools", "systemPrompt"], apply(ctx: Context) {
    standardContext = createScope(ctx, standard).ctx;
    createScope(ctx, custom);
    createScope(ctx, child, { parent: standard });
  } }).await();
  const mounted = root.plugin(uiTools);
  await mounted.await();
  const names = (scope: object) => root.tools.schemas(scope).map(tool => tool.name);
  return { root, mounted, standard, custom, child, standardContext, names };
}

describe("全局工具装配", () => {
  it("多个 Preset 与子 Agent 继承同一份工具和模型可见目录", async () => {
    const { root, standard, custom, child, names } = await fixture();
    for (const scope of [standard, custom, child]) {
      expect(names(scope).filter(name => name === "render_intelligent_ui")).toHaveLength(1);
      const assembly = await root.systemPrompt.assemble({ scope });
      expect(assembly.tools.filter(tool => tool.name === "render_intelligent_ui")).toHaveLength(1);
      expect(assembly.sections.filter(section => section.name === "intelligent-ui:catalog")).toHaveLength(1);
    }
  });
  it("保留 Preset 的显式禁止及其对子 Agent 的继承，不影响其他 Preset", async () => {
    const { standard, custom, child, standardContext, names } = await fixture();
    const release = standardContext.tools.restrict({ deny: ["render_intelligent_ui"] });
    expect(names(standard)).not.toContain("render_intelligent_ui");
    expect(names(child)).not.toContain("render_intelligent_ui");
    expect(names(custom)).toContain("render_intelligent_ui");
    release();
    expect(names(standard)).toContain("render_intelligent_ui");
    expect(names(child)).toContain("render_intelligent_ui");
  });
  it("卸载全局插件同步移除各作用域的工具与目录", async () => {
    const { root, mounted, standard, custom, child, names } = await fixture();
    await mounted.dispose();
    for (const scope of [standard, custom, child]) {
      expect(names(scope)).not.toContain("render_intelligent_ui");
      expect((await root.systemPrompt.assemble({ scope })).sections
        .some(section => section.name === "intelligent-ui:catalog")).toBe(false);
    }
  });
});

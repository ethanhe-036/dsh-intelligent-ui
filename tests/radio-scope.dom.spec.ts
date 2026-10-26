import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import * as React from "react";
import { IntelligentUi, UiSessionStore } from "../src/renderer.js";
import type { UiDocument } from "../src/core.js";

// 使用本包的 JSDOM/ReactDOM 验证原生单选互斥，不启动浏览器。
const pluginRequire = createRequire(new URL("../package.json", import.meta.url));
describe("重复单选的 DOM 分组", () => {
  let dom: any, root: any, flushSync: any;
  const store = new UiSessionStore();
  beforeAll(() => {
    const frontendRequire = pluginRequire;
    const { JSDOM } = frontendRequire("jsdom");
    dom = new JSDOM('<div id="mount"></div>');
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    flushSync = frontendRequire("react-dom").flushSync;
    root = frontendRequire("react-dom/client").createRoot(document.querySelector("#mount"));
  });
  afterAll(async () => {
    if (root) flushSync(() => root.unmount());
    await new Promise(resolve => setImmediate(resolve));
    store.clear();
    dom?.window.close();
    vi.unstubAllGlobals();
  });
  it("重复行及并列界面独立选中，重渲染保持同组互斥与控件身份", () => {
    const document: UiDocument = { protocol: "intelligent-ui/1", catalog: "core-v2", title: "选择", spec: {
      root: "rows", state: { items: [{ id: "a", choice: "" }, { id: "b", choice: "" }] },
      elements: {
        rows: { type: "Col", repeat: { path: "/items", key: "id" }, children: ["choice"] },
        choice: { type: "RadioGroup", props: { label: "选择", defaultValue: { $bindItem: "/choice" },
          options: [{ label: "甲", value: "a" }, { label: "乙", value: "b" }] } },
      },
    } };
    const render = () => flushSync(() => root.render(React.createElement(React.Fragment, null,
      ...["one", "two"].map(id => React.createElement(IntelligentUi, { key: id, id, store, document, streaming: false })))));
    render();
    const inputs = [...window.document.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
    expect(inputs).toHaveLength(8);
    expect(new Set(inputs.map(input => input.name)).size).toBe(4);
    for (const index of [0, 3, 4, 7]) flushSync(() => inputs[index].click());
    expect(inputs.map(input => input.checked)).toEqual([true, false, false, true, true, false, false, true]);
    expect(store.get("one").input.state.get("/items/0/choice")).toBe("a");
    expect(store.get("one").input.state.get("/items/1/choice")).toBe("b");
    render();
    expect([...window.document.querySelectorAll('input[type="radio"]')]).toEqual(inputs);
    flushSync(() => inputs[1].click());
    expect(inputs.map(input => input.checked)).toEqual([false, true, false, true, true, false, false, true]);
  });
});

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import * as React from "react";
import { SpecRenderer } from "generative-frame/spec/react";
import type { Spec } from "generative-frame/spec";
import { catalog, components } from "../src/catalog.js";

// 真实浏览器对比度为独立可选门禁；安装对应 Playwright 浏览器后显式运行。
const browserTests = process.env.IUI_BROWSER_TESTS === "1";
const pluginRequire = createRequire(new URL("../package.json", import.meta.url));

const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const fixtures = JSON.parse(readFileSync(new URL("./fixtures/visual-catalog.json", import.meta.url), "utf8")).fixtures;

describe.skipIf(!browserTests)("Card/Box 实际源码与浏览器对比度", () => {
  let dom: any, reactRoot: any, flushSync: any;
  const browsers: { engine: string; browser: any }[] = [];
  beforeAll(async () => {
    const frontendRequire = pluginRequire;
    const { JSDOM } = frontendRequire("jsdom");
    const { createCanvas } = frontendRequire("@napi-rs/canvas");
    dom = new JSDOM('<!doctype html><style>.intelligent-ui,.intelligent-ui *{opacity:1;filter:none;mix-blend-mode:normal;background-image:none}</style><div id="mount"></div>');
    const computed = dom.window.getComputedStyle.bind(dom.window);
    // JSDOM 把纯色 background 简写的 image 初始值返回空串；浏览器实际值为 none。
    dom.window.getComputedStyle = (element: Element) => {
      const style = computed(element);
      return new Proxy(style, { get: (target, key) => key === "backgroundImage" && target[key] === "" ? "none" : Reflect.get(target, key, target) });
    };
    dom.window.matchMedia = () => ({ addEventListener() {}, removeEventListener() {} });
    dom.window.HTMLCanvasElement.prototype.getContext = function () { return createCanvas(this.width, this.height).getContext("2d"); };
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    flushSync = frontendRequire("react-dom").flushSync;
    reactRoot = frontendRequire("react-dom/client").createRoot(document.querySelector("#mount"));
    const playwright = pluginRequire("playwright");
    const engines = (process.env.IUI_BROWSER_ENGINES ?? "chromium").split(",");
    for (const engine of engines) {
      if (!["chromium", "firefox", "webkit"].includes(engine)) throw new Error("Unknown browser engine");
      browsers.push({ engine, browser: await playwright[engine].launch({ headless: true }) });
    }
    expect(browsers.length).toBeGreaterThan(0);
    console.info("surface-test-engines", browsers.map(item => item.engine).join(","));
  }, 30000);
  afterAll(async () => {
    if (reactRoot) flushSync(() => reactRoot.unmount());
    await new Promise(resolve => setImmediate(resolve));
    await Promise.all(browsers.map(({ browser }) => browser.close()));
    dom?.window.close();
    vi.unstubAllGlobals();
  });

  function mount(spec: Spec, theme = "light") {
    flushSync(() => reactRoot.render(React.createElement("section", { className: "intelligent-ui", "data-iui-theme": theme, style: { backgroundColor: theme === "light" ? "#fff" : "#181c22" } },
      React.createElement(SpecRenderer, { spec, catalog, components }))));
    return document.querySelector<HTMLElement>('[data-aui="card"],[data-aui="box"]')!;
  }
  function specimen(type: "Card" | "Box", background?: string): Spec {
    return { root: "surface", state: { input: "保留输入" }, elements: {
      surface: { type, props: { ...(type === "Card" ? { title: "参数分组", padding: 1.5, confirm: { label: "确认" }, cancel: { label: "取消" } } : { width: "100%", radius: 12 }), ...(background === undefined ? {} : { background }) }, children: ["body", "muted", "caption", "white", "input"] },
      body: { type: "Text", props: { value: "第一项内容", color: "emphasis" } },
      muted: { type: "Text", props: { value: "说明", color: "secondary" } },
      caption: { type: "Caption", props: { value: "辅助说明" } },
      white: { type: "Text", props: { value: "明确白色", color: "white" } },
      input: { type: "Input", props: { label: "名称", value: { $bindState: "/input" } } },
    } };
  }
  async function measure() {
    const result = [];
    for (const { engine, browser } of browsers) {
      const page = await browser.newPage();
      try {
        await page.route("**/*", (route: any) => route.abort());
        await page.setContent("<style>" + css + "</style>" + document.querySelector("#mount")!.innerHTML);
        result.push({ engine, ...await page.evaluate(() => {
          const surface = document.querySelector<HTMLElement>('[data-aui="card"],[data-aui="box"]')!;
          const pixels = (color: string) => {
            const context = document.createElement("canvas").getContext("2d")!;
            context.fillStyle = color; context.fillRect(0, 0, 1, 1);
            return [...context.getImageData(0, 0, 1, 1).data];
          };
          const layers: number[][] = [];
          for (let element: HTMLElement | null = surface; element; element = element.parentElement) layers.push(pixels(getComputedStyle(element).backgroundColor));
          const background = layers.reverse().reduce((base, color) => color.slice(0, 3).map((v, i) => v * color[3] / 255 + base[i] * (1 - color[3] / 255)), [255, 255, 255]);
          const luminance = (rgb: number[]) => rgb.slice(0, 3).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((a, v, i) => a + v * [.2126, .7152, .0722][i], 0);
          const ratio = (fg: number[], bg: number[]) => { const v = [luminance(fg), luminance(bg)].sort((a, b) => b - a); return (v[0] + .05) / (v[1] + .05); };
          const text = [...surface.querySelectorAll<HTMLElement>('[data-aui="card-title"],[data-aui="caption"],[data-aui="text"]:not([data-aui-color="white"]),[data-aui="card-cancel"],[data-aui="fact-delta"]')].map(node => ({ component: node.dataset.aui, tone: node.dataset.auiTone, trend: node.dataset.auiTrend, foreground: pixels(getComputedStyle(node).color), ratio: ratio(pixels(getComputedStyle(node).color), background) }));
          const field = surface.querySelector<HTMLInputElement>("input");
          const white = surface.querySelector('[data-aui-color="white"]');
          return { text, background: getComputedStyle(surface).backgroundColor, white: white ? pixels(getComputedStyle(white).color) : null, inputRatio: field ? ratio(pixels(getComputedStyle(field).color), pixels(getComputedStyle(field).backgroundColor)) : null };
        }) });
      } finally { await page.close(); }
    }
    return result;
  }

  it.each(["card.base", "box.base"])("修复原 %s fixture，不改其浅色背景", async id => {
    const original = fixtures.find((item: any) => item.id === id);
    for (const theme of ["light", "dark"]) {
      const surface = mount(original.spec, theme);
      expect(surface.style.backgroundColor).toBe("rgb(237, 244, 250)");
      for (const result of await measure()) for (const text of result.text) expect(text.ratio, result.engine + ": " + text.component).toBeGreaterThanOrEqual(4.5);
    }
  }, 20000);
  it.each(["#edf4fa", "#123456", "#777777", "rgb(90,180,200)", "hsl(30,20%,20%)", "rgba(255,255,255,.15)", "transparent"])("两主题保留 %s；默认文案 AA，显式白色与输入主题保持", async background => {
    for (const type of ["Card", "Box"] as const) for (const theme of ["light", "dark"]) {
      const surface = mount(specimen(type, background), theme);
      expect(surface.style.background).toBeTruthy();
      for (const result of await measure()) {
        expect(result.text.length).toBeGreaterThanOrEqual(3);
        for (const text of result.text) expect(text.ratio, [result.engine, type, theme, background, text.component].join("/")).toBeGreaterThanOrEqual(4.5);
        expect(result.white).toEqual([255, 255, 255, 255]);
        expect(result.inputRatio).toBeGreaterThanOrEqual(4.5);
      }
    }
  }, 20000);
  it("祖先底色变化重新合成透明背景，不重新挂载正在编辑的控件", async () => {
    const surface = mount(specimen("Card", "transparent"));
    await new Promise(resolve => setTimeout(resolve, 0));
    const input = surface.querySelector<HTMLInputElement>("input")!;
    input.focus(); input.setSelectionRange(1, 2);
    expect(surface.style.getPropertyValue("--iui-surface-foreground")).toBe("#000");
    surface.closest<HTMLElement>(".intelligent-ui")!.style.backgroundColor = "#181c22";
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(surface.style.getPropertyValue("--iui-surface-foreground")).toBe("#fff");
    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(1);
    mount(specimen("Card", "#edf4fa"));
    expect(document.querySelector("input")).toBe(input);
  });
  it("清除背景时清除适配；渐变仍保留且不伪称已确定前景", () => {
    const surface = mount(specimen("Card", "#123456"));
    expect(surface.style.getPropertyValue("--iui-surface-foreground")).toBe("#fff");
    mount(specimen("Card"));
    expect(surface.style.getPropertyValue("--iui-surface-foreground")).toBe("");
    expect(surface.style.background).toBe("");
    mount(specimen("Card", "linear-gradient(90deg, #fff, #000)"));
    expect(surface.style.backgroundImage).toContain("linear-gradient");
    expect(surface.style.getPropertyValue("--iui-surface-foreground")).toBe("");
  });
  it("Fact 语义色在浅色宿主的单个深底样例可读，保持 trend/upIsGood 映射", async () => {
    const spec: Spec = { root: "surface", elements: {
      surface: { type: "Card", props: { background: "#123456" }, children: ["good", "bad"] },
      good: { type: "Fact", props: { label: "收入", value: "105", delta: "+5%", trend: "up", upIsGood: true } },
      bad: { type: "Fact", props: { label: "成本", value: "105", delta: "+5%", trend: "up", upIsGood: false } },
    } };
    const surface = mount(spec, "light");
    expect(surface.style.backgroundColor).toBe("rgb(18, 52, 86)");
    for (const result of await measure()) {
      const deltas = result.text.filter((item: any) => item.component === "fact-delta");
      expect(deltas.map((item: any) => [item.trend, item.tone])).toEqual([["up", "good"], ["up", "bad"]]);
      console.info("fact-surface-contrast", result.engine, deltas.map((item: any) => ({ tone: item.tone, ratio: Number(item.ratio.toFixed(2)) })));
      for (const delta of deltas) expect(delta.ratio, result.engine + ": " + delta.tone).toBeGreaterThanOrEqual(4.5);
      expect(deltas[0].foreground[1]).toBeGreaterThan(deltas[0].foreground[0]);
      expect(deltas[1].foreground[0]).toBeGreaterThan(deltas[1].foreground[1]);
    }
  }, 20000);
  it("asForm 更换原生根节点后仍适配同一背景，footer 保持原行为", () => {
    const spec = specimen("Card", "#edf4fa");
    const before = mount(spec);
    spec.elements.surface.props!.asForm = true;
    const form = mount({ ...spec, elements: { ...spec.elements } });
    expect(before.tagName).toBe("SECTION");
    expect(form.tagName).toBe("FORM");
    expect(form.style.getPropertyValue("--iui-surface-foreground")).toBe("#000");
    expect(form.querySelector<HTMLButtonElement>('[data-aui="card-confirm"]')!.type).toBe("submit");
    expect(form.querySelector<HTMLButtonElement>('[data-aui="card-cancel"]')!.type).toBe("button");
  });
});

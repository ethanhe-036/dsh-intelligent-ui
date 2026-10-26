import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { after, before, test } from "node:test";

// 只加载源 CSS，以已有 Chromium 验证布局；不构建插件、不启动服务或写出截图。
const runtimeRequire = createRequire(new URL("../package.json", import.meta.url));
const { chromium } = runtimeRequire("playwright");
const css = await readFile(new URL("../src/styles.css", import.meta.url), "utf8");
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

const variants = ["primary", "secondary", "outline", "ghost", "danger"];
const tones = ["info", "success", "warning", "danger"];
const buttons = variants.map((variant) => `<button data-aui="button" data-aui-style="${variant}" id="${variant}">${variant}</button>`).join("");
const alerts = tones.map((tone) => `<div data-aui="alert" data-aui-tone="${tone}"><div data-aui="alert-title">${tone}</div><p data-aui="alert-desc">检查当前输入 / Periksa isian</p></div>`).join("");
const fields = `
  <div class="iui-labeled-control"><label class="iui-field-label" for="name">名称 / Nama perusahaan</label><input data-aui="input" id="name" placeholder="公司名称" value="样例"></div>
  <div class="iui-labeled-control"><label class="iui-field-label" for="region">地区</label><select data-aui="select" id="region"><option>Hong Kong / 香港</option></select></div>
  <div class="iui-labeled-control"><label class="iui-field-label" for="date">日期</label><input data-aui="datepicker" id="date" type="date" value="2026-10-24"></div>
  <textarea data-aui="input" aria-label="补充内容">多行文本</textarea>
  <div data-aui="number-input" data-invalid="true">
    <div class="iui-number-field"><label for="quantity">参与人数 / Jumlah peserta</label><div class="iui-number-control"><input id="quantity" type="text" inputmode="decimal" role="spinbutton" aria-invalid="true" aria-describedby="number-error" value="1."><span class="iui-number-unit">人 / orang</span></div></div>
    <input class="iui-number-slider" type="range" min="0" max="100" value="25" aria-label="参与人数">
    <div class="iui-number-range"><span>0</span><span>100</span></div><span class="iui-field-error" id="number-error">请输入完整数值</span>
  </div>
  <label data-aui="slider-field"><span data-aui="slider-label">比例</span><input data-aui="slider" type="range" aria-label="比例"><output data-aui="slider-value">50%</output></label>
  <label data-aui="checkbox"><input type="checkbox">同意条款</label>
  <label data-aui="checkbox" data-aui-variant="switch"><input type="checkbox" checked>通知</label>
  <fieldset data-aui="radiogroup"><label data-aui="radiogroup-option"><input type="radio" name="choice" checked><span data-aui="option-content"><span data-aui="option-label">直接处理</span><span data-aui="option-description">必要说明</span></span></label></fieldset>
  <fieldset data-aui="checkboxgroup"><div data-aui="checkboxgroup-progress"><span data-aui="checkboxgroup-progress-label">1/2</span><span data-aui="checkboxgroup-progress-track"><span data-aui="checkboxgroup-progress-fill" style="width:50%"></span></span></div><label data-aui="checkboxgroup-option"><input type="checkbox" checked><span data-aui="option-label">已确认</span></label></fieldset>`;
const table = `<div class="iui-table-scroll" tabindex="0" role="region" aria-label="Table"><table data-aui="table"><thead><tr><th data-aui="table-col"><button data-aui="table-sort">标识<span data-aui="table-sort-direction">↑</span></button></th><th data-aui="table-col" data-aui-align="end">金额</th></tr></thead><tbody><tr><td>INVOICE_WITH_LONG_STABLE_IDENTIFIER_01234567890123456789012345678901234567890123456789</td><td data-aui-align="end">1234567890.25</td></tr></tbody></table></div>`;
const chart = `<div data-aui="chart-frame"><div data-aui="chart-ticks"><span>100</span><span>0</span></div><svg data-aui="chart" viewBox="0 0 100 100" role="img" aria-label="指标">${[0, 1, 2, 3, 4].map((n) => `<g data-aui="chart-series" data-aui-series="${n}"><path d="M0 ${n * 15 + 10} L100 ${n * 15 + 10}" stroke="currentColor"></path></g>`).join("")}</svg><div data-aui="chart-xlabels"><div>一月</div><div>二月</div></div><div data-aui="chart-legend">${[0, 1, 2, 3, 4].map((n) => `<span data-aui="chart-legend-item" data-aui-series="${n}"><span data-aui="chart-legend-swatch"></span>系列 ${n}</span>`).join("")}</div></div>`;
const structure = `
  <h3 data-aui="header">月度核对</h3><p data-aui="text">当前输入及计算结果</p><p data-aui="caption">由当前材料生成</p>
  <div data-aui="row" style="--iui-gap:16px"><span data-aui="badge">待确认</span><div data-aui="spacer"></div><span data-aui="badge" data-aui-variant="success">就绪</span></div>
  <dl data-aui="fact"><dt data-aui="fact-label">人数</dt><dd data-aui="fact-value">25<span data-aui="fact-delta" data-aui-tone="good">+5</span><span data-aui="fact-delta" data-aui-tone="bad">-2</span></dd></dl>
  <hr data-aui="divider"><hr data-aui="divider" data-aui-flush="true">
  <div data-aui="box" style="width:120px;height:40px;border-radius:20px;background:rgb(40,60,80)"></div>
  <div data-aui="tabs"><div data-aui="tabs-list" role="tablist"><button data-aui="tabs-tab" role="tab" aria-selected="true">概览</button><button data-aui="tabs-tab" role="tab" aria-selected="false">详细</button></div><div data-aui="tabs-panel" role="tabpanel" tabindex="0">概览内容</div><div data-aui="tabs-panel" hidden>隐藏内容</div></div>
  <ul data-aui="listview"><li data-aui="listview-item"><div data-aui="listview-item-trigger" style="position:relative"><button type="button" aria-label="打开项目" style="position:absolute;inset:0;width:100%;height:100%;padding:0;border:0;background:transparent"></button><div data-aui="listview-item-content" style="position:relative">可操作项目</div></div></li><li data-aui="listview-item">第二项</li></ul>
  <ol data-aui="steps"><li data-aui="steps-item"><div data-aui="steps-title">核对</div><div data-aui="steps-detail">确认信息</div></li></ol>
  <ol data-aui="timeline"><li data-aui="timeline-item"><div data-aui="timeline-time">2026-10-24</div><div data-aui="timeline-title">材料齐全</div><div data-aui="timeline-detail">等待确认</div></li></ol>`;
const gallery = `<h2 class="intelligent-ui-title">输入与结果</h2><div data-aui="col" style="--iui-gap:16px"><section data-aui="card" style="--iui-padding:16px"><header data-aui="card-title">信息</header>${fields}<footer data-aui="card-footer"><button data-aui="card-confirm">确认</button><button data-aui="card-cancel">取消</button></footer></section>${structure}${table}${chart}${alerts}<div data-aui="row" style="--iui-gap:8px">${buttons}</div><div class="intelligent-ui-status">已保存<button class="iui-status-button">重试</button></div><div class="iui-send-status">待发送</div></div>`;

function panel(body, attributes = "") {
  return `<section class="intelligent-ui" ${attributes}>${body}</section>`;
}

async function setup(t, body, { context = {}, styles = "", includeCss = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 }, colorScheme: "light", reducedMotion: "reduce", ...context });
  t.after(() => ctx.close());
  await ctx.route("**/*", (route) => route.abort());
  const page = await ctx.newPage();
  await page.setContent(`<html><head><meta charset="utf-8"><style>body{margin:0;font-family:Arial,sans-serif} ${styles}</style>${includeCss ? `<style>${css}</style>` : ""}</head><body>${body}</body></html>`);
  return page;
}

async function computed(page, selector, properties) {
  return page.locator(selector).first().evaluate((element, keys) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(keys.map((key) => [key, style[key]]));
  }, properties);
}

async function color(page, selector, property = "color", pseudo = null) {
  return page.locator(selector).first().evaluate((element, { property, pseudo }) => {
    const value = getComputedStyle(element, pseudo)[property];
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    context.fillStyle = value;
    context.fillRect(0, 0, 1, 1);
    return [...context.getImageData(0, 0, 1, 1).data];
  }, { property, pseudo });
}

function contrast(a, b) {
  const luminance = (rgb) => rgb.slice(0, 3).map((v) => v / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + .05) / (dark + .05);
}

test("浅深默认主题、系统主题和同页显式主题保持文本及边界对比度", async (t) => {
  const page = await setup(t, panel(gallery, `id="auto"`) + panel("文本", `id="light" data-iui-theme="light"`) + panel("文本", `id="dark" data-iui-theme="dark"`));
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    const background = await color(page, "#auto", "backgroundColor");
    assert.deepEqual(background, await color(page, `#${scheme}`, "backgroundColor"));
    for (const selector of ["#auto", "#auto [data-aui=caption]", "#auto .iui-field-label", "#auto .iui-number-unit", "#auto .iui-field-error"]) {
      assert.ok(contrast(await color(page, selector), background) >= 4.5, `${scheme}: ${selector}`);
    }
    assert.ok(contrast(await color(page, "#name", "color", "::placeholder"), background) >= 4.5);
    assert.ok(contrast(await color(page, "#name", "borderTopColor"), background) >= 3);
    for (const tone of tones) {
      const selector = `#auto [data-aui=alert][data-aui-tone=${tone}]`;
      assert.ok(contrast(await color(page, selector), await color(page, selector, "backgroundColor")) >= 4.5, `${scheme}: ${tone}`);
    }
  }
  assert.notDeepEqual(await color(page, "#light", "backgroundColor"), await color(page, "#dark", "backgroundColor"));
});

test("五种按钮、block、hover、disabled 及 pending 不互相覆盖", async (t) => {
  const page = await setup(t, panel(`${buttons}<fieldset class="intelligent-ui-action" data-block="true"><button id="block" data-aui="button" data-aui-style="primary" data-aui-block="true">继续</button></fieldset>`));
  for (const scheme of ["light", "dark"]) {
    await page.emulateMedia({ colorScheme: scheme });
    const background = await color(page, ".intelligent-ui", "backgroundColor");
    for (const variant of variants) {
      const selector = `#${variant}`;
      await page.mouse.move(0, 0);
      const normal = await color(page, selector, "backgroundColor");
      assert.ok(contrast(await color(page, selector), normal[3] ? normal : background) >= 4.5, variant);
      await page.locator(selector).hover();
      const hovered = await color(page, selector, "backgroundColor");
      assert.notDeepEqual(hovered, normal, `${scheme}: ${variant} hover`);
      assert.ok(contrast(await color(page, selector), hovered) >= 4.5, `${scheme}: ${variant} hover contrast`);
      for (const attribute of ["disabled", "aria-disabled"]) {
        await page.locator(selector).evaluate((element, attribute) => element.setAttribute(attribute, "true"), attribute);
        await page.mouse.move(0, 0);
        const disabled = await color(page, selector, "backgroundColor");
        await page.locator(selector).hover();
        assert.deepEqual(await color(page, selector, "backgroundColor"), disabled);
        assert.equal((await computed(page, selector, ["cursor"])).cursor, "not-allowed");
        await page.locator(selector).evaluate((element, attribute) => element.removeAttribute(attribute), attribute);
      }
      await page.locator(selector).evaluate((element) => element.dataset.auiState = "pending");
      const pending = await color(page, selector, "backgroundColor");
      await page.locator(selector).hover();
      assert.deepEqual(await color(page, selector, "backgroundColor"), pending);
      assert.ok(contrast(await color(page, selector), pending) >= 4.5);
      await page.locator(selector).evaluate((element) => delete element.dataset.auiState);
    }
  }
  const widths = await page.locator("#block").evaluate((button) => [button.getBoundingClientRect().width, button.parentElement.getBoundingClientRect().width]);
  assert.ok(Math.abs(widths[0] - widths[1]) < 1);
});

test("真实 label 纵向排列，NumberInput 自有 label、端点和错误保持独立", async (t) => {
  const page = await setup(t, panel(fields));
  const measurements = await page.locator(".iui-labeled-control").evaluateAll((wrappers) => wrappers.map((wrapper) => {
    const [label, control] = wrapper.children;
    return { gap: control.getBoundingClientRect().top - label.getBoundingClientRect().bottom, weight: getComputedStyle(label).fontWeight, associated: label.control === control, before: getComputedStyle(label, "::before").content, after: getComputedStyle(label, "::after").content };
  }));
  assert.equal(measurements.length, 3);
  for (const value of measurements) {
    assert.equal(value.gap, 6);
    assert.equal(value.weight, "500");
    assert.equal(value.associated, true);
    assert.equal(value.before, "none");
    assert.equal(value.after, "none");
  }
  assert.equal(await page.locator("#quantity").inputValue(), "1.");
  assert.equal((await computed(page, ".iui-number-range", ["justifyContent"])).justifyContent, "space-between");
  assert.deepEqual(await color(page, "#quantity", "borderTopColor"), await color(page, ".iui-field-error"));
});

test("0..8 整数和小数 px 间距在每个布局根生效，嵌套不串值", async (t) => {
  const values = [...Array.from({ length: 9 }, (_, i) => i), .125, 1.5, 2.75, 7.875];
  const markup = values.map((value) => `<div data-aui="row" data-value="${value}" style="--iui-gap:${value * 4}px"><div data-aui="col" style="--iui-gap:16px">A</div><section data-aui="card" style="--iui-padding:${value * 4}px">B</section><div data-aui="grid" style="--iui-gap:${value * 4}px">C</div></div>`).join("");
  const page = await setup(t, panel(markup));
  const actual = await page.locator("[data-value]").evaluateAll((rows) => rows.map((row) => [Number(row.dataset.value) * 4, parseFloat(getComputedStyle(row).gap), parseFloat(getComputedStyle(row.children[0]).gap), parseFloat(getComputedStyle(row.children[1]).paddingTop), parseFloat(getComputedStyle(row.children[2]).gap)]));
  for (const [expected, row, child, padding, grid] of actual) assert.deepEqual([row, child, padding, grid], [expected, 16, expected, expected]);
});

test("Grid 依据最近容器在 560/900 切列，并保持最大列数与源顺序", async (t) => {
  const page = await setup(t, panel(`<div data-iui-grid-container id="container" style="width:559px"><div data-aui="grid" data-columns="3" id="grid" style="--iui-gap:6px"><div>A</div><div>B</div><div>C</div></div><div data-iui-grid-container style="width:300px"><div data-aui="grid" data-columns="3" id="nested"><div>D</div><div>E</div></div></div></div>`));
  for (const width of [559, 560, 899, 900]) {
    await page.locator("#container").evaluate((element, width) => element.style.width = `${width}px`, width);
    for (const maximum of [1, 2, 3]) {
      await page.locator("#grid").evaluate((element, maximum) => element.dataset.columns = maximum, maximum);
      const columns = (await computed(page, "#grid", ["gridTemplateColumns"])).gridTemplateColumns.split(" ").length;
      assert.equal(columns, Math.min(maximum, width >= 900 ? 3 : width >= 560 ? 2 : 1), `${width}/${maximum}`);
      assert.equal((await computed(page, "#nested", ["gridTemplateColumns"])).gridTemplateColumns.split(" ").length, 1);
    }
  }
  assert.deepEqual(await page.locator("#grid > div").allTextContents(), ["A", "B", "C"]);
  assert.equal(page.viewportSize().width, 1200);
});

test("宿主根 token 与模型显式 Card/Box 样式可覆盖默认值", async (t) => {
  const page = await setup(t, panel(`<p data-aui="text">正文</p><p data-aui="caption">说明</p><button data-aui="button">操作</button><section data-aui="card" data-aui-background="#123456" style="background:#123456;color:white;--iui-padding:0px"><p data-aui="text" data-aui-color="white">白色</p></section>${structure}`), { styles: `.intelligent-ui{--iui-background:#fdfcf9;--iui-text:#17202a;--iui-font-size:20px;--iui-font-sm:18px;--iui-font-family:monospace;--iui-root-padding:7px;--iui-radius:11px;--iui-control-height:42px}` });
  assert.deepEqual(await color(page, ".intelligent-ui", "backgroundColor"), [253, 252, 249, 255]);
  assert.equal((await computed(page, ".intelligent-ui", ["paddingTop"])).paddingTop, "7px");
  assert.equal((await computed(page, "[data-aui=text]", ["fontSize"])).fontSize, "20px");
  assert.equal((await computed(page, "[data-aui=caption]", ["fontSize"])).fontSize, "18px");
  assert.equal((await computed(page, "[data-aui=button]", ["borderRadius"])).borderRadius, "11px");
  assert.deepEqual(await color(page, "[data-aui=card]", "backgroundColor"), [18, 52, 86, 255]);
  assert.deepEqual(await color(page, "[data-aui-color=white]"), [255, 255, 255, 255]);
  assert.deepEqual(await computed(page, "[data-aui=box]", ["width", "height", "borderRadius"]), { width: "120px", height: "40px", borderRadius: "20px" });
  await page.setViewportSize({ width: 390, height: 900 });
  assert.equal((await computed(page, ".intelligent-ui", ["paddingTop"])).paddingTop, "7px");
});

test("列表、指标、Table、Chart、Tabs 与 Alert 的真实节点获得各自样式", async (t) => {
  const page = await setup(t, panel(gallery));
  assert.equal((await computed(page, "[data-aui=table]", ["display"])).display, "table");
  assert.equal((await computed(page, "td[data-aui-align=end]", ["textAlign"])).textAlign, "end");
  assert.equal((await computed(page, "[data-aui=tabs-panel][hidden]", ["display"])).display, "none");
  assert.equal((await computed(page, "[data-aui=steps-item]", ["display"])).display, "grid");
  assert.equal((await computed(page, "[data-aui=divider][data-aui-flush]", ["marginTop"])).marginTop, "0px");
  assert.notDeepEqual(await color(page, "[data-aui-tone=good]"), await color(page, "[data-aui-tone=bad]"));
  const colors = [];
  for (let index = 0; index < 5; index++) {
    const series = await color(page, `[data-aui=chart-series][data-aui-series="${index}"]`);
    assert.deepEqual(await color(page, `[data-aui=chart-legend-item][data-aui-series="${index}"] > span`, "backgroundColor"), series);
    colors.push(series.join(","));
  }
  assert.equal(new Set(colors).size, 5);
  for (const tone of tones) {
    const icon = await page.locator(`[data-aui=alert][data-aui-tone=${tone}]`).evaluate((node) => getComputedStyle(node, "::before").maskImage);
    assert.ok(icon.startsWith("url("));
  }
});

test("320/390 宽与 200% 文本下长内容换行，Table 只在自身区域滚动", async (t) => {
  const longText = "请确认本期参与人数与每人金额。".repeat(12) + "PerusahaanDenganNamaSangatPanjang".repeat(10);
  const page = await setup(t, panel(`<p data-aui="text">${longText}</p>${gallery}`));
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const size of [16, 32]) {
      await page.evaluate((size) => document.documentElement.style.fontSize = `${size}px`, size);
      const layout = await page.evaluate(() => {
        const scroll = document.querySelector(".iui-table-scroll");
        return { page: document.documentElement.scrollWidth, viewport: innerWidth, scroll: scroll.scrollWidth, client: scroll.clientWidth };
      });
      assert.ok(layout.page <= layout.viewport + 1, `${width}/${size}: ${JSON.stringify(layout)}`);
      assert.ok(layout.scroll > layout.client, "长标识表格应在表格区域内横向滚动");
      await page.locator(".iui-table-scroll").evaluate((node) => node.scrollLeft = 100);
      assert.ok(await page.locator(".iui-table-scroll").evaluate((node) => node.scrollLeft > 0));
    }
  }
});

test("七列表头保持完整单词，窄容器使用内部滚动，正文保护不变", async (t) => {
  const headings = ["Month", "Period start", "Planned volume", "Actual volume", "Variance", "Plan attainment", "Notional revenue"];
  const cells = ["Jan 2026", "Jan 1, 2026", "20", "12", "-8", "60%", "$1,440.00"];
  const markup = '<div class="iui-table-scroll"><table data-aui="table"><thead><tr>' + headings.map(label => '<th><button data-aui="table-sort">' + label + '</button></th>').join("") + '</tr></thead><tbody><tr>' + cells.map(value => '<td>' + value + '</td>').join("") + '</tr></tbody></table></div><p data-aui="text">' + "LongUnbrokenBodyValue".repeat(40) + '</p>';
  const page = await setup(t, panel(markup));
  for (const width of [748, 320]) {
    await page.setViewportSize({ width, height: 800 });
    const measurements = await page.getByRole("button", { name: "Variance", exact: true }).evaluate(button => {
      const range = document.createRange(); range.selectNodeContents(button);
      const scroller = document.querySelector(".iui-table-scroll");
      return { lines: range.getClientRects().length, wrapping: getComputedStyle(button).overflowWrap, page: document.documentElement.scrollWidth, viewport: innerWidth, scroll: scroller.scrollWidth, client: scroller.clientWidth };
    });
    assert.equal(measurements.lines, 1);
    assert.equal(measurements.wrapping, "normal");
    assert.ok(measurements.page <= measurements.viewport + 1);
    if (width === 320) assert.ok(measurements.scroll > measurements.client);
  }
  assert.equal(await page.locator("td").last().textContent(), "$1,440.00");
  assert.equal((await computed(page, "[data-aui=text]", ["overflowWrap"])).overflowWrap, "anywhere");
});

test("键盘焦点、reduced-motion 和 forced-colors 保留操作反馈", async (t) => {
  const page = await setup(t, panel(`${buttons}${fields}${table}`), { context: { reducedMotion: "no-preference" }, styles: `.intelligent-ui{--iui-focus-width:3px;--iui-focus-offset:4px}` });
  await page.keyboard.press("Tab");
  assert.equal(await page.locator("#primary").evaluate((node) => node.matches(":focus-visible")), true);
  assert.deepEqual(await computed(page, "#primary", ["outlineStyle", "outlineWidth", "outlineOffset"]), { outlineStyle: "solid", outlineWidth: "3px", outlineOffset: "4px" });
  assert.ok((await computed(page, "#primary", ["transitionDuration"])).transitionDuration.includes("0.16s"));
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const selector of ["#primary", "#name"]) assert.ok((await computed(page, selector, ["transitionDuration"])).transitionDuration.split(", ").every((duration) => duration === "0s"));
  await page.emulateMedia({ forcedColors: "active" });
  assert.equal((await computed(page, "[data-aui-variant=switch] > input", ["appearance"])).appearance, "auto");
  assert.equal((await computed(page, "[data-aui=slider]", ["appearance"])).appearance, "auto");
  assert.equal((await computed(page, "#primary", ["outlineStyle"])).outlineStyle, "solid");
});

test("触屏按钮、输入、Tabs、选择项、range 与列表热点至少 44px", async (t) => {
  const page = await setup(t, panel(gallery), { context: { hasTouch: true, viewport: { width: 390, height: 900 } } });
  assert.equal(await page.evaluate(() => matchMedia("(any-pointer: coarse)").matches), true);
  const selectors = `[data-aui=button], [data-aui=card-confirm], [data-aui=card-cancel], [data-aui=tabs-tab], [data-aui=table-sort], .iui-status-button, [data-aui=input], [data-aui=select], [data-aui=datepicker], .iui-number-control > input, [data-aui=checkbox], [data-aui=radiogroup-option], [data-aui=checkboxgroup-option], [data-aui=slider], .iui-number-slider, [data-aui=listview-item-trigger] > button`;
  const sizes = await page.locator(selectors).evaluateAll((elements) => elements.map((node) => ({ name: node.dataset.aui || node.className || node.type, width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })));
  for (const size of sizes) {
    assert.ok(size.height >= 44, JSON.stringify(size));
    assert.ok(size.width >= 44, JSON.stringify(size));
  }
});

test("trusted HCT 后代及根外控件的已定义样式不被通用 CSS 改写", async (t) => {
  const host = `<div class="trusted"><button>Owner 操作</button><input value="Owner"><select><option>Owner</option></select><textarea>Owner</textarea><label>Owner 标签</label><table><tbody><tr><td>Owner 单元格</td></tr></tbody></table><svg><path d="M0 0L10 10"></path></svg></div>`;
  const body = `<div data-aui="button" id="outside">根外</div>${panel(`<section data-aui="card">${host}</section><div data-aui="row">${host}</div><div data-aui="listview-item-content">${host}</div>`)}`;
  const hostStyle = `.trusted{font:17px monospace;color:rgb(27,37,47);line-height:1.7;color-scheme:light}.trusted :is(button,input,select,textarea,label,table,td,svg,path){box-sizing:border-box;min-width:0;min-height:0;max-width:none;margin:3px;padding:3px 5px;border:2px solid rgb(13,23,33);border-radius:3px;background:rgb(233,243,253);color:rgb(27,37,47);font:17px monospace;outline:1px dashed rgb(17,27,37);outline-offset:1px;transition:none}`;
  const page = await setup(t, body, { styles: hostStyle, includeCss: false });
  const snapshot = () => page.locator(".trusted :is(button,input,select,textarea,label,table,td,svg,path), #outside").evaluateAll((nodes) => nodes.map((node) => {
    const style = getComputedStyle(node);
    return Object.fromEntries(["display", "padding", "margin", "border", "borderRadius", "backgroundColor", "color", "font", "outline", "outlineOffset", "minHeight", "minWidth", "transition", "fill", "stroke"].map((key) => [key, style[key]]));
  }));
  const original = await snapshot();
  await page.addStyleTag({ content: css });
  assert.deepEqual(await snapshot(), original);
  await page.locator(".trusted button").first().focus();
  assert.equal((await computed(page, ".trusted button", ["outlineStyle"])).outlineStyle, "dashed");
});

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const source = new URL("../src/catalog.generated.json", import.meta.url);
const target = new URL("../tests/fixtures/visual-catalog.json", import.meta.url);
const copy = value => structuredClone(value);
const dark = "#15304b";
const options = [{ label: "标准选项", value: "standard" }, { label: "备选方案", value: "alternative" }];
const describedOptions = options.map(option => ({ ...option, description: "保留选项的完整辅助说明，窄容器允许换行。" }));
const points = [{ label: "一月", value: 12.5 }, { label: "二月", value: -3.75 }, { label: "三月", value: 0 }];
const dates = {
  date: { value: "2026-10-24", min: "2026-01-01", max: "2026-12-31" },
  time: { value: "12:30", min: "08:00", max: "18:00" },
  datetime: { value: "2026-10-24T12:30", min: "2026-01-01T00:00", max: "2026-12-31T23:59" },
};
const base = {
  Header: { text: "确定性组件标题", size: "lg" },
  Text: { value: "可换行的正文示例，用于比较层级、字重、颜色和窄容器中的阅读表现。", size: "md", weight: "normal", color: "emphasis" },
  Caption: { value: "这是一段需要保持可读、允许换行的辅助说明。" },
  Divider: { flush: false },
  Fact: { label: "合成指标", value: 1250.75, delta: "+4.5%", trend: "up", upIsGood: true },
  Button: { label: "更新本地示例", buttonStyle: "primary", block: false, submit: false, undoable: false },
  Select: { options, label: "选择方案", placeholder: "请选择一个选项", name: "choice", defaultValue: "standard" },
  Input: { inputType: "text", placeholder: "输入合成文本", multiline: false, label: "文本输入", name: "text", defaultValue: "示例文本" },
  DatePicker: { inputType: "date", ...dates.date, label: "计划日期", name: "date" },
  Checkbox: { label: "启用本地预览", name: "enabled", defaultChecked: true, variant: "checkbox" },
  Slider: { name: "quantity", label: "调整数量", min: -10, max: 10, step: 0.25, defaultValue: 1.5, unit: "小时" },
  RadioGroup: { options: describedOptions, name: "radio", label: "单选方案", defaultValue: "standard" },
  CheckboxGroup: { options: describedOptions, name: "multiple", label: "多选方案", defaultValue: ["standard"], progress: true },
  Card: { title: "参数分组", padding: 4, background: "#edf4fa", asForm: false, confirm: { label: "本地确认" }, cancel: { label: "本地取消" } },
  Col: { gap: 4, align: "start" }, Row: { gap: 4, align: "center", justify: "start" }, Spacer: {},
  Badge: { value: "待处理", variant: "default" },
  Box: { width: "100%", height: 96, radius: 12, background: "#edf4fa" },
  Tabs: { tabs: ["参数", "结果"], label: "切换本地视图" }, ListView: {}, ListViewItem: {},
  Steps: { steps: [{ title: "检查输入", detail: "确认字段和数值。" }, { title: "查看结果", detail: "保持阅读顺序。" }] },
  Timeline: { items: [{ time: "2026-10-24 09:00", title: "开始检查", detail: "仅为合成演示。" }, { time: "2026-10-24 12:30", title: "完成检查", detail: "没有外部请求。" }] },
  Table: { columns: [{ label: "数值", align: "end", format: { kind: "number", currency: "CNY", decimals: 2 } }], rows: [[1250.75], [0], [-3.75]], sortable: true },
  Chart: { variant: "bar", data: points, series: [{ label: "计划", color: "#2563eb", data: points }, { label: "实际", color: "#b45309", data: points.map(p => ({ ...p, value: p.value / 2 })) }], stacked: false, showAxis: true, showLegend: true, color: "#2563eb" },
  Alert: { title: "请核对当前合成数据", description: "完整说明保持可读，并与标题区分层级。", tone: "info" }, Grid: { columns: 2, gap: 4 },
  NumberInput: { label: "精确数值", value: 2.125, min: -10, max: 10, step: 0.25, showSlider: false, unit: "小时" },
};
const languages = {
  "zh-CN": "请核对跨部门年度预算与资源分配计划中的完整项目名称，保留所有说明、金额单位及负责人信息，较窄容器应允许自然换行。",
  "zh-TW": "請核對跨部門年度預算與資源分配計畫中的完整專案名稱，保留所有說明、金額單位及負責人資訊，較窄容器應允許自然換行。",
  en: "Review the complete cross-department annual budget and resource allocation description, including responsibility and units. InternationalizationAndAccessibilityMustRemainReadableWithoutTruncation.",
  id: "Periksa nama lengkap rencana anggaran tahunan lintas departemen dan alokasi sumber daya beserta penanggung jawab serta satuan jumlah; seluruh keterangan harus tetap terbaca pada ruang yang sempit.",
};
const textPaths = {
  Header: ["text"], Text: ["value"], Caption: ["value"], Fact: ["label"], Button: ["label"],
  Select: ["label", "placeholder", "options[].label"], Input: ["label", "placeholder", "defaultValue"],
  DatePicker: ["label"], Checkbox: ["label"], Slider: ["label"],
  RadioGroup: ["label", "options[].label", "options[].description"], CheckboxGroup: ["label", "options[].label", "options[].description"],
  Card: ["title", "confirm.label", "cancel.label"], Badge: ["value"], Tabs: ["label", "tabs[]"],
  Steps: ["steps[].title", "steps[].detail"], Timeline: ["items[].time", "items[].title", "items[].detail"],
  Table: ["columns[].label"], Chart: ["data[].label", "series[].label", "series[].data[].label"],
  Alert: ["title", "description"], NumberInput: ["label"],
};

function tokens(path) { return path.replaceAll("[]", ".*").split("."); }
function atPath(value, path) {
  let values = [value];
  for (const token of tokens(path)) values = values.flatMap(item => token === "*"
    ? Array.isArray(item) ? item : []
    : item && typeof item === "object" && Object.hasOwn(item, token) ? [item[token]] : []);
  return values;
}
function setPath(object, path, value) {
  const parts = tokens(path);
  let current = object;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i] === "*" ? 0 : parts[i];
    current[key] ??= parts[i + 1] === "*" ? [] : {};
    current = current[key];
  }
  current[parts.at(-1) === "*" ? 0 : parts.at(-1)] = copy(value);
}
function properties(schema, prefix = "") {
  const result = [];
  for (const [name, value] of Object.entries(schema.properties ?? {})) {
    const path = prefix + name;
    result.push({ path, schema: value });
    if (value.properties) result.push(...properties(value, path + "."));
    let item = value.items, itemPath = path;
    while (item) {
      itemPath += "[]";
      if (item.properties) result.push(...properties(item, itemPath + "."));
      else result.push({ path: itemPath, schema: item });
      item = item.items;
    }
  }
  return result;
}
function localEvent(value) { return { action: "setState", params: { path: "/lastEvent", value } }; }
function text(value, color = "emphasis") { return { type: "Text", props: { value, color } }; }

function componentSpec(name, props) {
  const node = { type: name, props: copy(props) };
  const spec = { root: "sample", state: { lastEvent: "尚未操作" }, elements: { sample: node } };
  const elements = spec.elements;
  if (["Card", "Col", "Row", "Box", "Grid", "Tabs"].includes(name)) {
    elements.first = text("第一项内容"); elements.second = text("第二项内容，可以自然换行。");
    node.children = ["first", "second"];
  }
  if (name === "Card") node.on = { confirm: localEvent("confirm"), cancel: localEvent("cancel") };
  if (name === "Button") {
    node.on = { press: localEvent("press") };
    if (props.submit) {
      spec.root = "form";
      elements.form = { type: "Card", props: { asForm: true }, children: ["sample"], on: { confirm: localEvent("confirm") } };
    }
  }
  if (name === "Divider" || name === "Spacer") {
    spec.root = "layout"; elements.first = text("开始"); elements.second = text("结束");
    elements.layout = { type: name === "Spacer" ? "Row" : "Col", props: { gap: 2 }, children: ["first", "sample", "second"] };
  }
  if (name === "ListView") {
    node.children = ["item"];
    elements.item = { type: "ListViewItem", children: ["first"], on: { press: localEvent("item") } };
    elements.first = text("列表项目完整说明");
  }
  if (name === "ListViewItem") {
    node.on = { press: localEvent("item") }; node.children = ["first"];
    elements.first = text("可操作列表项"); spec.root = "list";
    elements.list = { type: "ListView", children: ["sample"] };
  }
  if (name === "Text" && String(props.color).startsWith("white")) {
    spec.root = "background";
    elements.background = { type: "Box", props: { background: dark, width: "100%" }, children: ["sample"] };
  }
  return spec;
}
function mergeSpec(targetSpec, spec, prefix) {
  for (const [id, original] of Object.entries(spec.elements)) {
    const node = copy(original);
    if (node.children) node.children = node.children.map(child => prefix + child);
    if (node.slots) node.slots = Object.fromEntries(Object.entries(node.slots).map(([slot, ids]) => [slot, ids.map(id => prefix + id)]));
    targetSpec.elements[prefix + id] = node;
  }
  targetSpec.elements[targetSpec.root].children.push(prefix + spec.root);
}

/** 浏览器直接读取 fixture.spec；这里只转为既有 JSONL 参数，不调用模型或 RPC。 */
export function fixtureArguments(fixture) {
  const patches = [
    { op: "add", path: "/root", value: fixture.spec.root },
    { op: "add", path: "/state", value: fixture.spec.state ?? {} },
    ...Object.entries(fixture.spec.elements).map(([id, value]) => ({
      op: "add", path: "/elements/" + id.replaceAll("~", "~0").replaceAll("/", "~1"), value,
    })),
  ];
  return { title: fixture.title, jsonl: patches.map(patch => JSON.stringify(patch)).join("\n") + "\n" };
}

/** 覆盖标记只表示数据覆盖，不表示视觉或交互验收通过；变体不做全部笛卡尔积。 */
export function buildVisualCatalog() {
  const definitions = JSON.parse(readFileSync(source, "utf8"));
  const names = Object.keys(definitions.components);
  if (names.length !== 29 || names.some(name => !Object.hasOwn(base, name))) throw new Error("VISUAL_FIXTURE_COMPONENT_INVENTORY_DRIFT");
  const fixtures = [];
  const add = (id, title, spec, tags, locale = "zh-CN") => fixtures.push({
    id, title, locale, tags, components: [...new Set(Object.values(spec.elements).map(node => node.type))], spec,
  });
  const sample = (name, suffix, props, tags = []) => add(
    name.toLowerCase() + "." + suffix, name + " · " + suffix, componentSpec(name, props), ["component", ...tags],
  );
  for (const name of names) {
    const schema = definitions.components[name].props;
    sample(name, "base", base[name], ["all-properties"]);
    if (Object.keys(schema.properties ?? {}).some(prop => !(schema.required ?? []).includes(prop)))
      sample(name, "defaults", Object.fromEntries((schema.required ?? []).map(prop => [prop, copy(base[name][prop])])), ["omitted-optionals"]);
    for (const { path, schema: field } of properties(schema)) {
      const values = field.enum ?? (field.type === "boolean" ? [false, true] : null);
      if (!values) continue;
      for (const value of values) {
        const props = copy(base[name]); setPath(props, path, value);
        if (name === "DatePicker" && path === "inputType") Object.assign(props, dates[value]);
        if (name === "Table" && path === "columns[].format.kind" && value === "date") props.rows = [["2026-10-24"], ["2026-01-01"]];
        sample(name, path.replaceAll("[]", "-item") + "." + value, props, [field.enum ? "enum" : "boolean", path]);
      }
    }
  }
  for (const name of ["Card", "Col", "Row", "Grid"]) {
    const prop = name === "Card" ? "padding" : "gap";
    for (const amount of [0, 0.25, 1, 1.5, 2, 3, 4, 5, 6, 7, 7.75, 8])
      sample(name, prop + "." + amount, { ...base[name], [prop]: amount }, ["numeric-boundary", "spacing"]);
  }
  for (const name of ["Header", "Text", "Caption", "Fact", "Badge"]) {
    const prop = name === "Header" ? "text" : "value";
    for (const [label, value] of Object.entries({ empty: "", zero: 0, negative: -12.5, tiny: 0.000001, large: 1000000000000 }))
      sample(name, "scalar." + label, { ...base[name], [prop]: value }, ["scalar-edge", label]);
  }
  for (const [label, value] of Object.entries({ empty: null, zero: 0, negative: -1.125, decimal: 2.125, tiny: 0.000001, large: 1000000000000 }))
    sample("NumberInput", "value." + label, { ...base.NumberInput, value, min: -1000000000000, max: 1000000000000 }, ["numeric-edge", label]);
  for (const [label, value] of Object.entries({ minimum: -10, maximum: 10, null: null, zero: 0, offstep: 2.125 })) {
    const spec = componentSpec("NumberInput", { ...base.NumberInput, showSlider: true, step: 1, value: { $bindState: "/amount" } });
    spec.state.amount = value;
    add("numberinput.slider." + label, "NumberInput · 单值联动 " + label, spec, ["numeric-boundary", "bound-input", "showSlider", label]);
  }
  for (const [label, props] of Object.entries({
    minimum: { defaultValue: -10 }, maximum: { defaultValue: 10 }, zero: { defaultValue: 0 },
    fractional: { min: -1.5, max: 1.5, step: 0.125, defaultValue: -0.375 },
    tiny: { min: 0, max: 0.001, step: 0.000001, defaultValue: 0.000123 },
    large: { min: -1000000000000, max: 1000000000000, step: 1, defaultValue: 0 },
  })) sample("Slider", label, { ...base.Slider, ...props }, ["numeric-boundary", label]);
  for (const step of [0.000001, 0.125, 1, 1000000]) sample("NumberInput", "step." + step, { ...base.NumberInput, step }, ["numeric-boundary", "step"]);
  for (const name of ["Select", "RadioGroup", "CheckboxGroup"]) {
    sample(name, "empty-options", { ...base[name], options: [], defaultValue: name === "CheckboxGroup" ? [] : "" }, ["empty-data"]);
    sample(name, "empty-selection", { ...base[name], defaultValue: name === "CheckboxGroup" ? [] : "" }, ["empty-value"]);
  }
  sample("CheckboxGroup", "all-selected", { ...base.CheckboxGroup, defaultValue: options.map(option => option.value) }, ["selection", "progress"]);
  for (const inputType of ["text", "password", "number"]) {
    sample("Input", inputType + ".empty", { ...base.Input, inputType, defaultValue: "" }, ["empty-value"]);
    sample("Input", inputType + ".value", { ...base.Input, inputType, defaultValue: inputType === "number" ? "-12.50" : inputType === "password" ? "SYNTHETIC-ONLY" : "000042" }, ["string-semantics"]);
  }
  for (const inputType of Object.keys(dates)) for (const boundary of ["min", "max"])
    sample("DatePicker", inputType + "." + boundary, { ...base.DatePicker, inputType, ...dates[inputType], value: dates[inputType][boundary] }, ["date-boundary"]);
  sample("DatePicker", "empty", { ...base.DatePicker, value: "" }, ["empty-value"]);
  for (const prop of ["width", "height"]) for (const [label, value] of Object.entries({ zero: 0, fractional: 120.5, css: "24rem", large: 1280 }))
    sample("Box", prop + "." + label, { ...base.Box, [prop]: value }, ["dimension", label]);
  for (const radius of [0, 1.5, 24, "full"]) sample("Box", "radius." + radius, { ...base.Box, radius }, ["radius"]);
  for (const container of ["Card", "Box"]) {
    const spec = componentSpec(container, { ...base[container], background: dark });
    spec.elements.sample.children = ["white", "white-70", "white-50"];
    delete spec.elements.first; delete spec.elements.second;
    for (const color of ["white", "white-70", "white-50"]) spec.elements[color] = text("显式深色背景上的 " + color + " 文本", color);
    add(container.toLowerCase() + ".explicit-background-white", container + " · 显式背景与白字", spec, ["explicit-background", "white-text"]);
  }
  for (const buttonStyle of definitions.components.Button.props.properties.buttonStyle.enum)
    sample("Button", buttonStyle + ".block-undoable", { ...base.Button, buttonStyle, block: true, undoable: true }, ["button-combination"]);
  sample("Card", "form-footer", { ...base.Card, asForm: true }, ["local-event", "footer"]);

  const dataCases = { empty: [], zero: [0, 0, 0], negative: [-12.5, -3.75, -0.125], mixed: [-3.75, 0, 12.5], tiny: [-0.000001, 0, 0.000002], large: [-1000000000000, 0, 1000000000000] };
  for (const variant of definitions.components.Chart.props.properties.variant.enum) {
    for (const [label, values] of Object.entries(dataCases)) {
      const data = values.map((value, i) => ({ label: "项目 " + (i + 1), value }));
      sample("Chart", variant + "." + label, { variant, data, showAxis: true, showLegend: false, color: "#2563eb" }, ["chart-data", label]);
    }
    sample("Chart", variant + ".multiseries-stacked", { ...base.Chart, variant, stacked: true }, ["chart-series", "stacked"]);
  }
  for (const [label, values] of Object.entries(dataCases)) sample("Table", "data." + label, { ...base.Table, rows: values.map(value => [value]) }, ["table-data", label]);
  sample("Table", "formats", { columns: [
    { label: "金额", align: "end", format: { kind: "currency", currency: "USD", decimals: 2 } },
    { label: "占比", align: "end", format: { kind: "percent", decimals: 2 } },
    { label: "日期", align: "start", format: { kind: "date" } }, { label: "完成", align: "start" },
  ], rows: [[1250.75, 0.125, "2026-10-24", true], [0, 0, "2026-01-01", false], [-12.5, -0.05, "2025-12-31", true]], sortable: true }, ["table-formats", "mixed-scalars"]);
  for (const decimals of [0, 2, 6]) sample("Table", "decimals." + decimals, { ...base.Table, columns: [{ label: "小数", format: { kind: "number", decimals } }] }, ["numeric-format"]);
  sample("Table", "long-rows", { columns: [{ label: languages["zh-CN"] }, { label: "数量", align: "end" }], rows: Array.from({ length: 100 }, (_, i) => [languages[Object.keys(languages)[i % 4]], i - 50]), sortable: true }, ["long-data", "long-label"]);
  for (const [name, property] of [["Steps", "steps"], ["Timeline", "items"], ["Tabs", "tabs"]]) {
    const spec = componentSpec(name, { ...base[name], [property]: [] });
    if (name === "Tabs") { spec.elements.sample.children = []; delete spec.elements.first; delete spec.elements.second; }
    add(name.toLowerCase() + ".empty", name + " · 空数据", spec, ["empty-data"]);
  }
  for (const count of [0, 50]) {
    const spec = { root: "list", state: { lastEvent: "" }, elements: { list: { type: "ListView", props: {}, children: [] } } };
    for (let i = 0; i < count; i++) {
      spec.elements.list.children.push("item-" + i);
      spec.elements["item-" + i] = { type: "ListViewItem", props: {}, children: ["text-" + i], on: { press: localEvent(i) } };
      spec.elements["text-" + i] = text((i + 1) + ". " + languages["zh-CN"]);
    }
    add("listview.count-" + count, "ListView · " + count + " 项", spec, [count ? "long-data" : "empty-data"]);
  }
  const amountExpression = "$" + "{/amount}";
  const nested = { root: "outer", state: { amount: 2.125 }, elements: {
    outer: { type: "Grid", props: { columns: 3, gap: 1.5 }, children: ["inner", "number", "fact"] },
    inner: { type: "Grid", props: { columns: 2, gap: 0.25 }, children: ["a", "b"] },
    a: text("嵌套布局第一项"), b: text(languages.en),
    number: { type: "NumberInput", props: { ...base.NumberInput, showSlider: true, value: { $bindState: "/amount" } } },
    fact: { type: "Fact", props: { label: "本地计算", value: { $calc: amountExpression + " * 2" } } },
  } };
  add("grid.nested-bound-input", "嵌套 Grid 与同一输入绑定", nested, ["nested-grid", "bound-input", "formula"]);
  const spacer = componentSpec("Spacer", {});
  spacer.elements.layout.type = "Col"; spacer.root = "bounds";
  spacer.elements.bounds = { type: "Box", props: { height: 240, width: "100%" }, children: ["layout"] };
  add("spacer.vertical", "Spacer · 纵向容器", spacer, ["vertical-layout"]);
  for (const [locale, label] of Object.entries(languages)) {
    const spec = { root: "page", state: { lastEvent: "" }, elements: { page: { type: "Col", props: { gap: 4 }, children: [] } } };
    for (const [name, paths] of Object.entries(textPaths)) {
      const props = copy(base[name]);
      for (const path of paths) setPath(props, path, label);
      mergeSpec(spec, componentSpec(name, props), name.toLowerCase() + "-");
    }
    add("locale." + locale, label, spec, ["four-languages", "long-label", "mixed-components"], locale);
  }
  const dynamic = { root: "content", state: { amount: 0, limit: 0 }, elements: {
    content: { type: "Col", props: { gap: 2 }, children: ["amount", "result", "over", "ok"] },
    amount: { type: "NumberInput", props: { label: "当前值", value: { $bindState: "/amount" } } },
    result: { type: "Text", props: { value: { $calc: amountExpression + " * 2" } } },
    over: { type: "Alert", props: { title: "高于边界", tone: "warning" }, visible: { $calc: amountExpression + " > $" + "{/limit}" } },
    ok: { type: "Alert", props: { title: "等于或低于边界", tone: "success" }, visible: { $calc: amountExpression + " <= $" + "{/limit}" } },
  } };
  add("alert.formula-boundary", "公式与条件显示边界", dynamic, ["formula", "visibility", "bound-input"]);

  const entries = (fixture, name, path) => Object.values(fixture.spec.elements)
    .filter(node => node.type === name).flatMap(node => atPath(node.props ?? {}, path));
  const coverage = names.map(component => {
    const fields = properties(definitions.components[component].props);
    return {
      component, fixtureIds: fixtures.filter(fixture => fixture.components.includes(component)).map(fixture => fixture.id),
      properties: fields.map(({ path, schema }) => ({
        path, status: "fixture-covered",
        fixtureIds: fixtures.filter(fixture => entries(fixture, component, path).length > 0).map(fixture => fixture.id),
        ...(schema.enum ? { enumValues: schema.enum.map(value => ({ value, fixtureIds: fixtures.filter(fixture => entries(fixture, component, path).some(found => found === value)).map(fixture => fixture.id) })) } : {}),
      })),
      ...(fields.length ? {} : { noPropertiesReason: "当前目录没有声明公开 props；通过容器、children 或本地事件样例覆盖组件。" }),
    };
  });
  return {
    schemaVersion: 1, protocol: "intelligent-ui/1", catalogVersion: "core-v2",
    catalogSha256: createHash("sha256").update(JSON.stringify(definitions)).digest("hex"), scope: "29-generic-components-only",
    consumer: { specField: "fixtures[].spec", fixtureIdentityField: "fixtures[].id", stateIsolation: "create one state store per mounted fixture instance", actionPolicy: "local setState only; no analyze, RPC or model calls",
      widths: [320, 390, 559, 560, 768, 899, 900, 1280], zoom: [1, 2],
      themes: { standalone: ["light", "dark"], nativeDsh: ["light", "dark"], hctBase: ["light"], hctBuddy: ["light"] },
      locales: Object.keys(languages), validationScope: "catalog and fixture data only; no browser, CSS, interaction or business acceptance" },
    applicability: [
      { component: "Chart", property: "stacked", variants: ["line", "sparkline"], reason: "锁定上游仅对 bar/area 堆叠；line/sparkline 合法接收但忽略该属性，不声称绘制堆叠线。", fixtureIds: ["chart.line.multiseries-stacked", "chart.sparkline.multiseries-stacked"] },
      { component: "Badge", property: "variant", reason: "目录声明开放 string，不能伪称有限枚举全集；base 覆盖一个明确字符串样例。", fixtureIds: ["badge.base"] },
      { component: "Table", property: "columns[].format.decimals", reason: "目录未声明数值上下界；0/2/6 是格式样例，不伪称整个 number 域或浏览器极限已验。", fixtureIds: ["table.decimals.0", "table.decimals.2", "table.decimals.6"] },
    ],
    coverage, fixtures,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3 || !["--write", "--check"].includes(process.argv[2])) throw new Error("Use --write or --check");
  const catalog = buildVisualCatalog();
  const expected = JSON.stringify(catalog, null, 2) + "\n";
  if (process.argv[2] === "--write") writeFileSync(target, expected);
  else if (readFileSync(target, "utf8") !== expected) throw new Error("VISUAL_FIXTURE_DRIFT");
  console.log("Visual fixtures: " + catalog.coverage.length + " components, " + catalog.fixtures.length + " specs; " + process.argv[2]);
}

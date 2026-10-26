import { toSpecCatalog, defaultGenerativeUILibrary } from "@assistant-ui/generative-ui/spec";
import { defineCatalog } from "generative-frame/spec";
import type { SpecComponents } from "generative-frame/spec/react";
import { Children, cloneElement, createElement, isValidElement, useContext, useId, useLayoutEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { NumberInput } from "./number-input.js";
import { TextInput } from "./text-input.js";
import { Grid } from "./grid.js";
import { UiDomContext } from "./edit-context.js";

// 首版目录只包含受控本地组件；来源打开和业务组件由宿主显式扩展。
export const componentNames = [
  "Header", "Text", "Caption", "Divider", "Fact", "Button", "Select", "Input",
  "DatePicker", "Checkbox", "Slider", "RadioGroup", "CheckboxGroup", "Card", "Col",
  "Row", "Spacer", "Badge", "Box", "Tabs", "ListView", "ListViewItem", "Steps",
  "Timeline", "Table", "Chart", "Alert",
] as const;

function useSurfaceForeground(background: unknown, asForm: boolean) {
  const ref = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const card = ref.current;
    const root = card?.closest<HTMLElement>(".intelligent-ui");
    if (!card || !root || typeof background !== "string") return;
    const view = card.ownerDocument.defaultView;
    const canvas = card.ownerDocument.createElement("canvas");
    canvas.width = canvas.height = 1;
    const context = canvas.getContext("2d");
    if (!view || !context) return;
    const layers: HTMLElement[] = [];
    for (let element: HTMLElement | null = card; element; element = element.parentElement) {
      layers.push(element);
      if (element === root) break;
    }
    const update = () => {
      card.style.removeProperty("--iui-surface-foreground");
      card.style.removeProperty("--iui-surface-color-scheme");
      const styles = layers.map(element => view.getComputedStyle(element));
      // 渐变/图片/混合不等于单一底色；不采样或覆盖合法背景，也不伪称其对比度合格。
      if (styles.some(style => style.backgroundImage !== "none" || style.mixBlendMode !== "normal" || Number(style.opacity) !== 1 || style.filter !== "none")) return;
      const originalBackground = styles[0].backgroundColor;
      context.clearRect(0, 0, 1, 1);
      for (const style of [...styles].reverse()) {
        context.fillStyle = style.backgroundColor;
        context.fillRect(0, 0, 1, 1);
      }
      const [r, g, b, alpha] = context.getImageData(0, 0, 1, 1).data;
      if (alpha !== 255) return;
      const linear = [r, g, b].map(value => {
        const channel = value / 255;
        return channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      });
      const luminance = linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722;
      const foreground = (luminance + .05) / .05 >= 1.05 / (luminance + .05) ? "#000" : "#fff";
      card.style.setProperty("--iui-surface-foreground", foreground);
      card.style.setProperty("--iui-surface-color-scheme", foreground === "#fff" ? "dark" : "light");
      // currentColor 等自引用背景不能由修改自身前景得到可靠对比度。
      if (view.getComputedStyle(card).backgroundColor !== originalBackground) {
        card.style.removeProperty("--iui-surface-foreground");
        card.style.removeProperty("--iui-surface-color-scheme");
      }
    };
    update();
    const observer = new view.MutationObserver(update);
    // 只观察自有布局祖先的公开样式/主题；自身由 props 更新，避免变量写入反馈循环。
    for (const element of layers.slice(1)) observer.observe(element, { attributes: true, attributeFilter: ["style", "data-iui-theme"] });
    const media = view.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", update);
    return () => {
      observer.disconnect();
      media.removeEventListener("change", update);
      card.style.removeProperty("--iui-surface-foreground");
      card.style.removeProperty("--iui-surface-color-scheme");
    };
  }, [background, asForm]);
  return ref;
}

const library = Object.fromEntries(componentNames.map(name => {
  const entry = defaultGenerativeUILibrary[name];
  if (["Select", "DatePicker", "RadioGroup", "CheckboxGroup", "Checkbox", "Slider"].includes(name)) {
    return [name, { ...entry, render: (props: Record<string, unknown>) => {
      const scope = useContext(UiDomContext);
      const localScope = useId();
      const node = entry.render(props as never);
      const bound = props.$bindings !== undefined;
      // 0.0.7 的已绑定控件用当前值作 DOM key；保留公开 render 与全部事件，只稳定控件节点。
      const stable = isValidElement(node) && bound ? cloneElement(node, { key: "bound-control" }) : node;
      if (["Select", "DatePicker"].includes(name) && typeof props.label === "string" && props.label && isValidElement<{ id?: string }>(stable))
        return createElement("div", { className: "iui-labeled-control" },
          createElement("label", { className: "iui-field-label", htmlFor: localScope }, props.label),
          cloneElement(stable, { id: localScope }));
      if (name !== "RadioGroup" && name !== "Checkbox") return stable;
      const adapt = (item: ReactNode): ReactNode => {
        if (!isValidElement<{ children?: ReactNode; type?: string; name?: string }>(item) || typeof item.type !== "string") return item;
        if (item.type === "input") return cloneElement(item, name === "RadioGroup"
          ? { name: JSON.stringify([scope, localScope, item.props.name]) }
          : bound ? { key: "bound-control" } : {});
        return item.props.children === undefined ? item : cloneElement(item, { children: Children.map(item.props.children, adapt) });
      };
      return adapt(stable);
    } }];
  }
  if (!["Card", "Box", "Col", "Row"].includes(name)) return [name, entry];
  return [name, { ...entry, render: (props: Record<string, unknown>) => {
    const surfaceRef = name === "Card" || name === "Box" ? useSurfaceForeground(props.background, name === "Card" && props.asForm === true) : undefined;
    const node = entry.render(props as never);
    if (!isValidElement<{ style?: CSSProperties; ref?: typeof surfaceRef; "data-iui-explicit-background"?: string }>(node)) return node;
    const value = props[name === "Card" ? "padding" : "gap"];
    const amount = typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 8 ? value : 4;
    const explicit = surfaceRef && typeof props.background === "string";
    return cloneElement(node, { ...(surfaceRef ? { ref: surfaceRef } : {}),
      ...(explicit ? { "data-iui-explicit-background": "" } : {}),
      style: { ...node.props.style,
        ...(explicit ? { color: name === "Card" ? "var(--iui-surface-foreground, white)" : "var(--iui-surface-foreground, inherit)" } : {}),
        ...(name === "Box" ? {} : { [name === "Card" ? "--iui-padding" : "--iui-gap"]: String(amount * 4) + "px" }) } });
  } }];
}));

const standard = toSpecCatalog(
  library,
  { actions: { analyze: {
    description: "Explicitly send selected current input values for a new agent answer. Bind only to Button press; ordinary changes and watches never send.",
    params: { type: "object", properties: { prompt: { type: "string" }, paths: { type: "array", items: { type: "string" } } }, required: ["prompt", "paths"], additionalProperties: false },
  } } },
);

export const catalog = defineCatalog({
  components: { ...Object.fromEntries(Object.entries(standard.catalog.components).map(([name, definition]) =>
    [name, { ...definition, props: standard.catalog.propsSchema(name) }])),
  Grid: { description: "Responsive equal-width layout, in document order. columns is the maximum (default 2): below 560px content width use one column, below 900px at most two. gap uses 4px units, including fractions. Layout only; no input state.",
    props: { type: "object", properties: { columns: { type: "integer", enum: [1, 2, 3], default: 2 }, gap: { type: "number", minimum: 0, maximum: 8, default: 4 } }, additionalProperties: false },
    slots: ["default"] },
  NumberInput: { description: "Editable numeric value. Bind value with $bindState to a number or null; unlike text Input this stays numeric for formulas. Clearing writes null. Optional showSlider shares this ONE value and requires finite min < max; null disables the slider. step only controls slider/arrow increments, never rounds numeric text. unit is display only.",
    props: { type: "object", properties: { label: { type: "string" }, value: { type: ["number", "null"] },
      min: { type: "number" }, max: { type: "number" }, step: { type: "number", exclusiveMinimum: 0 }, showSlider: { type: "boolean", default: false }, unit: { type: "string" } }, required: ["label", "value"], additionalProperties: false },
    events: ["change"] } },
  actions: Object.fromEntries(Object.entries(standard.catalog.actions).map(([name, definition]) =>
    [name, { ...definition, params: standard.catalog.paramsSchema(name) }])),
});
export const components: SpecComponents = { ...standard.components, Input: TextInput, NumberInput, Grid };

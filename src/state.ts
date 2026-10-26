import { createStateStore, resolveSpec, type Spec, type SpecElement } from "generative-frame/spec";
import definitions from "./catalog.generated.json" with { type: "json" };

/** values 是 JSON Pointer 到输入值的完整快照，不包含模型默认值或业务事实。 */
export interface UiSaveRequest {
  document_revision: number;
  expected_revision: number;
  operation_id: string;
  values: Record<string, unknown>;
}

export interface UiStateSnapshot {
  document_revision: number;
  state_revision: number;
  values: Record<string, unknown>;
}

export type UiStateErrorCode =
  | "INVALID_REQUEST" | "INVALID_PATH" | "UNDECLARED_INPUT" | "INVALID_VALUE"
  | "DOC_CHANGED" | "STATE_CONFLICT" | "REVISION_CONFLICT" | "OPERATION_CONFLICT" | "STORE_CLOSED";

/** 诊断仅带静态类别、脱敏路径和版本；服务端输入由正常 load 返回。 */
export class UiStateError extends Error {
  constructor(
    public readonly code: UiStateErrorCode,
    public readonly path: string,
    public readonly current?: Pick<UiStateSnapshot, "document_revision" | "state_revision">,
  ) {
    super(code);
    this.name = "UiStateError";
  }
}

const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const expressionKeys = new Set([
  "$state", "$bindState", "$item", "$bindItem", "$index", "$event", "$calc", "$template",
  "$cond", "$then", "$else", "$and", "$or",
]);

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function jsonSafe(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || (!Array.isArray(value) && !record(value))) return false;
  if (ancestors.has(value)) return false;
  ancestors.add(value);
  const keys = Reflect.ownKeys(value).filter(key => !(Array.isArray(value) && key === "length"));
  const valid = (!Array.isArray(value) || keys.length === value.length) && keys.every(key => {
    if (typeof key !== "string" || forbidden.has(key) || expressionKeys.has(key)) return false;
    if (Array.isArray(value) && (!/^(0|[1-9]\d*)$/.test(key) || Number(key) >= value.length)) return false;
    const property = Object.getOwnPropertyDescriptor(value, key)!;
    return property.enumerable && "value" in property && jsonSafe(property.value, ancestors);
  });
  ancestors.delete(value);
  return valid;
}

function safePath(path: string): boolean {
  if (!path.startsWith("/") || /~(?![01])/u.test(path)) return false;
  return path.slice(1).split("/").every(token => {
    const decoded = token.replace(/~1/g, "/").replace(/~0/g, "~");
    return !forbidden.has(decoded) && decoded !== "-";
  });
}

const controls: Record<string, { prop: string; kind: string }> = {
  NumberInput: { prop: "value", kind: "numberOrNull" },
  Input: { prop: "defaultValue", kind: "string" },
  Select: { prop: "defaultValue", kind: "string" },
  RadioGroup: { prop: "defaultValue", kind: "string" },
  CheckboxGroup: { prop: "defaultValue", kind: "strings" },
  Checkbox: { prop: "defaultChecked", kind: "boolean" },
  Slider: { prop: "defaultValue", kind: "number" },
  DatePicker: { prop: "value", kind: "string" },
};
type Declaration = { element: SpecElement; control: boolean; sample?: unknown };

/** 旧式直接事件绑定在恢复时也显示已保存值；表达式转换或多目标事件不猜测反向映射。 */
export function uiControlInput(element: SpecElement): { prop: string; path: string } | undefined {
  const control = controls[element.type];
  if (!control) return undefined;
  const binding = element.props?.[control.prop];
  if (record(binding) && typeof binding.$bindState === "string") return undefined;
  const paths = new Set<string>();
  const components = definitions.components as Record<string, { events?: string[] }>;
  for (const event of components[element.type]?.events ?? []) {
    const actions = element.on?.[event];
    for (const action of actions ? Array.isArray(actions) ? actions : [actions] : []) {
      const value = action.params?.value;
      const path = action.params?.path;
      if (action.action === "setState" && typeof path === "string" && safePath(path) && record(value) &&
        Object.keys(value).length === 1 && (value.$event === true || value.$event === "")) paths.add(path);
    }
  }
  return paths.size === 1 ? { prop: control.prop, path: [...paths][0] } : undefined;
}

function reachable(spec: Spec): SpecElement[] {
  const found: SpecElement[] = [];
  const visited = new Set<string>();
  const pending = [spec.root];
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id) || !Object.hasOwn(spec.elements, id)) continue;
    visited.add(id);
    const element = spec.elements[id];
    found.push(element);
    pending.push(...(element.children ?? []), ...Object.values(element.slots ?? {}).flat());
  }
  return found;
}

function watchTargets(elements: SpecElement[], state: Record<string, unknown> = {}): Set<string> {
  const targets = new Set<string>();
  for (const element of elements) {
    if (!element.watch) continue;
    // 只借用公开解析器读取写入目标，不执行 watch 或建立第二个公式执行器。
    const resolved = resolveSpec({ root: "input", elements: { input: {
      type: element.type, on: element.watch,
    } }, state });
    for (const actions of Object.values(resolved?.on ?? {})) {
      for (const action of actions) {
        if (action.action === "setState" && typeof action.params.path === "string") {
          targets.add(action.params.path);
        }
      }
    }
  }
  return targets;
}

function derivedPath(path: string, targets: Set<string>): boolean {
  return [...targets].some(other => other === "" || path === other ||
    path.startsWith(other + "/") || other.startsWith(path + "/"));
}

function declarations(spec: Spec): Map<string, Declaration[]> {
  const writable = new Map<string, Declaration[]>();
  const elements = reachable(spec);
  const derived = watchTargets(elements, spec.state);
  const seed = createStateStore(spec.state);
  const add = (path: unknown, declaration: Declaration) => {
    if (typeof path !== "string" || !safePath(path)) return;
    writable.set(path, [...(writable.get(path) ?? []), declaration]);
  };
  for (const element of elements) {
    const control = Object.hasOwn(controls, element.type) ? controls[element.type] : undefined;
    const binding = control && element.props?.[control.prop];
    if (record(binding) && Object.keys(binding).length === 1) {
      add(binding.$bindState, { element, control: true });
    }
    const components = definitions.components as Record<string, { events?: string[] }>;
    const events = Object.hasOwn(components, element.type) ? components[element.type].events ?? [] : [];
    for (const event of events) {
      const bound = element.on?.[event];
      for (const action of bound ? Array.isArray(bound) ? bound : [bound] : []) {
        const path = action.params?.path;
        if (action.action !== "setState" || typeof path !== "string" || !safePath(path)) continue;
        // 类型优先来自目标初值；公式和字面量均交由上游解析，绝不保存表达式本身。
        const resolved = resolveSpec({ root: "input", elements: { input: {
          type: element.type, on: { [event]: action },
        } }, state: spec.state });
        const initial = seed.get(path);
        const sample = initial === undefined ? resolved?.on[event]?.[0]?.params.value : initial;
        const payload = action.params?.value;
        const directControlEvent = control !== undefined && record(payload) &&
          Object.keys(payload).length === 1 && (payload.$event === true || payload.$event === "");
        add(path, { element, control: directControlEvent, sample });
      }
    }
  }
  for (const path of writable.keys()) {
    if (derivedPath(path, derived)) writable.delete(path);
  }
  return writable;
}

/** 隐藏控件仍保留输入声明；未挂到根树的元素、watch 和动态事件路径不授予写入。 */
export function writableUiPaths(spec: Spec): string[] {
  return [...declarations(spec).keys()].sort();
}

function sameShape(value: unknown, sample: unknown): boolean {
  if (sample === null) return value === null;
  if (Array.isArray(sample)) {
    return Array.isArray(value) && (sample.length === 0 ? value.length === 0 :
      value.every(item => sample.some(candidate => sameShape(item, candidate))));
  }
  if (record(sample)) {
    return record(value) && Object.keys(value).length === Object.keys(sample).length &&
      Object.keys(sample).every(key => Object.hasOwn(value, key) && sameShape(value[key], sample[key]));
  }
  return sample !== undefined && typeof value === typeof sample;
}

function temporal(value: string, kind: unknown): number | undefined {
  const date = /(\d{4})-(\d{2})-(\d{2})/.source;
  const time = /(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?/.source;
  const zonePattern = /(Z|[+-]\d{2}:\d{2})?/.source;
  const pattern = kind === "time" ? `^${time}$` : kind === "datetime"
    ? `^${date}T${time}${zonePattern}$` : `^${date}$`;
  const match = new RegExp(pattern).exec(value);
  if (!match) return undefined;
  let dateValue = 0;
  if (kind !== "time") {
    const [, year, month, day] = match;
    const parsed = new Date(`${year}-${month}-${day}T00:00:00Z`);
    if (+year! < 1 || parsed.getUTCFullYear() !== +year! ||
      parsed.getUTCMonth() + 1 !== +month! || parsed.getUTCDate() !== +day!) return undefined;
    dateValue = parsed.getTime() / 1000;
  }
  if (kind !== "time" && kind !== "datetime") return dateValue;
  const offset = kind === "time" ? 1 : 4;
  const hour = Number(match[offset]), minute = Number(match[offset + 1]);
  const second = Number(match[offset + 2] ?? 0);
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  const zone = kind === "datetime" ? match[8] : undefined;
  let zoneSeconds = 0;
  if (zone && zone !== "Z") {
    const hours = Number(zone.slice(1, 3)), minutes = Number(zone.slice(4));
    if (hours > 23 || minutes > 59) return undefined;
    zoneSeconds = (hours * 3600 + minutes * 60) * (zone[0] === "+" ? 1 : -1);
  }
  return dateValue + hour * 3600 + minute * 60 + second +
    Number("0." + (match[offset + 3] ?? "0")) - zoneSeconds;
}

function validControl(value: unknown, declaration: Declaration, state: Record<string, unknown>): boolean {
  const { element } = declaration;
  const control = controls[element.type];
  if (control.kind === "numberOrNull") {
    if (value !== null && typeof value !== "number") return false;
  } else if (control.kind === "strings") {
    if (!Array.isArray(value) || !value.every(item => typeof item === "string")) return false;
  } else if (typeof value !== control.kind) return false;
  const props = resolveSpec({ root: "input", elements: { input: {
    type: element.type, props: element.props,
  } } }, { state })?.props ?? {};
  if (element.type === "NumberInput") {
    return value === null || (typeof value === "number" && Number.isFinite(value) &&
      (typeof props.min !== "number" || value >= props.min) &&
      (typeof props.max !== "number" || value <= props.max));
  }
  if (element.type === "Slider") {
    const finite = (candidate: unknown): candidate is number => typeof candidate === "number" && Number.isFinite(candidate);
    // 与锁定组件的 safeMin/safeMax/safeStep 一致，不把非法参数发明为额外产品限制。
    const min = finite(props.min) ? props.min : 0;
    const max = finite(props.max) ? Math.max(props.max, min) : min + 100;
    const step = finite(props.step) && props.step > 0 ? props.step : 1;
    const number = value as number;
    const ticks = (number - min) / step;
    return number >= min && number <= max &&
      Math.abs(ticks - Math.round(ticks)) <= Number.EPSILON * Math.max(1, Math.abs(ticks)) * 8;
  }
  if (["Select", "RadioGroup", "CheckboxGroup"].includes(element.type)) {
    const options = Array.isArray(props.options) ? props.options : [];
    const candidates = Array.isArray(value) ? value : [value];
    if (element.type === "Select" && value === "" && props.placeholder !== undefined) return true;
    return new Set(candidates).size === candidates.length && candidates.every(candidate =>
      options.some(option => record(option) && option.value === candidate));
  }
  if (element.type === "DatePicker" && value !== "") {
    const current = temporal(value as string, props.inputType);
    if (current === undefined) return false;
    const bound = (raw: unknown) => {
      if (typeof raw !== "string") return undefined;
      // 混合本地/带时区时间的范围依赖浏览器时区；该协议未携带时区，不按服务端时区猜测。
      const hasZone = (text: string) => /(?:Z|[+-]\d{2}:\d{2})$/.test(text);
      if (props.inputType === "datetime" && hasZone(raw) !== hasZone(value as string)) return undefined;
      return temporal(raw, props.inputType);
    };
    const min = bound(props.min);
    const max = bound(props.max);
    return (min === undefined || current >= min) && (max === undefined || current <= max);
  }
  return true;
}

/** 校验完整的指针值快照。拒绝未知字段，不截断、不转换用户的普通编辑值。 */
export function validateUiValues(spec: Spec, values: unknown): Record<string, unknown> {
  if (!record(values) || !jsonSafe(values)) throw new UiStateError("INVALID_VALUE", "/values/*");
  const writable = declarations(spec);
  const state = createStateStore(spec.state);
  for (const [path, value] of Object.entries(values)) {
    if (!safePath(path)) throw new UiStateError("INVALID_PATH", "/values/*");
    if (!writable.has(path)) throw new UiStateError("UNDECLARED_INPUT", "/values/*");
    if (Object.keys(values).some(other => other !== path && path.startsWith(other + "/"))) {
      throw new UiStateError("INVALID_PATH", "/values/*");
    }
    try { state.set(path, value, "replace"); }
    catch { throw new UiStateError("INVALID_PATH", "/values/*"); }
  }
  const derived = watchTargets(reachable(spec), state.getState());
  for (const [path, value] of Object.entries(values)) {
    if (derivedPath(path, derived)) throw new UiStateError("UNDECLARED_INPUT", "/values/*");
    const declarations = writable.get(path)!;
    const bound = declarations.filter(item => item.control);
    const valid = bound.length ? bound.every(item => validControl(value, item, state.getState())) :
      declarations.some(item => sameShape(value, item.sample));
    if (!valid) throw new UiStateError("INVALID_VALUE", "/values/*");
  }
  return structuredClone(values);
}

/** 在任何异步等待之前复制请求，调用方后续改草稿不能改变正在保存的操作。 */
export function freezeUiSaveRequest(request: unknown): UiSaveRequest {
  if (!record(request) || !jsonSafe(request)) throw new UiStateError("INVALID_REQUEST", "/request");
  if (Object.keys(request).sort().join(",") !== "document_revision,expected_revision,operation_id,values") {
    throw new UiStateError("INVALID_REQUEST", "/request");
  }
  for (const key of ["document_revision", "expected_revision"] as const) {
    if (!Number.isSafeInteger(request[key]) || (request[key] as number) < 0) {
      throw new UiStateError("INVALID_REQUEST", "/" + key);
    }
  }
  if (typeof request.operation_id !== "string" || !request.operation_id.length) {
    throw new UiStateError("INVALID_REQUEST", "/operation_id");
  }
  if (!record(request.values)) throw new UiStateError("INVALID_REQUEST", "/values");
  return structuredClone(request) as unknown as UiSaveRequest;
}

/** 对象键顺序不影响同一请求的身份；数组顺序、空字符串和类型保持不变。 */
export function uiRequestFingerprint(request: UiSaveRequest): string {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
    record(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(request));
}

import { createSpecStream, defineCatalog, resolveSpec, validateSpec, type ResolvedElement, type Spec, type SpecStream, type CatalogDefinition, type Catalog } from "generative-frame/spec";
import definitions from "./catalog.generated.json" with { type: "json" };

export const protocol = "intelligent-ui/1" as const;
export const toolName = "render_intelligent_ui" as const;
export const catalogVersion = "core-v2" as const;
export const documentRevisionNamespace = "core-v1" as const;
export const catalog = defineCatalog(definitions as CatalogDefinition);

export interface UiDocument {
  protocol: typeof protocol;
  catalog: string;
  title: string;
  spec: Spec;
}

const revisions = new WeakMap<Spec, Map<string, Promise<number>>>();

/** 同一已解析文档跨宿主、转义及对象键序得到相同版本；不以补片行数代替内容身份。 */
export function uiDocumentRevision(spec: Spec, version = documentRevisionNamespace as string): Promise<number> {
  const versions = revisions.get(spec) ?? new Map<string, Promise<number>>();
  let revision = versions.get(version);
  if (!revision) {
    const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
      value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value)
        .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
        .map(([key, item]) => [key, canonical(item)])) : value;
    const source = (version === documentRevisionNamespace ? "" : version + "\n") + JSON.stringify(canonical(spec));
    revision = crypto.subtle.digest("SHA-256", new TextEncoder().encode(source))
      .then(digest => Number.parseInt(Array.from(new Uint8Array(digest).slice(0, 7),
        byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 13), 16));
    versions.set(version, revision);
    revisions.set(spec, versions);
  }
  return revision;
}

function presentationIssues(spec: Spec, selectedCatalog: Catalog): { code: string; path: string }[] {
  const issues: { code: string; path: string }[] = [];
  const elementFields = new Set(["type", "props", "children", "slots", "visible", "repeat", "on", "watch"]);
  // 原生开放对象会忽略错层的展示字段；仅检查目录已声明的属性，不关闭未知扩展。
  for (const element of Object.values(spec.elements)) {
    const properties = selectedCatalog.propsSchema(element.type)?.properties ?? {};
    for (const property of Object.keys(properties)) {
      if (!elementFields.has(property) && Object.hasOwn(element, property)) {
        issues.push({ code: "invalid-props", path: "/elements/*/" + property.replace(/~/g, "~0").replace(/\//g, "~1") });
        if (issues.length === 12) return issues;
      }
    }
  }
  if (issues.length) return issues;
  const root = resolveSpec(spec);
  const pending: ResolvedElement[] = root ? [root] : [];
  while (pending.length && issues.length < 12) {
    const node = pending.pop()!;
    if (node.type === "NumberInput" && node.props.showSlider === true &&
      !(typeof node.props.min === "number" && Number.isFinite(node.props.min) &&
        typeof node.props.max === "number" && Number.isFinite(node.props.max) && node.props.min < node.props.max))
      issues.push({ code: "invalid-props", path: "/elements/*/props/showSlider" });
    if (node.type === "NumberInput" && node.props.step !== undefined &&
      !(typeof node.props.step === "number" && Number.isFinite(node.props.step) && node.props.step > 0))
      issues.push({ code: "invalid-props", path: "/elements/*/props/step" });
    pending.push(...node.children, ...Object.values(node.slots).flat());
  }
  return issues;
}

/** 只返回静态错误类别与脱敏路径，绝不回显失败行、动态元素名或输入。 */
export function validateDocument(title: string, jsonl: string, selectedCatalog: Catalog = catalog, version: string = catalogVersion):
  { ok: true; document: UiDocument } | { ok: false; issues: { code: string; path: string }[] } {
  const parser = createSpecStream();
  parser.push(jsonl);
  const result = parser.result();
  if (result.errors.length) return { ok: false, issues: result.errors.slice(0, 12).map(error => ({ code: "invalid-patch", path: "/jsonl/lines/" + error.line })) };
  const validation = validateSpec(result.spec, selectedCatalog);
  if (!validation.ok) return { ok: false, issues: validation.issues.filter(x => x.severity === "error").slice(0, 12).map(x => ({ code: x.code, path: x.path.replace(/\/elements\/[^/]+/g, "/elements/*").replace(/\/state(?:\/.*)?$/, "/state/*") })) };
  const issues = presentationIssues(result.spec, selectedCatalog);
  if (issues.length) return { ok: false, issues };
  return { ok: true, document: { protocol, catalog: version, title, spec: result.spec } };
}

/** 解码固定工具的顶层字符串参数；半个转义、Unicode 和换行留待下一片。 */
export class UiArgumentStream {
  constructor(private readonly selectedCatalog: Catalog = catalog) {}
  private raw = "";
  private phase: "object" | "key" | "colon" | "value" | "separator" | "done" | "invalid" = "object";
  private inString = false;
  private escape = false;
  private unicode = "";
  private key = "";
  private value = "";
  private parser: SpecStream = createSpecStream();
  private currentTitle = "";
  private finished = false;
  private invalidPatch = false;

  push(raw: string): { title: string; spec: Spec; valid: boolean; complete: boolean } {
    if (!raw.startsWith(this.raw)) this.reset();
    let jsonlDelta = "";
    const add = (value: string) => {
      this.value += value;
      if (this.phase === "value" && this.key === "jsonl") jsonlDelta += value;
      if (this.phase === "value" && this.key === "title") this.currentTitle = this.value;
    };
    for (const char of raw.slice(this.raw.length)) {
      if (this.phase === "invalid") break;
      if (this.inString) {
        if (this.unicode) {
          if (!/[0-9a-f]/i.test(char)) { this.phase = "invalid"; break; }
          this.unicode += char;
          if (this.unicode.length === 5) { add(String.fromCharCode(parseInt(this.unicode.slice(1), 16))); this.unicode = ""; }
        } else if (this.escape) {
          this.escape = false;
          if (char === "u") this.unicode = "u";
          else {
            const decoded: Record<string, string> = { '"': '"', "\\": "\\", "/": "/", b: "\b", f: "\f", n: "\n", r: "\r", t: "\t" };
            if (!(char in decoded)) { this.phase = "invalid"; break; }
            add(decoded[char]);
          }
        } else if (char === "\\") this.escape = true;
        else if (char === '"') {
          this.inString = false;
          if (this.phase === "key") { this.key = this.value; this.phase = "colon"; }
          else this.phase = "separator";
          this.value = "";
        } else if (char.charCodeAt(0) < 32) this.phase = "invalid";
        else add(char);
        continue;
      }
      if (/\s/.test(char)) continue;
      if (this.phase === "object" && char === "{") this.phase = "key";
      else if ((this.phase === "key" || this.phase === "value") && char === '"') { this.inString = true; this.value = ""; }
      else if (this.phase === "colon" && char === ":") this.phase = "value";
      else if (this.phase === "separator" && char === ",") this.phase = "key";
      else if ((this.phase === "key" || this.phase === "separator") && char === "}") this.phase = "done";
      else this.phase = "invalid";
    }
    this.raw = raw;
    if (jsonlDelta) {
      const result = this.parser.push(jsonlDelta);
      this.invalidPatch = this.invalidPatch || result.errors.length > 0;
    }
    if (this.phase === "done" && !this.finished) {
      const result = this.parser.result();
      this.invalidPatch = this.invalidPatch || result.errors.length > 0;
      this.finished = true;
    }
    const spec = this.parser.spec;
    return { title: this.currentTitle, spec, complete: this.phase === "done", valid: this.phase !== "invalid" && !this.invalidPatch && validateSpec(spec, this.selectedCatalog, { partial: this.phase !== "done" }).ok && (this.phase !== "done" || presentationIssues(spec, this.selectedCatalog).length === 0) };
  }

  private reset(): void {
    this.raw = ""; this.phase = "object"; this.inString = false; this.escape = false;
    this.unicode = ""; this.key = ""; this.value = ""; this.currentTitle = "";
    this.parser = createSpecStream();
    this.finished = false; this.invalidPatch = false;
  }
}

export type { Spec, Catalog, CatalogDefinition } from "generative-frame/spec";
export { createStateStore, defineCatalog } from "generative-frame/spec";

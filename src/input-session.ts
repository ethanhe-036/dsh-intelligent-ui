import { createStateStore, uiDocumentRevision, type Spec } from "./core.js";
import { writableUiPaths, type UiSaveRequest, type UiStateSnapshot } from "./state.js";

export interface UiStateTransport {
  load(id: string): Promise<UiStateSnapshot>;
  save(id: string, request: UiSaveRequest): Promise<UiStateSnapshot>;
}

export type UiSaveStatus = "local" | "loading" | "saved" | "dirty" | "saving" | "unknown" | "conflict" | "unavailable";
export interface UiInputSnapshot { status: UiSaveStatus; code?: string; version: number }

function equal(a: unknown, b: unknown): boolean {
  const canonical = (value: unknown): unknown => Array.isArray(value) ? value.map(canonical) :
    value !== null && typeof value === "object" ? Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, item]) => [key, canonical(item)])) : value;
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}
function failureCode(error: unknown): string | undefined {
  return error !== null && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : undefined;
}
const sourceNotReadyCodes = new Set(["INVALID_DOCUMENT", "DOC_CHANGED", "UI_NOT_READY", "RESOURCE_NOT_FOUND"]);

/** 会话持有的输入草稿与保存回执。控件卸载不销毁，未知回执只重试冻结的同一请求。 */
export class UiInputSession {
  state = createStateStore();
  private spec: Spec = { root: "", elements: {} };
  private paths: string[] = [];
  private transport?: UiStateTransport;
  private loaded = false;
  private busy = false;
  private muted = false;
  private closed = false;
  private readOnly = false;
  private initialized = false;
  private sourceReady = false;
  private restoreStarted = false;
  private restoreAfterReady = false;
  private finalValues?: Record<string, unknown>;
  private revision = 0;
  private confirmed: Record<string, unknown> = {};
  private observed: Record<string, unknown> = {};
  private pending?: UiSaveRequest;
  private timer?: ReturnType<typeof setTimeout>;
  private unlisten: () => void;
  private listeners = new Set<() => void>();
  private snapshot: UiInputSnapshot = { status: "local", version: 0 };

  constructor(readonly id: string, private readonly catalogVersion?: string) { this.unlisten = this.state.subscribe(() => this.changed()); }

  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = (): UiInputSnapshot => this.snapshot;

  /** 只读切换前的既有草稿仍可重试保存；不会接纳只读后的新编辑。 */
  get hasFinalDraft(): boolean { return this.finalValues !== undefined; }

  /** 只在首次挂载前播种；后续补片仍由 configure 更新，避免渲染期间通知已挂载控件。 */
  initialize(spec: Spec): void {
    if (this.initialized || this.closed) return;
    this.initialized = true;
    this.muted = true;
    this.state.seed(spec.state ?? {});
    this.muted = false;
  }

  configure(spec: Spec, transport?: UiStateTransport, readOnly = false, streaming = false, sourceReady = !streaming): void {
    if (this.closed) return;
    this.initialize(spec);
    if (readOnly && !this.readOnly) {
      const values = this.values();
      if (!equal(values, this.confirmed)) this.finalValues = structuredClone(values);
    } else if (!readOnly) this.finalValues = undefined;
    if (!this.sourceReady && sourceReady && this.busy && !this.loaded) this.restoreAfterReady = true;
    this.sourceReady = sourceReady;
    const next = this.spec !== spec;
    this.spec = spec;
    this.paths = writableUiPaths(spec);
    this.muted = true;
    this.state.seed(spec.state ?? {});
    this.muted = false;
    this.observed = this.values();
    this.transport = transport;
    this.readOnly = readOnly;
    if (transport && spec.root && !this.loaded && !this.busy && (!this.restoreStarted || sourceReady && sourceNotReadyCodes.has(this.snapshot.code ?? ""))) void this.restore();
    else if (next && this.loaded && this.snapshot.status === "dirty" && !this.timer) this.schedule();
  }

  /** 只返回声明为输入的用户写入；默认值及 watch 派生值不作为保存事实。 */
  values(): Record<string, unknown> {
    const writes = this.state.writes();
    return Object.fromEntries(this.paths.filter(path => writes.some(([written]) => written === path))
      .map(path => [path, structuredClone(this.state.get(path))]).filter(([, value]) => value !== undefined));
  }

  /** 冲突解决由用户触发；keepLocal 保留当前草稿并以重读版本进行新一次 CAS。 */
  async restore(keepLocal = true): Promise<void> {
    if (!this.transport || this.busy || this.closed) return;
    this.cancelTimer();
    this.busy = true;
    this.restoreStarted = true;
    this.publish("loading");
    try {
      const result = await this.transport.load(this.id);
      if (this.closed) return;
      const local = keepLocal ? this.finalValues ?? this.values() : {};
      if (!keepLocal) this.finalValues = undefined;
      else if (this.finalValues) this.finalValues = { ...result.values, ...this.finalValues };
      this.revision = result.state_revision;
      this.confirmed = structuredClone(result.values);
      this.pending = undefined;
      this.loaded = true;
      this.unlisten();
      this.state = createStateStore(this.spec.state, { writes: Object.entries({ ...result.values, ...local })
        .map(([path, value]) => [path, value, "replace"] as const) });
      this.unlisten = this.state.subscribe(() => this.changed());
      this.observed = this.values();
      this.publish(equal(this.observed, this.confirmed) ? "saved" : "dirty");
    } catch (error) {
      if (this.closed) return;
      const code = failureCode(error);
      this.publish(code === "STATE_CONFLICT" ? "conflict" : "unavailable", code);
    } finally {
      this.busy = false;
      if (this.restoreAfterReady) {
        this.restoreAfterReady = false;
        if (!this.loaded && sourceNotReadyCodes.has(this.snapshot.code ?? "")) void this.restore();
      }
      if (this.snapshot.status === "dirty") this.schedule();
    }
  }

  /** 未知保存结果保留原 operation/body；不会把后续编辑拼进重试。 */
  async save(): Promise<void> {
    if (!this.transport || !this.loaded || this.busy || this.closed || this.readOnly && !this.finalValues || this.snapshot.status === "conflict") return;
    this.cancelTimer();
    if (!["dirty", "unknown"].includes(this.snapshot.status)) return;
    this.busy = true;
    this.publish("saving");
    try {
      if (!this.pending) {
        const values = this.finalValues ?? this.values();
        const spec = this.spec;
        this.pending = { document_revision: await uiDocumentRevision(spec, this.catalogVersion), expected_revision: this.revision,
          operation_id: crypto.randomUUID(), values };
      }
      if (this.closed) return;
      const result = await this.transport.save(this.id, structuredClone(this.pending));
      if (this.closed) return;
      this.revision = result.state_revision;
      this.confirmed = structuredClone(result.values);
      this.pending = undefined;
      const saved = equal(this.finalValues ?? this.values(), this.confirmed);
      if (saved) this.finalValues = undefined;
      this.publish(saved ? "saved" : "dirty");
    } catch (error) {
      if (this.closed) return;
      const code = failureCode(error);
      if (code === "DOC_CHANGED") {
        this.pending = undefined;
        this.publish("dirty", code);
      } else if (code === "REVISION_CONFLICT" || code === "STATE_CONFLICT" || code === "OPERATION_CONFLICT") {
        this.pending = undefined;
        this.publish("conflict", code);
      } else if (code && !["STATE_UNAVAILABLE", "NETWORK_ERROR"].includes(code)) {
        this.pending = undefined;
        this.publish("unavailable", code);
      } else this.publish("unknown");
    } finally {
      this.busy = false;
      // DOC_CHANGED 等待后续文档补片或用户重试，避免和生成速度竞争形成请求循环。
      if (this.snapshot.status === "dirty" && !this.snapshot.code) this.schedule();
    }
  }

  close(): void {
    this.closed = true;
    this.cancelTimer();
    this.unlisten();
    this.listeners.clear();
  }

  private changed(): void {
    if (this.muted || this.closed || this.readOnly) return;
    const values = this.values();
    if (equal(values, this.observed)) return;
    this.observed = values;
    if (["conflict", "unknown", "unavailable"].includes(this.snapshot.status)) return;
    this.publish(this.transport ? "dirty" : "local");
    this.schedule();
  }

  private schedule(): void {
    this.cancelTimer();
    if (!this.transport || !this.loaded || this.closed || this.readOnly && !this.finalValues) return;
    this.timer = setTimeout(() => { this.timer = undefined; if (this.snapshot.status === "dirty") void this.save(); }, 400);
  }

  private cancelTimer(): void { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }

  private publish(status: UiSaveStatus, code?: string): void {
    this.snapshot = { status, code, version: this.snapshot.version + 1 };
    this.listeners.forEach(listener => listener());
  }
}

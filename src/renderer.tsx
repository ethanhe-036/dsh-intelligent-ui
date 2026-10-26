import { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { SpecRenderer, type SpecComponentProps, type SpecComponents } from "generative-frame/spec/react";
import { components } from "./catalog.js";
// 复用生成后的公开目录，避免每个渲染节点再次执行原生 Schema 转换。
import { catalog as defaultCatalog, UiArgumentStream, uiDocumentRevision, type UiDocument, type Catalog } from "./core.js";
import { UiInputSession, type UiStateTransport } from "./input-session.js";
import { uiControlInput, writableUiPaths } from "./state.js";
import { UiDomContext, UiEditContext, type UiPendingEdit } from "./edit-context.js";

export type { UiStateTransport, UiInputSnapshot } from "./input-session.js";
export type { UiSaveRequest, UiStateSnapshot } from "./state.js";
export type { SpecComponentProps, SpecComponents } from "generative-frame/spec/react";

const hostContext = createContext<{ uiId: string; ready: boolean; readOnly: boolean } | undefined>(undefined);

/** 可信宿主组件共享当前实例和最终就绪边界；业务权限仍由宿主 Owner 复核。 */
export function useIntelligentUiContext() {
  const context = useContext(hostContext);
  if (!context) throw new Error("INTELLIGENT_UI_CONTEXT_REQUIRED");
  return context;
}

export interface UiAnalyzeRequest {
  uiId: string;
  prompt: string;
  values: Record<string, unknown>;
  documentRevision: number;
  operationId: string;
}
export interface UiEntry {
  parser: UiArgumentStream;
  input: UiInputSession;
  action?: { status: "sending" | "sent" | "unknown" | "rejected"; request: UiAnalyzeRequest };
}

/** 状态由会话宿主持有，虚拟行卸载或流式 seed 不丢弃用户编辑。 */
export class UiSessionStore {
  private entries = new Map<string, UiEntry>();
  get(id: string, catalog: Catalog = defaultCatalog, catalogVersion?: string): UiEntry {
    let entry = this.entries.get(id);
    if (!entry) { entry = { parser: new UiArgumentStream(catalog), input: new UiInputSession(id, catalogVersion) }; this.entries.set(id, entry); }
    return entry;
  }
  clear(): void { this.entries.forEach(entry => entry.input.close()); this.entries.clear(); }
}

const renderContext = createContext<{ entry: UiEntry; ready: boolean; readOnly: boolean; domScope: string } | undefined>(undefined);
const controlNames = new Set(["Input", "NumberInput", "Slider", "Select", "Checkbox", "DatePicker", "RadioGroup", "CheckboxGroup"]);

// 组件类型在模块加载时固定；就绪、回执及只读变化只更新 Context，避免丢失焦点和局部状态。
const stableComponents: SpecComponents = Object.fromEntries(Object.entries(components).map(([name, Component]) => [name,
  controlNames.has(name) ? function ControlledInput(props: SpecComponentProps) {
    const { entry, readOnly } = useContext(renderContext)!;
    const input = uiControlInput(props.element);
    const edited = input && entry.input.state.writes().some(([path]) => path === input.path);
    const resolved = edited ? { ...props.props, [input.prop]: props.state.get(input.path) } : props.props;
    return <fieldset className="intelligent-ui-fields" disabled={readOnly}><Component {...props} props={resolved} /></fieldset>;
  } : name === "Table" ? function ScrollableTable(props: SpecComponentProps) {
    return <div className="iui-table-scroll" tabIndex={0} role="region" aria-label="Table"><Component {...props} /></div>;
  } : Component]));

function ActionButton(props: SpecComponentProps) {
  const { entry, ready, readOnly } = useContext(renderContext)!;
  const actions = props.element.on?.press;
  const analyze = (Array.isArray(actions) ? actions : actions ? [actions] : []).some(action => action.action === "analyze");
  const Button = components.Button;
  return <fieldset className="intelligent-ui-action" data-block={props.props.block || undefined}
    disabled={readOnly || analyze && (!ready || entry.action?.status === "sending" || entry.action?.status === "unknown")}
    onClickCapture={event => { if (analyze && event.detail > 1) { event.preventDefault(); event.stopPropagation(); } }}><Button {...props} /></fieldset>;
}

const incompleteEdit = { en: "Finish editing the highlighted number before sending it.", "zh-CN": "请完成标记的数字输入后再发送。", "zh-TW": "請完成標記的數字輸入後再傳送。", id: "Selesaikan angka yang ditandai sebelum mengirimnya." };

const messages = {
  en: { incomplete: "This interface is incomplete. Regenerate it using the tool feedback.", local: "", loading: "Loading saved inputs…", saved: "Saved", dirty: "Unsaved changes", saving: "Saving…", unknown: "Save receipt unknown. Retry keeps the original request.", conflict: "Inputs changed elsewhere. Your draft is retained.", unavailable: "Inputs could not be saved. Your draft is retained.", retry: "Retry save", keep: "Save my draft", reload: "Use saved inputs", sending: "Sending…", sent: "Sent", sendUnknown: "Send receipt unknown. Check the original request.", check: "Check send" },
  "zh-CN": { incomplete: "界面生成未完成，请根据工具校验结果重新生成。", local: "", loading: "正在恢复输入…", saved: "已保存", dirty: "有未保存修改", saving: "正在保存…", unknown: "保存回执未知，重试将沿用原请求。", conflict: "输入已在其他页面修改，本地草稿已保留。", unavailable: "输入暂时无法保存，本地草稿已保留。", retry: "重试保存", keep: "保存本地草稿", reload: "使用已保存输入", sending: "正在发送…", sent: "已发送", sendUnknown: "发送回执未知，请核对原请求。", check: "核对发送结果" },
  "zh-TW": { incomplete: "介面生成未完成，請根據工具檢查結果重新生成。", local: "", loading: "正在恢復輸入…", saved: "已儲存", dirty: "有未儲存修改", saving: "正在儲存…", unknown: "儲存回執未知，重試將沿用原請求。", conflict: "輸入已在其他頁面修改，本機草稿已保留。", unavailable: "輸入暫時無法儲存，本機草稿已保留。", retry: "重試儲存", keep: "儲存本機草稿", reload: "使用已儲存輸入", sending: "正在傳送…", sent: "已傳送", sendUnknown: "傳送回執未知，請核對原請求。", check: "核對傳送結果" },
  id: { incomplete: "Antarmuka belum lengkap. Buat ulang menggunakan umpan balik alat.", local: "", loading: "Memulihkan input…", saved: "Tersimpan", dirty: "Perubahan belum disimpan", saving: "Menyimpan…", unknown: "Hasil penyimpanan belum diketahui. Percobaan ulang memakai permintaan semula.", conflict: "Input berubah di halaman lain. Draf Anda dipertahankan.", unavailable: "Input belum dapat disimpan. Draf Anda dipertahankan.", retry: "Coba simpan lagi", keep: "Simpan draf saya", reload: "Gunakan input tersimpan", sending: "Mengirim…", sent: "Terkirim", sendUnknown: "Hasil pengiriman belum diketahui. Periksa permintaan semula.", check: "Periksa pengiriman" },
};

export interface IntelligentUiProps {
  id: string;
  argsRaw?: string;
  document?: UiDocument;
  streaming: boolean;
  /** 宿主的持久来源是否就绪；未提供时以流结束为准，不替代服务端校验。 */
  sourceReady?: boolean;
  store: UiSessionStore;
  transport?: UiStateTransport;
  onAnalyze?: (request: UiAnalyzeRequest) => Promise<unknown>;
  locale?: keyof typeof messages;
  readOnly?: boolean;
  catalog?: Catalog;
  catalogVersion?: string;
  components?: SpecComponents;
  theme?: "light" | "dark";
}

/** 受控组件只在明确 Button press 后冻结选定状态；watch/change 不发送模型或业务请求。 */
export function IntelligentUi({ id, argsRaw = "", document, streaming, sourceReady = !streaming, store, transport, onAnalyze, locale = "en", readOnly = false, catalog = defaultCatalog, catalogVersion, components: hostComponents, theme }: IntelligentUiProps) {
  const entry = store.get(id, catalog, catalogVersion);
  const domScope = useId();
  const pendingEdits = useRef(new Map<string, UiPendingEdit>());
  const [pendingCount, setPendingCount] = useState(0);
  const setPending = useCallback((key: string, pending?: UiPendingEdit) => {
    if (pending) pendingEdits.current.set(key, pending); else pendingEdits.current.delete(key);
    setPendingCount(pendingEdits.current.size);
  }, []);
  const edits = useMemo(() => ({ locale, setPending }), [locale, setPending]);
  const [, actionChanged] = useState(0);
  const saved = useSyncExternalStore(entry.input.subscribe, entry.input.getSnapshot, entry.input.getSnapshot);
  const preview = useMemo(() => document ? { title: document.title, spec: document.spec, valid: true, complete: true } : entry.parser.push(argsRaw), [argsRaw, document, entry]);
  entry.input.initialize(preview.spec);
  const hasWritableInputs = useMemo(() => writableUiPaths(preview.spec).length > 0, [preview.spec]);
  useLayoutEffect(() => entry.input.configure(preview.spec, transport, readOnly, streaming, sourceReady), [entry, preview.spec, transport, readOnly, streaming, sourceReady]);
  const words = messages[locale];
  const rejected = (error: unknown) => error !== null && typeof error === "object" && "code" in error &&
    ["DOC_CHANGED", "SEND_REJECTED", "UI_NOT_READY", "UI_NOT_FOUND", "INVALID_REQUEST", "OPERATION_CONFLICT", "PERMISSION_DENIED", "FORBIDDEN"].includes(String(error.code));
  const ready = !streaming && preview.complete && preview.valid;
  const canRetryDraft = !readOnly || entry.input.hasFinalDraft;
  const renderComponents = useMemo(() => ({ ...stableComponents, ...hostComponents, Button: ActionButton }), [hostComponents]);
  const send = async (request: UiAnalyzeRequest) => {
    if (!onAnalyze || readOnly || entry.action?.status === "sending") return;
    entry.action = { status: "sending", request };
    actionChanged(value => value + 1);
    try {
      await onAnalyze(structuredClone(request));
      entry.action.status = "sent";
    } catch (error) { entry.action.status = rejected(error) ? "rejected" : "unknown"; }
    actionChanged(value => value + 1);
  };
  if (!preview.spec.root || !catalog.component(preview.spec.elements[preview.spec.root]?.type)) return null;
  return <section className="intelligent-ui" data-intelligent-ui={id} data-streaming={streaming} data-iui-theme={theme} aria-label={preview.title || "Intelligent UI"}>
    {preview.title && <h3 className="intelligent-ui-title">{preview.title}</h3>}
    {!streaming && (!preview.valid || !preview.complete) && <p role="status">{words.incomplete}</p>}
    <div className="intelligent-ui-fields">
      <hostContext.Provider value={{ uiId: id, ready, readOnly }}>
      <renderContext.Provider value={{ entry, ready, readOnly, domScope }}>
      <UiDomContext.Provider value={domScope}>
      <UiEditContext.Provider value={edits}>
      <SpecRenderer spec={preview.spec} catalog={catalog} components={renderComponents} state={entry.input.state} streaming={streaming}
        placeholder={() => null}
        onAction={async (action, params, source) => {
          const element = source.elementId ? preview.spec.elements[source.elementId] : undefined;
          if (action !== "analyze" || source.kind !== "event" || source.trigger !== "press" || element?.type !== "Button" || !onAnalyze || readOnly || !ready) return;
          if (typeof params.prompt !== "string" || !Array.isArray(params.paths) || !params.paths.every(path => typeof path === "string")) return;
          if (entry.action?.status === "sending" || entry.action?.status === "unknown") return;
          const unfinished = [...pendingEdits.current.values()].find(edit => edit.paths.some(path =>
            (params.paths as string[]).some(selected => path === selected || path.startsWith(selected + "/") || selected.startsWith(path + "/"))));
          if (unfinished) { unfinished.focus(); return; }
          const values = Object.fromEntries(params.paths.map(path => [path, structuredClone(entry.input.state.get(path))]));
          // 在第一次 await 前冻结点击值并占位，快速双击也只产生一次请求。
          const request = { uiId: id, prompt: params.prompt, values, documentRevision: 0, operationId: crypto.randomUUID() };
          entry.action = { status: "sending", request };
          actionChanged(value => value + 1);
          try {
            request.documentRevision = await uiDocumentRevision(preview.spec, catalogVersion);
            await onAnalyze(structuredClone(request));
            entry.action.status = "sent";
          } catch (error) { entry.action.status = rejected(error) ? "rejected" : "unknown"; }
          actionChanged(value => value + 1);
        }} />
      </UiEditContext.Provider>
      </UiDomContext.Provider>
      </renderContext.Provider>
      </hostContext.Provider>
    </div>
    {transport && hasWritableInputs && <div className="intelligent-ui-status" role="status" aria-live="polite">
      <span>{pendingCount && ["saved", "saving", "local"].includes(saved.status) ? incompleteEdit[locale] : words[saved.status]}</span>
      {canRetryDraft && ["unknown", "dirty"].includes(saved.status) && <button className="iui-status-button" type="button" onClick={() => void entry.input.save()}>{words.retry}</button>}
      {canRetryDraft && saved.status === "unavailable" && <button className="iui-status-button" type="button" onClick={() => void entry.input.restore()}>{words.retry}</button>}
      {canRetryDraft && saved.status === "conflict" && <>
        <button className="iui-status-button" type="button" onClick={() => void entry.input.restore(true)}>{words.keep}</button>
        <button className="iui-status-button" type="button" onClick={() => void entry.input.restore(false)}>{words.reload}</button>
      </>}
    </div>}
    {entry.action && <div className="iui-send-status" role="status" aria-live="polite">
      {entry.action.status === "unknown" ? words.sendUnknown : entry.action.status === "rejected" ? words.unavailable : words[entry.action.status]}
      {entry.action.status === "unknown" && !readOnly && <button className="iui-status-button" type="button" onClick={() => void send(entry.action!.request)}>{words.check}</button>}
    </div>}
  </section>;
}

import { defineDomain, domainTable, type Domain, type DomainFacility, type TableValueOf } from "@deepseek-ai/dsh-storage-domain";
import { z } from "zod";
import type { Spec } from "generative-frame/spec";
import {
  freezeUiSaveRequest, UiStateError, uiRequestFingerprint, validateUiValues,
  type UiSaveRequest, type UiStateSnapshot,
} from "./state.js";

/** 宿主每次从持久工具来源核验会话、UI 和修订；删除或失权必须拒绝 Promise。 */
export type UiStateAuthority = (sessionId: string, uiId: string) => Promise<{
  document_revision: number;
  spec: Spec;
}>;

const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const stateDomain = defineDomain({
  name: "intelligent_ui_inputs",
  version: 1,
  tables: {
    inputs: domainTable(z.object({
      document_revision: revision,
      state_revision: revision,
      values: z.record(z.string(), z.json()),
      last_operation_id: z.string().min(1),
      last_request: z.string(),
    }).strict()),
  },
});
type StateDomain = Domain<typeof stateDomain>;
type StoredState = TableValueOf<typeof stateDomain, "inputs">;

/**
 * 单用户、单进程原生宿主的输入 sidecar。一个宿主只装配一个实例；
 * authority 不由本地状态代替。调用方在 Cordis disposer 中等待 close。
 */
export class NativeUiStateStore {
  private opening?: Promise<StateDomain>;
  private tail: Promise<unknown> = Promise.resolve();
  private closing?: Promise<void>;

  constructor(
    private readonly storageDomain: Pick<DomainFacility, "open">,
    private readonly authority: UiStateAuthority,
  ) {}

  /** 原生 open 检查版本和记录 schema；失败原样交给宿主，不重建或降级介质。 */
  async open(): Promise<void> {
    if (this.closing) throw new UiStateError("STORE_CLOSED", "/state");
    await this.ensureOpen();
  }

  /** 用当前 spec 复核并恢复同一 UI 的输入；不兼容显式报冲突，不清空记录或回退 seed。 */
  async load(sessionId: string, uiId: string): Promise<UiStateSnapshot> {
    await this.authority(sessionId, uiId);
    return this.enqueue(async () => {
      const domain = await this.ensureOpen();
      const source = await this.authority(sessionId, uiId);
      const stored = domain.table("inputs").get(this.key(sessionId, uiId));
      return this.snapshot(source, stored);
    });
  }

  async save(sessionId: string, uiId: string, request: UiSaveRequest): Promise<UiStateSnapshot> {
    const authorized = this.authority(sessionId, uiId);
    let frozen: UiSaveRequest;
    try { frozen = freezeUiSaveRequest(request); }
    catch (error) { await authorized; throw error; }
    await authorized;
    return this.enqueue(async () => {
      const domain = await this.ensureOpen();
      // 异步核验排在本实例队列内，排队期间删除/失权的保存不能创建记录。
      const source = await this.authority(sessionId, uiId);
      const table = domain.table("inputs");
      const key = this.key(sessionId, uiId);
      const fingerprint = uiRequestFingerprint(frozen);
      const next = (stored?: StoredState): StoredState => {
        const current = { document_revision: source.document_revision, state_revision: stored?.state_revision ?? 0 };
        if (frozen.document_revision !== source.document_revision) {
          throw new UiStateError("DOC_CHANGED", "/document_revision", current);
        }
        if (stored?.last_operation_id === frozen.operation_id) {
          if (stored.last_request !== fingerprint) throw new UiStateError("OPERATION_CONFLICT", "/operation_id", current);
          return stored;
        }
        if (frozen.expected_revision !== current.state_revision) {
          throw new UiStateError("REVISION_CONFLICT", "/expected_revision", current);
        }
        if (current.state_revision === Number.MAX_SAFE_INTEGER) throw new UiStateError("REVISION_CONFLICT", "/expected_revision", current);
        const values = validateUiValues(source.spec, frozen.values) as StoredState["values"];
        return { ...current, state_revision: current.state_revision + 1, values,
          last_operation_id: frozen.operation_id, last_request: fingerprint };
      };
      const current = table.get(key);
      const candidate = next(current);
      // 重试已有回执不触发第二次持久写入。只有最后操作保留回执，旧操作受 CAS 拒绝。
      if (candidate === current) return this.snapshot(source, current);
      if (current) {
        const saved = await table.update(key, next);
        return this.snapshot(source, saved);
      }
      // 原生 update 要求已有 key；首次 put 由独占 domain 的本实例队列保护。
      await table.put(key, candidate);
      return this.snapshot(source, candidate);
    });
  }

  /** 停止接收新操作，排空已进入的操作，再释放原生 domain。 */
  close(): Promise<void> {
    return this.closing ??= this.tail.then(async () => {
      if (this.opening) await (await this.opening).close();
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    if (this.closing) return Promise.reject(new UiStateError("STORE_CLOSED", "/state"));
    const result = this.tail.then(operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private ensureOpen(): Promise<StateDomain> {
    return this.opening ??= this.storageDomain.open(stateDomain);
  }

  private key(sessionId: string, uiId: string): string {
    // 单段 KV key，无分隔符碰撞；不把 session/uiId 当成账号授权。
    return JSON.stringify([sessionId, uiId]);
  }

  private snapshot(source: Awaited<ReturnType<UiStateAuthority>>, stored?: StoredState): UiStateSnapshot {
    const current = { document_revision: source.document_revision, state_revision: stored?.state_revision ?? 0 };
    if (!stored) return { ...current, values: {} };
    try {
      // spec 补片只改变来源修订；兼容输入跨修订恢复，load 不迁移、不改写原记录。
      return { ...current, values: validateUiValues(source.spec, stored.values) };
    } catch (error) {
      if (!(error instanceof UiStateError)) throw error;
      throw new UiStateError("STATE_CONFLICT", "/values/*", current);
    }
  }
}

import { type DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import type { Spec } from "generative-frame/spec";
import { type UiSaveRequest, type UiStateSnapshot } from "./state.js";
/** 宿主每次从持久工具来源核验会话、UI 和修订；删除或失权必须拒绝 Promise。 */
export type UiStateAuthority = (sessionId: string, uiId: string) => Promise<{
    document_revision: number;
    spec: Spec;
}>;
/**
 * 单用户、单进程原生宿主的输入 sidecar。一个宿主只装配一个实例；
 * authority 不由本地状态代替。调用方在 Cordis disposer 中等待 close。
 */
export declare class NativeUiStateStore {
    private readonly storageDomain;
    private readonly authority;
    private opening?;
    private tail;
    private closing?;
    constructor(storageDomain: Pick<DomainFacility, "open">, authority: UiStateAuthority);
    /** 原生 open 检查版本和记录 schema；失败原样交给宿主，不重建或降级介质。 */
    open(): Promise<void>;
    /** 用当前 spec 复核并恢复同一 UI 的输入；不兼容显式报冲突，不清空记录或回退 seed。 */
    load(sessionId: string, uiId: string): Promise<UiStateSnapshot>;
    save(sessionId: string, uiId: string, request: UiSaveRequest): Promise<UiStateSnapshot>;
    /** 停止接收新操作，排空已进入的操作，再释放原生 domain。 */
    close(): Promise<void>;
    private enqueue;
    private ensureOpen;
    private key;
    private snapshot;
}

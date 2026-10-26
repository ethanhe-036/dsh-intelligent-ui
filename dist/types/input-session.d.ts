import { type Spec } from "./core.js";
import { type UiSaveRequest, type UiStateSnapshot } from "./state.js";
export interface UiStateTransport {
    load(id: string): Promise<UiStateSnapshot>;
    save(id: string, request: UiSaveRequest): Promise<UiStateSnapshot>;
}
export type UiSaveStatus = "local" | "loading" | "saved" | "dirty" | "saving" | "unknown" | "conflict" | "unavailable";
export interface UiInputSnapshot {
    status: UiSaveStatus;
    code?: string;
    version: number;
}
/** 会话持有的输入草稿与保存回执。控件卸载不销毁，未知回执只重试冻结的同一请求。 */
export declare class UiInputSession {
    readonly id: string;
    private readonly catalogVersion?;
    state: import("generative-frame/spec").SpecStateStore & {
        writes(): readonly import("generative-frame/spec").SpecStateWrite[];
    };
    private spec;
    private paths;
    private transport?;
    private loaded;
    private busy;
    private muted;
    private closed;
    private readOnly;
    private initialized;
    private sourceReady;
    private restoreStarted;
    private restoreAfterReady;
    private finalValues?;
    private revision;
    private confirmed;
    private observed;
    private pending?;
    private timer?;
    private unlisten;
    private listeners;
    private snapshot;
    constructor(id: string, catalogVersion?: string | undefined);
    subscribe: (listener: () => void) => (() => void);
    getSnapshot: () => UiInputSnapshot;
    /** 只读切换前的既有草稿仍可重试保存；不会接纳只读后的新编辑。 */
    get hasFinalDraft(): boolean;
    /** 只在首次挂载前播种；后续补片仍由 configure 更新，避免渲染期间通知已挂载控件。 */
    initialize(spec: Spec): void;
    configure(spec: Spec, transport?: UiStateTransport, readOnly?: boolean, streaming?: boolean, sourceReady?: boolean): void;
    /** 只返回声明为输入的用户写入；默认值及 watch 派生值不作为保存事实。 */
    values(): Record<string, unknown>;
    /** 冲突解决由用户触发；keepLocal 保留当前草稿并以重读版本进行新一次 CAS。 */
    restore(keepLocal?: boolean): Promise<void>;
    /** 未知保存结果保留原 operation/body；不会把后续编辑拼进重试。 */
    save(): Promise<void>;
    close(): void;
    private changed;
    private schedule;
    private cancelTimer;
    private publish;
}

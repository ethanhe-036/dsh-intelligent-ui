import { type DomainFacility } from "@deepseek-ai/dsh-storage-domain";
import type { SessionController } from "@deepseek-ai/dsh-api-session-controller";
import type { NativeUiSource } from "./native-source.js";
/** 冻结一次点击的内容；原生 requestId 去重之外，收据拒绝同键换值并核对未知接纳。 */
export declare class NativeUiSender {
    private readonly facility;
    private readonly api;
    private readonly source;
    private domain?;
    private tail;
    private closed;
    constructor(facility: Pick<DomainFacility, "open">, api: Pick<SessionController, "prompt">, source: NativeUiSource);
    open(): Promise<void>;
    send(sessionId: string, input: unknown, signal?: AbortSignal): Promise<{
        ok: boolean;
        code?: string;
    }>;
    close(): Promise<void>;
}

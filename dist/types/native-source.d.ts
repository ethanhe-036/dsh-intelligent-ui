import { type Session, type SessionEvent, type SessionStore } from "@deepseek-ai/dsh-session";
import type { SessionController } from "@deepseek-ai/dsh-api-session-controller";
import type { AssistantStreamFrame } from "@deepseek-ai/dsh-agent";
import { type StreamChunk } from "@deepseek-ai/dsh-llm";
/** 索引官方耐久工具参数及当前瞬时流；文档身份只取真实 step、retry 和 call。 */
export declare class NativeUiIndex {
    private readonly sessionId;
    private attempt;
    private blocks;
    private documents;
    private admissions;
    private lastSeq;
    constructor(sessionId: string);
    /** 消费一次耐久事件；新版嵌入流用官方解码器还原，不创建另一份会话历史。 */
    accept(event: SessionEvent): void;
    /** 当前原生 stream 的有效参数可用于生成中编辑；重试与冷恢复仍以耐久事件为准。 */
    acceptChunk(turn: number, stepNumber: number, chunk: StreamChunk): void;
    /** 放弃或重试的调用不能再作为保存依据。 */
    discard(turn: number, stepNumber: number): void;
    private publish;
    has(uiId: string): boolean;
    resolve(uiId: string): Promise<{
        document_revision: number;
        spec: import("./core.js").Spec;
        complete: boolean;
    }>;
    hasAdmission(operationId: string): boolean;
}
/** 热流消费公开 Agent stream，冷读使用 Session Controller；缓存不替代当前会话存在性。 */
export declare class NativeUiSource {
    private readonly sessions;
    private readonly controller;
    private live;
    private streams;
    private cold;
    constructor(sessions: Pick<SessionStore, "get">, controller: Pick<SessionController, "inspect">);
    accept(session: Session, event: SessionEvent): void;
    acceptStream(session: Session, frame: AssistantStreamFrame): void;
    resolve(sessionId: string, uiId: string): Promise<{
        document_revision: number;
        spec: import("./core.js").Spec;
        complete: boolean;
    }>;
    hasAdmission(sessionId: string, operationId: string): Promise<boolean>;
    private index;
}

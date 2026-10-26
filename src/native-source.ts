import { isAppendSurfaceEvent, type Session, type SessionEvent, type SessionId, type SessionStore } from "@deepseek-ai/dsh-session";
import type { SessionController } from "@deepseek-ai/dsh-api-session-controller";
import type { AssistantStreamFrame } from "@deepseek-ai/dsh-agent";
import { expandAssistantStream, type StreamChunk } from "@deepseek-ai/dsh-llm";
import { UiArgumentStream, toolName, uiDocumentRevision } from "./core.js";

interface Call { id: string; name: string; raw: string; parser: UiArgumentStream }

/** 索引官方耐久工具参数及当前瞬时流；文档身份只取真实 step、retry 和 call。 */
export class NativeUiIndex {
  private attempt = new Map<string, number>();
  private blocks = new Map<string, Map<number, Call>>();
  private documents = new Map<string, Call>();
  private admissions = new Set<string>();
  private lastSeq = -1;

  constructor(private readonly sessionId: string) {}

  /** 消费一次耐久事件；新版嵌入流用官方解码器还原，不创建另一份会话历史。 */
  accept(event: SessionEvent): void {
    if (event.seq <= this.lastSeq) return;
    this.lastSeq = event.seq;
    const messages = event.type === "user/message" ? [event.data] :
      event.type === "agent/inbox/spliced" ? event.data.inserted : [];
    for (const message of messages) {
      if (message.source && "rpcId" in message.source && typeof message.source.rpcId === "string") this.admissions.add(message.source.rpcId);
    }
    if (event.type === "step/start" || event.type === "llm/retry") {
      const step = event.data.turn + ":" + event.data.step;
      this.discard(event.data.turn, event.data.step);
      this.attempt.set(step, event.seq);
      this.blocks.set(step, new Map());
      return;
    }
    if (event.type === "assistant/message" || event.type === "assistant/attempt") {
      if (event.type === "assistant/message" && !isAppendSurfaceEvent(event)) return;
      const step = event.data.turn + ":" + event.data.step;
      // 耐久 settlement 原样替换瞬时累计，避免同一片段拼接两遍。
      this.discard(event.data.turn, event.data.step);
      this.blocks.set(step, new Map());
      for (const { chunk } of expandAssistantStream(event.data.stream)) this.acceptChunk(event.data.turn, event.data.step, chunk);
      if (event.type === "assistant/message") {
        for (const [index, block] of event.data.message.content.entries()) {
          if (block.type === "tool-call") this.publish(step, index, block.id, block.name, block.arguments, false);
        }
      }
      return;
    }
    if (event.type === "tool/call") {
      const step = event.data.turn + ":" + event.data.step;
      const call = this.documents.get(this.sessionId + ":" + step + ":" + this.attempt.get(step) + ":" + event.data.callId);
      if (call && event.data.name === toolName) call.raw = event.data.arguments;
    }
  }

  /** 当前原生 stream 的有效参数可用于生成中编辑；重试与冷恢复仍以耐久事件为准。 */
  acceptChunk(turn: number, stepNumber: number, chunk: StreamChunk): void {
    const step = turn + ":" + stepNumber;
    if (chunk.type === "tool-call-delta") this.publish(step, chunk.index, chunk.id, chunk.name, chunk.argumentsDelta, true);
    if (chunk.type === "block-end" && chunk.block.type === "tool-call") this.publish(step, chunk.index, chunk.block.id, chunk.block.name, chunk.block.arguments, false);
  }

  /** 放弃或重试的调用不能再作为保存依据。 */
  discard(turn: number, stepNumber: number): void {
    const step = turn + ":" + stepNumber;
    for (const call of this.blocks.get(step)?.values() ?? []) this.documents.delete(call.id);
    this.blocks.delete(step);
  }

  private publish(step: string, index: number, callId: string, name: string | undefined, raw: string, delta: boolean): void {
    const attempt = this.attempt.get(step);
    if (attempt === undefined) return;
    const blocks = this.blocks.get(step) ?? new Map<number, Call>();
    this.blocks.set(step, blocks);
    const id = this.sessionId + ":" + step + ":" + attempt + ":" + callId;
    let call = blocks.get(index);
    if (!call || call.id !== id) { call = { id, name: name ?? "", raw: "", parser: new UiArgumentStream() }; blocks.set(index, call); }
    call.name = name ?? call.name;
    call.raw = delta ? call.raw + raw : raw;
    if (call.name === toolName) this.documents.set(id, call);
  }

  has(uiId: string): boolean { return this.documents.has(uiId); }

  async resolve(uiId: string) {
    const call = this.documents.get(uiId);
    if (!call) throw new Error("UI_NOT_FOUND");
    const preview = call.parser.push(call.raw);
    if (!preview.valid || !preview.spec.root) throw new Error("UI_NOT_READY");
    return { document_revision: await uiDocumentRevision(preview.spec), spec: preview.spec, complete: preview.complete };
  }

  hasAdmission(operationId: string): boolean { return this.admissions.has(operationId); }
}

/** 热流消费公开 Agent stream，冷读使用 Session Controller；缓存不替代当前会话存在性。 */
export class NativeUiSource {
  private live = new WeakMap<Session, NativeUiIndex>();
  private streams = new WeakMap<Session, Map<string, { turn: number; step: number }>>();
  private cold = new WeakMap<readonly SessionEvent[], Map<string, NativeUiIndex>>();

  constructor(private readonly sessions: Pick<SessionStore, "get">,
    private readonly controller: Pick<SessionController, "inspect">) {}

  accept(session: Session, event: SessionEvent): void {
    let index = this.live.get(session);
    if (!index) { index = new NativeUiIndex(session.id); this.live.set(session, index); }
    index.accept(event);
  }

  acceptStream(session: Session, frame: AssistantStreamFrame): void {
    const streams = this.streams.get(session) ?? new Map<string, { turn: number; step: number }>();
    this.streams.set(session, streams);
    if (frame.type === "start") { streams.set(frame.attemptId, { turn: frame.turn, step: frame.step }); return; }
    const location = streams.get(frame.attemptId);
    if (!location) return;
    if (frame.type === "chunk") this.live.get(session)?.acceptChunk(location.turn, location.step, frame.chunk);
    if (frame.type === "end") {
      if (frame.outcome.kind === "abandoned") this.live.get(session)?.discard(location.turn, location.step);
      streams.delete(frame.attemptId);
    }
  }

  async resolve(sessionId: string, uiId: string) {
    const session = this.sessions.get(sessionId as SessionId);
    const live = session && this.live.get(session);
    if (live?.has(uiId)) return live.resolve(uiId);
    return (await this.index(sessionId)).resolve(uiId);
  }

  async hasAdmission(sessionId: string, operationId: string): Promise<boolean> {
    return (await this.index(sessionId)).hasAdmission(operationId);
  }

  private async index(sessionId: string): Promise<NativeUiIndex> {
    const inspected = await this.controller.inspect(sessionId as SessionId);
    const sessions = this.cold.get(inspected.events) ?? new Map<string, NativeUiIndex>();
    let index = sessions.get(sessionId);
    if (!index) {
      index = new NativeUiIndex(sessionId);
      inspected.events.forEach(event => index!.accept(event));
      sessions.set(sessionId, index);
      this.cold.set(inspected.events, sessions);
    }
    return index;
  }
}

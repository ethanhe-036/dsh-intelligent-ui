import type { Context } from "@deepseek-ai/cordis";
import type { ConversationNodeDefinition } from "@deepseek-ai/dsh-client-ui-conversation/client";
import type { AssistantChatData } from "@deepseek-ai/dsh-client-ui-chat/client";
interface UiChatData {
    assistant: AssistantChatData;
    attempt: number;
}
declare module "@deepseek-ai/dsh-client-ui-chat/client" {
    interface ChatNodeDataMap {
        "intelligent-ui": UiChatData;
    }
}
/** 读取官方 assistant-step 发布值，只增加一个专属节点，不重写 Assistant 或历史。 */
export declare const uiDefinition: ConversationNodeDefinition<{
    attempt: number;
    anchorSeq?: number;
}>;
export declare const inject: string[];
/** 原生 DSH 浏览器通过公开 Node/slot 装配共享 React 渲染器。 */
export declare function apply(ctx: Context): void;
export {};

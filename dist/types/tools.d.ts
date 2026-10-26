import type { Context } from "@deepseek-ai/cordis";
import "@deepseek-ai/dsh-system-prompt";
import { type Catalog } from "./core.js";
export declare const name = "dsh-intelligent-ui-tools";
export declare const inject: string[];
/** 工具和目录按调用方作用域注册；默认 Bundle 全局装配，不读取用户状态或创建 Agent 回合。 */
export declare function apply(ctx: Context): void;
/** 宿主只注入可信目录及其版本；生成内容仍使用同一解析器、最终校验和工具生命周期。 */
export declare function registerIntelligentUiTools(ctx: Context, options?: {
    catalog?: Catalog;
    catalogVersion?: string;
    instructions?: string;
    redactDiagnosticPaths?: boolean;
}): void;

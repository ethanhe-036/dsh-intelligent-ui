import type { Context } from "@deepseek-ai/cordis";
import "@deepseek-ai/dsh-system-prompt";
import { type Catalog } from "./core.js";
export declare const name = "dsh-intelligent-ui-tools";
export declare const inject: string[];
/** 工具和目录只装配于目标 Preset；不读宿主用户状态，不创建新的 Agent 回合。 */
export declare function apply(ctx: Context): void;
/** 宿主只注入可信目录及其版本；生成内容仍使用同一解析器、最终校验和工具生命周期。 */
export declare function registerIntelligentUiTools(ctx: Context, options?: {
    catalog?: Catalog;
    catalogVersion?: string;
    instructions?: string;
    redactDiagnosticPaths?: boolean;
}): void;

import type { Context } from "@deepseek-ai/cordis";
export declare const name = "dsh-intelligent-ui";
export declare const inject: string[];
/** 原生宿主使用官方信任边界和 storageDomain；工具仍按 Preset 注册。 */
export declare function apply(ctx: Context): Promise<void>;

export type UiLocale = "en" | "zh-CN" | "zh-TW" | "id";
export interface UiPendingEdit {
    paths: readonly string[];
    focus: () => void;
}
export declare const UiDomContext: import("react").Context<string | undefined>;
/** 只登记当前挂载控件的未完成编辑，不进入持久 Store、工具输入或模型上下文。 */
export declare const UiEditContext: import("react").Context<{
    locale: UiLocale;
    setPending: (id: string, pending?: UiPendingEdit) => void;
}>;
export declare function useUiEditContext(): {
    locale: UiLocale;
    setPending: (id: string, pending?: UiPendingEdit) => void;
};

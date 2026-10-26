import { createContext, useContext } from "react";

export type UiLocale = "en" | "zh-CN" | "zh-TW" | "id";
export interface UiPendingEdit { paths: readonly string[]; focus: () => void }
export const UiDomContext = createContext<string | undefined>(undefined);

/** 只登记当前挂载控件的未完成编辑，不进入持久 Store、工具输入或模型上下文。 */
export const UiEditContext = createContext<{
  locale: UiLocale;
  setPending: (id: string, pending?: UiPendingEdit) => void;
}>({ locale: "en", setPending: () => {} });

export function useUiEditContext() { return useContext(UiEditContext); }

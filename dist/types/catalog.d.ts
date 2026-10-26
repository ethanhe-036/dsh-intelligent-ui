import type { SpecComponents } from "generative-frame/spec/react";
export declare const componentNames: readonly ["Header", "Text", "Caption", "Divider", "Fact", "Button", "Select", "Input", "DatePicker", "Checkbox", "Slider", "RadioGroup", "CheckboxGroup", "Card", "Col", "Row", "Spacer", "Badge", "Box", "Tabs", "ListView", "ListViewItem", "Steps", "Timeline", "Table", "Chart", "Alert"];
export declare const catalog: import("generative-frame/spec").Catalog<{
    readonly Grid: {
        readonly description: "Responsive equal-width layout, in document order. columns is the maximum (default 2): below 560px content width use one column, below 900px at most two. gap uses 4px units, including fractions. Layout only; no input state.";
        readonly props: {
            readonly type: "object";
            readonly properties: {
                readonly columns: {
                    readonly type: "integer";
                    readonly enum: readonly [1, 2, 3];
                    readonly default: 2;
                };
                readonly gap: {
                    readonly type: "number";
                    readonly minimum: 0;
                    readonly maximum: 8;
                    readonly default: 4;
                };
            };
            readonly additionalProperties: false;
        };
        readonly slots: readonly ["default"];
    };
    readonly NumberInput: {
        readonly description: "Editable numeric value. Bind value with $bindState to a number or null; unlike text Input this stays numeric for formulas. Clearing writes null. Optional showSlider shares this ONE value and requires finite min < max; null disables the slider. step only controls slider/arrow increments, never rounds numeric text. unit is display only.";
        readonly props: {
            readonly type: "object";
            readonly properties: {
                readonly label: {
                    readonly type: "string";
                };
                readonly value: {
                    readonly type: readonly ["number", "null"];
                };
                readonly min: {
                    readonly type: "number";
                };
                readonly max: {
                    readonly type: "number";
                };
                readonly step: {
                    readonly type: "number";
                    readonly exclusiveMinimum: 0;
                };
                readonly showSlider: {
                    readonly type: "boolean";
                    readonly default: false;
                };
                readonly unit: {
                    readonly type: "string";
                };
            };
            readonly required: readonly ["label", "value"];
            readonly additionalProperties: false;
        };
        readonly events: readonly ["change"];
    };
}, {
    [k: string]: {
        params: import("generative-frame/spec").JsonSchema | undefined;
        description: string;
    };
}>;
export declare const components: SpecComponents;

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveSpec, validateSpec, type Spec, type SpecElement } from "generative-frame/spec";
import { catalog as registeredCatalog } from "../src/catalog.js";
import { catalog, catalogVersion, UiArgumentStream, validateDocument } from "../src/core.js";
import { validateUiValues, writableUiPaths } from "../src/state.js";
import { buildVisualCatalog, fixtureArguments } from "../scripts/visual-fixtures.mjs";

type Fixture = { id: string; title: string; locale: string; tags: string[]; components: string[]; spec: Spec };
type FieldCoverage = { path: string; status: string; fixtureIds: string[]; enumValues?: { value: unknown; fixtureIds: string[] }[] };
type Schema = { properties?: Record<string, Schema>; items?: Schema; enum?: unknown[]; type?: string | string[] };
const source = JSON.parse(readFileSync(new URL("../src/catalog.generated.json", import.meta.url), "utf8"));
const saved = JSON.parse(readFileSync(new URL("./fixtures/visual-catalog.json", import.meta.url), "utf8"));
const fixtures: Fixture[] = saved.fixtures;
const byId = new Map(fixtures.map(fixture => [fixture.id, fixture]));
const fixture = (id: string) => {
  const value = byId.get(id);
  expect(value, "missing fixture " + id).toBeDefined();
  return value!;
};
const nodes = (item: Fixture, component: string) => Object.values(item.spec.elements).filter(node => node.type === component);

function fields(schema: Schema, path: string[] = []): { path: string; schema: Schema }[] {
  const output: { path: string; schema: Schema }[] = [];
  for (const [key, value] of Object.entries(schema.properties ?? {})) {
    const next = [...path, key];
    output.push({ path: next.join("."), schema: value });
    output.push(...fields(value, next));
  }
  if (schema.items) {
    const next = [...path.slice(0, -1), path.at(-1) + "[]"];
    if (!schema.items.properties) output.push({ path: next.join("."), schema: schema.items });
    output.push(...fields(schema.items, next));
  }
  return output;
}
function valuesAt(value: unknown, path: string): unknown[] {
  const [head, ...rest] = path.replaceAll("[]", ".*").split(".");
  const values = head === "*" ? Array.isArray(value) ? value : []
    : value !== null && typeof value === "object" && Object.hasOwn(value, head)
      ? [(value as Record<string, unknown>)[head]] : [];
  return rest.length ? values.flatMap(item => valuesAt(item, rest.join("."))) : values;
}
function observed(ids: string[], component: string, path: string): unknown[] {
  return ids.flatMap(id => nodes(fixture(id), component).flatMap(node => valuesAt(node.props ?? {}, path)));
}
function checkPublicProperties(schema: Schema, value: unknown, path: string): void {
  if (value === null || typeof value !== "object") return;
  if (Object.keys(value).some(key => key.startsWith("$"))) return;
  if (Array.isArray(value)) {
    if (schema.items) value.forEach((item, index) => checkPublicProperties(schema.items!, item, path + "/" + index));
    return;
  }
  if (!schema.properties) return;
  for (const [key, item] of Object.entries(value)) {
    expect(Object.hasOwn(schema.properties, key), path + "/" + key).toBe(true);
    checkPublicProperties(schema.properties[key], item, path + "/" + key);
  }
}

describe("R2 generic visual fixture contract", () => {
  it("keeps the static render catalog equivalent to registered public schemas without executable schema converters", () => {
    const publicJson = (value: unknown) => JSON.parse(JSON.stringify(value ?? null));
    for (const name of Object.keys(registeredCatalog.components)) {
      expect(publicJson(catalog.component(name)), name).toEqual(publicJson(registeredCatalog.component(name)));
      expect(publicJson(catalog.propsSchema(name)), name).toEqual(publicJson(registeredCatalog.propsSchema(name)));
      expect(JSON.stringify(catalog.propsSchema(name))).not.toBeUndefined();
      const standard = (catalog.propsSchema(name) as Record<string, any>)?.["~standard"];
      expect(typeof standard?.jsonSchema?.input, name).not.toBe("function");
    }
    for (const name of Object.keys(registeredCatalog.actions)) {
      expect(publicJson(catalog.action(name)), name).toEqual(publicJson(registeredCatalog.action(name)));
      expect(publicJson(catalog.paramsSchema(name)), name).toEqual(publicJson(registeredCatalog.paramsSchema(name)));
    }
  });
  it("is deterministic, matches the current 29-component catalog and retains usable specs", () => {
    expect(buildVisualCatalog()).toEqual(saved);
    expect(buildVisualCatalog()).toEqual(saved);
    expect(saved.catalogVersion).toBe(catalogVersion);
    expect(saved.catalogSha256).toBe(createHash("sha256").update(JSON.stringify(source)).digest("hex"));
    expect(Object.keys(registeredCatalog.components)).toHaveLength(29);
    expect(saved.coverage.map((row: { component: string }) => row.component).sort()).toEqual(Object.keys(registeredCatalog.components).sort());
    expect(new Set(fixtures.map(item => item.id)).size).toBe(fixtures.length);
    expect(saved.consumer.specField).toBe("fixtures[].spec");
    expect(saved.consumer.widths).toEqual([320, 390, 559, 560, 768, 899, 900, 1280]);
    expect(saved.consumer.validationScope).toContain("no browser");
  });

  it.each(fixtures)("$id passes the registered catalog and the public tool parser", item => {
    expect(validateSpec(item.spec, registeredCatalog), item.id).toMatchObject({ ok: true });
    expect(validateSpec(item.spec, catalog), item.id).toMatchObject({ ok: true });
    const args = fixtureArguments(item);
    const parsed = validateDocument(args.title, args.jsonl, registeredCatalog);
    expect(parsed.ok, item.id + ": " + JSON.stringify(parsed.ok ? [] : parsed.issues)).toBe(true);
    if (parsed.ok) expect(parsed.document.spec).toEqual(item.spec);

    // 公共 Schema 的开放对象不代表视觉样例可以偷加未声明属性。
    for (const [id, node] of Object.entries(item.spec.elements)) {
      expect(Object.hasOwn(registeredCatalog.components, node.type)).toBe(true);
      expect(catalog.validateProps(node.type, node.props ?? {}), item.id + "/" + id).toEqual(registeredCatalog.validateProps(node.type, node.props ?? {}));
      checkPublicProperties(registeredCatalog.propsSchema(node.type) as Schema, node.props ?? {}, item.id + "/" + id);
      for (const event of Object.keys(node.on ?? {})) {
        expect(registeredCatalog.components[node.type].events, item.id + "/" + event).toContain(event);
        const actions = node.on![event];
        for (const action of Array.isArray(actions) ? actions : [actions]) expect(action.action).toBe("setState");
      }
      expect(node.watch).toBeUndefined();
    }
    const seen = new Set<string>();
    const pending = [item.spec.root];
    while (pending.length) {
      const id = pending.pop()!;
      expect(seen.has(id), item.id + ": duplicate or cyclic child " + id).toBe(false);
      seen.add(id);
      const node: SpecElement = item.spec.elements[id];
      expect(node, item.id + ": dangling node " + id).toBeDefined();
      pending.push(...(node.children ?? []), ...Object.values(node.slots ?? {}).flat());
    }
    expect([...seen].sort()).toEqual(Object.keys(item.spec.elements).sort());
    expect([...new Set(Object.values(item.spec.elements).map(node => node.type))]).toEqual(item.components);
  });

  it("maps every public property and every enum value to specimens containing that actual value", () => {
    for (const component of Object.keys(registeredCatalog.components)) {
      const declared = fields(registeredCatalog.propsSchema(component) as Schema);
      const row = saved.coverage.find((value: { component: string }) => value.component === component);
      expect(row.fixtureIds.length, component).toBeGreaterThan(0);
      expect(row.properties.map((value: FieldCoverage) => value.path).sort()).toEqual(declared.map(value => value.path).sort());
      if (!declared.length) expect(row.noPropertiesReason).toContain("没有声明公开 props");
      for (const field of declared) {
        const covered: FieldCoverage = row.properties.find((value: FieldCoverage) => value.path === field.path);
        expect(covered.status).toBe("fixture-covered");
        expect(covered.fixtureIds.length, component + "." + field.path).toBeGreaterThan(0);
        for (const id of covered.fixtureIds) expect(observed([id], component, field.path).length, id + ": " + field.path).toBeGreaterThan(0);
        const required = field.schema.enum ?? (field.schema.type === "boolean" ? [false, true] : []);
        for (const value of required) expect(observed(covered.fixtureIds, component, field.path)).toContainEqual(value);
        if (field.schema.enum) {
          expect(covered.enumValues?.map(entry => entry.value)).toEqual(field.schema.enum);
          for (const entry of covered.enumValues!) {
            expect(entry.fixtureIds.length).toBeGreaterThan(0);
            for (const id of entry.fixtureIds) expect(observed([id], component, field.path)).toContainEqual(entry.value);
          }
        }
      }
    }
    for (const note of saved.applicability) {
      expect(note.reason.length).toBeGreaterThan(0);
      for (const id of note.fixtureIds) expect(nodes(fixture(id), note.component).length).toBeGreaterThan(0);
    }
  });

  it.each(["Card", "Col", "Row", "Grid"])("%s includes endpoints, every integer spacing and fractional values", component => {
    const property = component === "Card" ? "padding" : "gap";
    const values = observed(fixtures.map(item => item.id), component, property);
    for (const amount of [0, 0.25, 1, 1.5, 2, 3, 4, 5, 6, 7, 7.75, 8]) expect(values).toContain(amount);
  });

  it("keeps numeric/null edge specimens and shared-slider values valid without rounding", () => {
    for (const item of fixtures.filter(value => value.id.startsWith("numberinput.slider."))) {
      expect(writableUiPaths(item.spec)).toEqual(["/amount"]);
      const values = { "/amount": item.spec.state!.amount };
      expect(validateUiValues(item.spec, values)).toEqual(values);
    }
    expect(fixture("numberinput.slider.null").spec.state!.amount).toBeNull();
    expect(fixture("numberinput.slider.offstep").spec.state!.amount).toBe(2.125);
    expect(fixture("numberinput.slider.offstep").spec.elements.sample.props!.step).toBe(1);
    for (const value of [null, 0, -1.125, 0.000001, 1000000000000])
      expect(observed(fixtures.map(item => item.id), "NumberInput", "value")).toContain(value);
    for (const item of fixtures.filter(value => value.id.startsWith("slider."))) {
      const props = nodes(item, "Slider")[0].props!;
      if (props.defaultValue !== undefined) {
        expect(props.defaultValue).toBeGreaterThanOrEqual(props.min as number);
        expect(props.defaultValue).toBeLessThanOrEqual(props.max as number);
      }
    }
  });

  it("pairs explicit backgrounds with all white text tokens and all Button styles with block/undoable", () => {
    for (const type of ["Card", "Box"]) {
      const spec = fixture(type.toLowerCase() + ".explicit-background-white").spec;
      expect(spec.elements.sample.props!.background).toBe("#15304b");
      expect(spec.elements.sample.children!.map(id => spec.elements[id].props!.color)).toEqual(["white", "white-70", "white-50"]);
    }
    const button = registeredCatalog.propsSchema("Button") as Schema;
    for (const style of button.properties!.buttonStyle.enum!) {
      const node = nodes(fixture("button." + style + ".block-undoable"), "Button")[0];
      expect(node.props).toMatchObject({ buttonStyle: style, block: true, undoable: true });
    }
    const form = fixture("button.submit.true").spec;
    expect(form.elements[form.root].props!.asForm).toBe(true);
    expect(form.elements.sample.props!.submit).toBe(true);
  });

  it.each(["bar", "line", "sparkline", "area"])("%s supplies empty, zero, negative, mixed, tiny and large chart data", variant => {
    for (const label of ["empty", "zero", "negative", "mixed", "tiny", "large"]) {
      const props = nodes(fixture("chart." + variant + "." + label), "Chart")[0].props!;
      expect(props.variant).toBe(variant);
      const values = (props.data as { value: number }[]).map(point => point.value);
      if (label === "empty") expect(values).toEqual([]);
      if (label === "zero") expect(values).toEqual([0, 0, 0]);
      if (label === "negative") expect(values.every(value => value < 0)).toBe(true);
      if (label === "mixed") expect(Math.min(...values)).toBeLessThan(0);
      if (label === "tiny") expect(Math.max(...values)).toBeLessThan(0.001);
      if (label === "large") expect(Math.max(...values)).toBeGreaterThanOrEqual(1e12);
    }
    const props = nodes(fixture("chart." + variant + ".multiseries-stacked"), "Chart")[0].props!;
    expect(props.stacked).toBe(true);
    expect(props.series).toHaveLength(2);
  });

  it("keeps table format variants, boolean cells, empty/long collections and four distinct long-label pages", () => {
    const table = fixture("table.formats").spec.elements.sample.props!;
    expect((table.rows as unknown[][]).flat()).toContain(false);
    expect(nodes(fixture("table.long-rows"), "Table")[0].props!.rows).toHaveLength(100);
    expect(fixture("listview.count-0").spec.elements.list.children).toEqual([]);
    expect(fixture("listview.count-50").spec.elements.list.children).toHaveLength(50);
    const titles = [];
    for (const locale of ["zh-CN", "zh-TW", "en", "id"]) {
      const page = fixture("locale." + locale);
      expect(page.locale).toBe(locale);
      expect(page.title.length).toBeGreaterThan(50);
      titles.push(page.title);
      for (const component of ["Input", "NumberInput", "Select", "RadioGroup", "CheckboxGroup", "Slider", "DatePicker", "Checkbox"])
        expect(nodes(page, component)[0].props!.label).toBe(page.title);
      expect(nodes(page, "Table")[0].props!.columns).toEqual(expect.arrayContaining([expect.objectContaining({ label: page.title })]));
    }
    expect(new Set(titles).size).toBe(4);
  });

  it("is usable for progressive consumption and bound formula updates, without external actions", () => {
    const item = fixture("grid.nested-bound-input");
    const raw = JSON.stringify(fixtureArguments(item));
    const stream = new UiArgumentStream(registeredCatalog);
    let partialControl = false;
    for (let end = 1; end < raw.length; end += 32) {
      const preview = stream.push(raw.slice(0, end));
      if (preview.valid && !preview.complete && preview.spec.elements.number) partialControl = true;
    }
    expect(partialControl).toBe(true);
    expect(stream.push(raw)).toMatchObject({ valid: true, complete: true, spec: item.spec });
    const resolved = resolveSpec(item.spec, { state: { amount: 3.5 } });
    expect(resolved?.children.find(node => node.type === "Fact")?.props.value).toBe(7);
    expect(item.spec.state!.amount).toBe(2.125);
    expect(Object.values(item.spec.elements).filter(node => node.type === "Grid")).toHaveLength(2);
  });
});

import { build } from "esbuild";
import { readFile, unlink, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const temporary = resolve(root, ".catalog-build.mjs");
const target = resolve(root, "src/catalog.generated.json");
const compiled = await build({ absWorkingDir: root, entryPoints: ["src/catalog.ts"], bundle: true, platform: "node", format: "esm", packages: "external", write: false });
await writeFile(temporary, compiled.outputFiles[0].contents);
try {
  const { catalog } = await import(new URL("../.catalog-build.mjs", import.meta.url));
  const definitions = { components: Object.fromEntries(Object.entries(catalog.components).map(([name, component]) => [name, { ...component, props: catalog.propsSchema(name) }])), actions: Object.fromEntries(Object.entries(catalog.actions).map(([name, action]) => [name, { ...action, params: catalog.paramsSchema(name) }])) };
  const expected = JSON.stringify(definitions, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (await readFile(target, "utf8") !== expected) throw new Error("INTELLIGENT_UI_CATALOG_DRIFT");
  } else await writeFile(target, expected);
  console.log(`Intelligent UI catalog: ${Object.keys(definitions.components).length} components; ${process.argv.includes("--check") ? "checked" : "generated"}`);
} finally { await unlink(temporary); }

import { build } from "esbuild";
import { mkdir, writeFile, copyFile, readFile, readdir } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { generateDtsBundle } from "dts-bundle-generator";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
await mkdir("dist", { recursive: true });
execFileSync(process.execPath, [resolve(root, "scripts/generate-catalog.mjs")], { stdio: "inherit" });
const shared = { bundle: true, target: "es2022", sourcemap: true, metafile: true, legalComments: "linked", external: ["react", "react-dom", "react/jsx-runtime", "@deepseek-ai/*"] };
const server = await build({ ...shared, entryPoints: { index: "src/index.ts", tools: "src/tools.ts", core: "src/core.ts", state: "src/state.ts", react: "src/renderer.tsx" }, outdir: "dist", platform: "neutral", format: "esm" });
const client = await build({ ...shared, entryPoints: ["src/client.tsx"], outfile: "dist/client.js", platform: "browser", format: "cjs", loader: { ".css": "text" }, banner: { js: 'window.__ModuleLoader__.load({id:"dsh-intelligent-ui",factory:(require)=>{const module={exports:{}};const exports=module.exports;' }, footer: { js: "return module.exports;}});" } });
await copyFile("src/styles.css", "dist/styles.css");
execFileSync(process.execPath, [fileURLToPath(import.meta.resolve("typescript/bin/tsc")), "-p", "tsconfig.json"], { stdio: "inherit" });
const entries = ["core", "state", "renderer"];
const declarations = generateDtsBundle(entries.map(name => ({ filePath: "dist/types/" + name + ".d.ts",
  libraries: { inlinedLibraries: ["generative-frame"] }, output: { exportReferencedTypes: false } })), { preferredConfigPath: "tsconfig.bundle.json" });
for (const [index, name] of entries.entries()) await writeFile("dist/types/" + name + ".d.ts", declarations[index]);
// 根据实际 bundle 输入收集许可证，不把仅开发时使用的框架或完整 Toolkit 纳入制品。
const packages = new Map();
for (const input of new Set([...Object.keys(server.metafile.inputs), ...Object.keys(client.metafile.inputs)])) {
  if (!input.includes("node_modules/")) continue;
  let directory = dirname(resolve(input));
  while (directory.includes("node_modules")) {
    try {
      const metadata = JSON.parse(await readFile(resolve(directory, "package.json"), "utf8"));
      if (typeof metadata.name !== "string" || typeof metadata.version !== "string") { directory = dirname(directory); continue; }
      if (packages.has(metadata.name)) break;
      const license = (await readdir(directory)).find(name => /^licen[sc]e(?:\.[a-z]+)?$/i.test(name));
      packages.set(metadata.name, metadata.name + "@" + metadata.version + " (" + metadata.license + ")\n" +
        (license ? await readFile(resolve(directory, license), "utf8") : "License text: see source package; bundled legal notices are retained in dist/*.LEGAL.txt."));
      break;
    } catch { directory = dirname(directory); }
  }
}
await writeFile("THIRD-PARTY-NOTICES", [...packages.values()].sort().join("\n\n---\n\n").trimEnd() + "\n");

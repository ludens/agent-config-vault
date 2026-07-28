#!/usr/bin/env node
/**
 * Bundle Node sidecar + copy default adapters into Tauri resources/
 * for release builds (and CI).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const entry = path.join(root, "packages/core/src/sidecar.ts");
const resources = path.join(root, "apps/desktop/src-tauri/resources");
const outFile = path.join(resources, "sidecar.mjs");
const adaptersSrc = path.join(root, "adapters");
const adaptersDst = path.join(resources, "adapters");

fs.mkdirSync(resources, { recursive: true });
fs.mkdirSync(adaptersDst, { recursive: true });

const shell = process.platform === "win32";
const r = spawnSync(
  "pnpm",
  [
    "--filter",
    "@agent-config-vault/core",
    "exec",
    "esbuild",
    entry,
    "--bundle",
    "--platform=node",
    "--format=esm",
    `--outfile=${outFile}`,
    "--packages=bundle",
  ],
  { cwd: root, stdio: "inherit", shell },
);
if (r.status !== 0) {
  process.exit(r.status ?? 1);
}

for (const f of fs.readdirSync(adaptersSrc).filter((x) => x.endsWith(".toml"))) {
  fs.copyFileSync(path.join(adaptersSrc, f), path.join(adaptersDst, f));
}

console.log(`[prepare-desktop-resources] wrote ${outFile}`);
console.log(`[prepare-desktop-resources] adapters → ${adaptersDst}`);

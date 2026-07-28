import fs from "node:fs";
import path from "node:path";
import type { ImportResult, ResolvedAdapter } from "../types.js";
import { updateToolState } from "./state.js";
import { agentDir } from "./vault.js";

function copyPath(src: string, dest: string): void {
  const st = fs.lstatSync(src);
  if (st.isSymbolicLink()) {
    // Follow symlink once: copy real content
    const real = fs.realpathSync(src);
    copyPath(real, dest);
    return;
  }
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      copyPath(path.join(src, name), path.join(dest, name));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  try {
    fs.chmodSync(dest, st.mode & 0o777);
  } catch {
    /* ignore */
  }
}

function rmrf(p: string): void {
  fs.rmSync(p, { recursive: true, force: true });
}

export type ImportOpts = {
  vaultRoot: string;
  adapter: ResolvedAdapter;
  mode: "overwrite" | "skip";
};

export function importTool(opts: ImportOpts): ImportResult {
  const { vaultRoot, adapter, mode } = opts;
  const result: ImportResult = {
    ok: true,
    imported: [],
    skipped: [],
    errors: [],
  };
  const destRoot = agentDir(vaultRoot, adapter.id);
  fs.mkdirSync(destRoot, { recursive: true });

  for (const [catId, cat] of Object.entries(adapter.categories)) {
    if (!cat || !cat.enabled) continue;
    const { sourcePath, targetPath } = cat;
    try {
      if (!fs.existsSync(targetPath)) {
        result.skipped.push({
          category: catId,
          reason: "target missing",
        });
        continue;
      }
      if (fs.existsSync(sourcePath)) {
        if (mode === "skip") {
          result.skipped.push({ category: catId, reason: "source exists" });
          continue;
        }
        rmrf(sourcePath);
      }
      copyPath(targetPath, sourcePath);
      // prefer 0600 for single-file mcp-ish content
      if (
        fs.existsSync(sourcePath) &&
        fs.statSync(sourcePath).isFile() &&
        (catId === "mcp" || sourcePath.endsWith(".json") || sourcePath.endsWith(".toml"))
      ) {
        try {
          fs.chmodSync(sourcePath, 0o600);
        } catch {
          /* ignore */
        }
      }
      result.imported.push({ category: catId, sourcePath });
    } catch (e) {
      result.ok = false;
      result.errors.push({
        category: catId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  updateToolState(vaultRoot, adapter.id, {
    lastImportAt: new Date().toISOString(),
  });
  return result;
}

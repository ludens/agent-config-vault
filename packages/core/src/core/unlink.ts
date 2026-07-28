import fs from "node:fs";
import path from "node:path";
import type { ResolvedAdapter, UnlinkResult } from "../types.js";
import { readState, updateToolState } from "./state.js";
import { backupsDir } from "./vault.js";

function sameLinkTarget(linkPath: string, sourcePath: string): boolean {
  try {
    const raw = fs.readlinkSync(linkPath);
    const resolved = path.isAbsolute(raw)
      ? path.normalize(raw)
      : path.normalize(path.resolve(path.dirname(linkPath), raw));
    return resolved === path.normalize(sourcePath);
  } catch {
    return false;
  }
}

function findLatestBackup(
  vaultRoot: string,
  toolId: string,
  targetPath: string,
  homePath: string,
): string | null {
  const root = backupsDir(vaultRoot);
  if (!fs.existsSync(root)) return null;
  let rel = path.relative(homePath, targetPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    rel = path.basename(targetPath);
  }
  const stamps = fs
    .readdirSync(root)
    .filter((d) => fs.statSync(path.join(root, d)).isDirectory())
    .sort()
    .reverse();
  for (const ts of stamps) {
    const candidate = path.join(root, ts, toolId, rel);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

export type UnlinkOpts = {
  vaultRoot: string;
  adapter: ResolvedAdapter;
};

/**
 * For each enabled category that is a correct vault symlink:
 * remove symlink and restore latest backup if present.
 */
export function unlinkTool(opts: UnlinkOpts): UnlinkResult {
  const { vaultRoot, adapter } = opts;
  const result: UnlinkResult = {
    ok: true,
    restored: [],
    removed: [],
    errors: [],
  };

  for (const [catId, cat] of Object.entries(adapter.categories)) {
    if (!cat || !cat.enabled) continue;
    const { sourcePath, targetPath } = cat;
    try {
      let isLink = false;
      try {
        isLink = fs.lstatSync(targetPath).isSymbolicLink();
      } catch {
        continue;
      }
      if (!isLink) continue;
      if (!sameLinkTarget(targetPath, sourcePath)) {
        // not our link — leave alone
        continue;
      }
      fs.unlinkSync(targetPath);
      const backup = findLatestBackup(
        vaultRoot,
        adapter.id,
        targetPath,
        adapter.homePath,
      );
      if (backup) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        // copy restore so backup remains
        const st = fs.lstatSync(backup);
        if (st.isDirectory()) {
          fs.cpSync(backup, targetPath, { recursive: true });
        } else {
          fs.copyFileSync(backup, targetPath);
        }
        result.restored.push({ category: catId, targetPath });
      } else {
        result.removed.push({ category: catId, targetPath });
      }
    } catch (e) {
      result.ok = false;
      result.errors.push({
        category: catId,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  const state = readState(vaultRoot);
  const tool = state.tools[adapter.id];
  updateToolState(vaultRoot, adapter.id, {
    links: [],
    sharedRefs: tool?.sharedRefs ?? [],
    lastImportAt: tool?.lastImportAt,
  });
  return result;
}

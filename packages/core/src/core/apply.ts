import fs from "node:fs";
import path from "node:path";
import type {
  ApplyResult,
  PlanItem,
  ResolvedAdapter,
} from "../types.js";
import { updateToolState } from "./state.js";
import { backupsDir } from "./vault.js";

function readLinkSafe(p: string): string | null {
  try {
    return fs.readlinkSync(p);
  } catch {
    return null;
  }
}

function existsL(p: string): boolean {
  try {
    fs.lstatSync(p);
    return true;
  } catch {
    return false;
  }
}

function sameLinkTarget(linkPath: string, sourcePath: string): boolean {
  const raw = readLinkSafe(linkPath);
  if (raw === null) return false;
  const resolved = path.isAbsolute(raw)
    ? path.normalize(raw)
    : path.normalize(path.resolve(path.dirname(linkPath), raw));
  return resolved === path.normalize(sourcePath);
}

export function planApply(adapter: ResolvedAdapter): PlanItem[] {
  const items: PlanItem[] = [];
  for (const [catId, cat] of Object.entries(adapter.categories)) {
    if (!cat || !cat.enabled) continue;
    const { sourcePath, targetPath } = cat;
    if (!fs.existsSync(sourcePath)) {
      items.push({
        category: catId,
        targetPath,
        sourcePath,
        action: "missing-source",
      });
      continue;
    }
    if (!existsL(targetPath)) {
      items.push({
        category: catId,
        targetPath,
        sourcePath,
        action: "create",
      });
      continue;
    }
    const st = fs.lstatSync(targetPath);
    if (st.isSymbolicLink()) {
      if (sameLinkTarget(targetPath, sourcePath)) {
        items.push({
          category: catId,
          targetPath,
          sourcePath,
          action: "noop",
        });
      } else {
        items.push({
          category: catId,
          targetPath,
          sourcePath,
          action: "fix-link",
        });
      }
      continue;
    }
    items.push({
      category: catId,
      targetPath,
      sourcePath,
      action: "replace",
    });
  }
  return items;
}

function backupPath(
  vaultRoot: string,
  backupTs: string,
  toolId: string,
  targetPath: string,
  homePath: string,
): string {
  let rel = path.relative(homePath, targetPath);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    rel = path.basename(targetPath);
  }
  return path.join(backupsDir(vaultRoot), backupTs, toolId, rel);
}

function moveToBackup(
  targetPath: string,
  dest: string,
): void {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.renameSync(targetPath, dest);
}

export type ApplyOpts = {
  vaultRoot: string;
  adapter: ResolvedAdapter;
  confirm: true;
  backupTs: string;
  plan?: PlanItem[];
};

export function applyPlan(opts: ApplyOpts): ApplyResult {
  if (!opts.confirm) {
    throw new Error("applyPlan requires confirm: true");
  }
  const plan = opts.plan ?? planApply(opts.adapter);
  const result: ApplyResult = { ok: true, applied: [], errors: [] };
  const links: { category: string; target: string; source: string }[] = [];

  for (const item of plan) {
    if (item.action === "noop") {
      result.applied.push(item);
      links.push({
        category: item.category,
        target: item.targetPath,
        source: item.sourcePath,
      });
      continue;
    }
    if (item.action === "missing-source") {
      result.applied.push(item);
      continue;
    }
    try {
      fs.mkdirSync(path.dirname(item.targetPath), { recursive: true });
      if (item.action === "replace") {
        const dest = backupPath(
          opts.vaultRoot,
          opts.backupTs,
          opts.adapter.id,
          item.targetPath,
          opts.adapter.homePath,
        );
        moveToBackup(item.targetPath, dest);
      } else if (item.action === "fix-link") {
        fs.unlinkSync(item.targetPath);
      }
      fs.symlinkSync(item.sourcePath, item.targetPath);
      result.applied.push(item);
      links.push({
        category: item.category,
        target: item.targetPath,
        source: item.sourcePath,
      });
    } catch (e) {
      result.ok = false;
      result.errors.push({
        category: item.category,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  // merge with existing noop-linked categories from prior state isn't needed —
  // overwrite links for enabled categories we processed
  updateToolState(opts.vaultRoot, opts.adapter.id, { links });
  return result;
}

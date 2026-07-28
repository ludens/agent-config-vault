import fs from "node:fs";
import path from "node:path";
import { isPathInside } from "../paths.js";
import { getToolState, readState, updateToolState } from "./state.js";
import { agentDir, sharedDir } from "./vault.js";

export type SharedEntry = {
  rel: string;
  abs: string;
  kind: "file" | "dir";
};

export function listShared(vaultRoot: string): SharedEntry[] {
  const root = sharedDir(vaultRoot);
  if (!fs.existsSync(root)) return [];
  const out: SharedEntry[] = [];

  function walk(dir: string, relBase: string) {
    for (const name of fs.readdirSync(dir)) {
      if (name === ".gitkeep") continue;
      const abs = path.join(dir, name);
      const rel = relBase ? `${relBase}/${name}` : name;
      const st = fs.lstatSync(abs);
      if (st.isDirectory() && !st.isSymbolicLink()) {
        out.push({ rel, abs, kind: "dir" });
        walk(abs, rel);
      } else {
        out.push({ rel, abs, kind: st.isDirectory() ? "dir" : "file" });
      }
    }
  }
  walk(root, "");
  return out;
}

function assertUnder(root: string, abs: string, label: string): void {
  if (!isPathInside(root, abs)) {
    throw new Error(`${label} escapes allowed root: ${abs}`);
  }
}

/**
 * Create vault-internal symlink: agents/<tool>/<toRel> → shared/<fromRel>
 * fromRel is relative to shared/; toRel is relative to agent dir.
 */
export function addSharedRef(
  vaultRoot: string,
  toolId: string,
  fromRel: string,
  toRelUnderAgent: string,
): { from: string; to: string } {
  const sharedRoot = sharedDir(vaultRoot);
  const agentRoot = agentDir(vaultRoot, toolId);
  const fromAbs = path.resolve(sharedRoot, fromRel);
  const toAbs = path.resolve(agentRoot, toRelUnderAgent);
  assertUnder(sharedRoot, fromAbs, "from");
  assertUnder(agentRoot, toAbs, "to");
  if (!fs.existsSync(fromAbs)) {
    throw new Error(`shared source missing: ${fromRel}`);
  }
  fs.mkdirSync(path.dirname(toAbs), { recursive: true });
  if (fs.existsSync(toAbs) || (() => {
    try {
      fs.lstatSync(toAbs);
      return true;
    } catch {
      return false;
    }
  })()) {
    const st = fs.lstatSync(toAbs);
    if (!st.isSymbolicLink()) {
      throw new Error(`target exists and is not a symlink: ${toRelUnderAgent}`);
    }
    fs.unlinkSync(toAbs);
  }
  // absolute symlink for simplicity (tests + macOS)
  fs.symlinkSync(fromAbs, toAbs);

  const state = readState(vaultRoot);
  const tool = getToolState(state, toolId);
  const entry = { from: fromRel, to: toRelUnderAgent };
  const sharedRefs = [
    ...tool.sharedRefs.filter((r) => r.to !== toRelUnderAgent),
    entry,
  ];
  updateToolState(vaultRoot, toolId, { sharedRefs });
  return entry;
}

export function removeSharedRef(
  vaultRoot: string,
  toolId: string,
  toRelUnderAgent: string,
): void {
  const agentRoot = agentDir(vaultRoot, toolId);
  const toAbs = path.resolve(agentRoot, toRelUnderAgent);
  assertUnder(agentRoot, toAbs, "to");
  try {
    if (fs.lstatSync(toAbs).isSymbolicLink()) {
      fs.unlinkSync(toAbs);
    }
  } catch {
    /* missing ok */
  }
  const state = readState(vaultRoot);
  const tool = getToolState(state, toolId);
  updateToolState(vaultRoot, toolId, {
    sharedRefs: tool.sharedRefs.filter((r) => r.to !== toRelUnderAgent),
  });
}

import fs from "node:fs";
import type { ToolState, VaultState } from "../types.js";
import { statePath } from "./vault.js";

const emptyTool = (): ToolState => ({
  links: [],
  sharedRefs: [],
});

export function defaultState(): VaultState {
  return { vaultVersion: 1, tools: {} };
}

export function readState(vaultRoot: string): VaultState {
  const p = statePath(vaultRoot);
  if (!fs.existsSync(p)) return defaultState();
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8")) as VaultState;
    if (raw.vaultVersion !== 1) return defaultState();
    raw.tools ??= {};
    return raw;
  } catch {
    return defaultState();
  }
}

export function writeState(vaultRoot: string, state: VaultState): void {
  const p = statePath(vaultRoot);
  fs.mkdirSync(vaultRoot, { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2) + "\n", {
    mode: 0o600,
  });
  fs.renameSync(tmp, p);
  try {
    fs.chmodSync(p, 0o600);
  } catch {
    /* ignore */
  }
}

export function getToolState(state: VaultState, toolId: string): ToolState {
  return state.tools[toolId] ?? emptyTool();
}

export function updateToolState(
  vaultRoot: string,
  toolId: string,
  patch: Partial<ToolState>,
): VaultState {
  const state = readState(vaultRoot);
  const cur = getToolState(state, toolId);
  state.tools[toolId] = {
    lastImportAt: patch.lastImportAt ?? cur.lastImportAt,
    links: patch.links ?? cur.links,
    sharedRefs: patch.sharedRefs ?? cur.sharedRefs,
  };
  writeState(vaultRoot, state);
  return state;
}

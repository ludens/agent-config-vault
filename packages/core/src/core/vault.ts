import fs from "node:fs";
import path from "node:path";

export function agentDir(root: string, toolId: string): string {
  return path.join(root, "agents", toolId);
}

export function sharedDir(root: string): string {
  return path.join(root, "shared");
}

export function backupsDir(root: string): string {
  return path.join(root, "backups");
}

export function adaptersDir(root: string): string {
  return path.join(root, "adapters");
}

export function statePath(root: string): string {
  return path.join(root, "state.json");
}

const SHARED_SUBS = ["skills", "mcp", "subagents", "agents-md"] as const;

export function ensureVaultLayout(root: string): void {
  fs.mkdirSync(root, { recursive: true });
  fs.mkdirSync(path.join(root, "agents"), { recursive: true });
  fs.mkdirSync(path.join(root, "adapters"), { recursive: true });
  fs.mkdirSync(path.join(root, "backups"), { recursive: true });
  const shared = sharedDir(root);
  fs.mkdirSync(shared, { recursive: true });
  for (const s of SHARED_SUBS) {
    fs.mkdirSync(path.join(shared, s), { recursive: true });
  }
}

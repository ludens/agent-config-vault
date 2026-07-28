import fs from "node:fs";
import path from "node:path";
import { isPathInside } from "./paths.js";
import {
  ensureVaultAdapters,
  loadAdapters,
  resolveAdapter,
} from "./adapters/load.js";
import {
  agentDir,
  adaptersDir,
  ensureVaultLayout,
  sharedDir,
} from "./core/vault.js";
import { readState, writeState } from "./core/state.js";
import { importTool } from "./core/import.js";
import { applyPlan, planApply } from "./core/apply.js";
import { unlinkTool } from "./core/unlink.js";
import { statusTool } from "./core/drift.js";
import {
  addSharedRef,
  listShared,
  removeSharedRef,
} from "./core/shared-ref.js";
import type { VaultSettings } from "./types.js";

export type SidecarContext = {
  vaultRoot: string;
  packageRoot: string;
};

export type RpcRequest = {
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
};

export type RpcResponse = {
  id: string | number;
  ok: boolean;
  result?: unknown;
  error?: string;
};

function listFiles(dir: string, base = ""): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (name === ".gitkeep") continue;
    const abs = path.join(dir, name);
    const rel = base ? `${base}/${name}` : name;
    try {
      const st = fs.lstatSync(abs);
      if (st.isDirectory() && !st.isSymbolicLink()) {
        out.push(...listFiles(abs, rel));
      } else {
        out.push(rel);
      }
    } catch {
      /* skip */
    }
  }
  return out.sort();
}

function safeUnder(
  root: string,
  rel: string,
): string | null {
  if (!rel || rel.includes("\0") || rel.includes("..")) return null;
  const abs = path.resolve(root, rel);
  if (!isPathInside(root, abs)) return null;
  return abs;
}

function resolveTool(ctx: SidecarContext, id: string) {
  const list = loadAdapters(adaptersDir(ctx.vaultRoot));
  const a = list.find((x) => x.id === id);
  if (!a) return null;
  return resolveAdapter(a, {
    vaultAgentDir: agentDir(ctx.vaultRoot, a.id),
  });
}

function setVaultRoot(ctx: SidecarContext, vaultRoot: string): void {
  ctx.vaultRoot = path.resolve(vaultRoot);
}

export function handleRpc(
  ctx: SidecarContext,
  req: RpcRequest,
): RpcResponse {
  const { id, method } = req;
  const p = (req.params ?? {}) as Record<string, unknown>;
  try {
    const result = dispatch(ctx, method, p);
    return { id, ok: true, result };
  } catch (e) {
    return {
      id,
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

function dispatch(
  ctx: SidecarContext,
  method: string,
  p: Record<string, unknown>,
): unknown {
  switch (method) {
    case "ensureVault": {
      ensureVaultLayout(ctx.vaultRoot);
      ensureVaultAdapters(ctx.vaultRoot, ctx.packageRoot);
      return { vaultRoot: ctx.vaultRoot };
    }
    case "listTools": {
      const adapters = loadAdapters(adaptersDir(ctx.vaultRoot));
      return adapters.map((a) => {
        const resolved = resolveTool(ctx, a.id);
        const status = resolved
          ? statusTool(resolved)
          : { overall: "unlinked" as const, categories: [] };
        return {
          id: a.id,
          displayName: a.displayName,
          home: a.home,
          homePath: resolved?.homePath,
          status,
        };
      });
    }
    case "getTool": {
      const toolId = String(p.toolId ?? "");
      const adapter = resolveTool(ctx, toolId);
      if (!adapter) throw new Error(`Unknown tool: ${toolId}`);
      const status = statusTool(adapter);
      const state = readState(ctx.vaultRoot);
      const tool = state.tools[toolId];
      const files = listFiles(agentDir(ctx.vaultRoot, toolId));
      return {
        id: adapter.id,
        displayName: adapter.displayName,
        home: adapter.home,
        homePath: adapter.homePath,
        status,
        lastImportAt: tool?.lastImportAt,
        links: tool?.links ?? [],
        sharedRefs: tool?.sharedRefs ?? [],
        files,
        categories: adapter.categories,
      };
    }
    case "readFile": {
      const toolId = String(p.toolId ?? "");
      const rel = String(p.path ?? "");
      const root = agentDir(ctx.vaultRoot, toolId);
      const abs = safeUnder(root, rel);
      if (!abs) throw new Error("Invalid path");
      if (!fs.existsSync(abs) || fs.lstatSync(abs).isDirectory()) {
        throw new Error("Not a file");
      }
      return { path: rel, content: fs.readFileSync(abs, "utf8") };
    }
    case "writeFile": {
      const toolId = String(p.toolId ?? "");
      const rel = String(p.path ?? "");
      const content = String(p.content ?? "");
      const root = agentDir(ctx.vaultRoot, toolId);
      const abs = safeUnder(root, rel);
      if (!abs) throw new Error("Invalid path");
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const mode =
        rel.endsWith(".json") || rel.endsWith(".toml") || rel.includes("mcp")
          ? 0o600
          : 0o644;
      fs.writeFileSync(abs, content, { mode });
      return { path: rel, ok: true };
    }
    case "importTool": {
      const toolId = String(p.toolId ?? "");
      const mode = p.mode === "skip" ? "skip" : "overwrite";
      const adapter = resolveTool(ctx, toolId);
      if (!adapter) throw new Error(`Unknown tool: ${toolId}`);
      return importTool({ vaultRoot: ctx.vaultRoot, adapter, mode });
    }
    case "planApply": {
      const toolId = String(p.toolId ?? "");
      const adapter = resolveTool(ctx, toolId);
      if (!adapter) throw new Error(`Unknown tool: ${toolId}`);
      return planApply(adapter);
    }
    case "applyTool": {
      const toolId = String(p.toolId ?? "");
      const adapter = resolveTool(ctx, toolId);
      if (!adapter) throw new Error(`Unknown tool: ${toolId}`);
      if (p.confirm !== true) throw new Error("applyTool requires confirm: true");
      const backupTs =
        typeof p.backupTs === "string" && p.backupTs
          ? p.backupTs
          : new Date()
              .toISOString()
              .replace(/[:.]/g, "")
              .replace("T", "T")
              .slice(0, 15);
      const plan = planApply(adapter);
      return applyPlan({
        vaultRoot: ctx.vaultRoot,
        adapter,
        confirm: true,
        backupTs,
        plan,
      });
    }
    case "unlinkTool": {
      const toolId = String(p.toolId ?? "");
      const adapter = resolveTool(ctx, toolId);
      if (!adapter) throw new Error(`Unknown tool: ${toolId}`);
      return unlinkTool({ vaultRoot: ctx.vaultRoot, adapter });
    }
    case "listShared": {
      return listShared(ctx.vaultRoot);
    }
    case "writeSharedFile": {
      const rel = String(p.path ?? "").replace(/^\/+/, "");
      const content = String(p.content ?? "");
      if (!rel || rel.includes("..")) throw new Error("Invalid path");
      const abs = path.join(sharedDir(ctx.vaultRoot), rel);
      if (!isPathInside(sharedDir(ctx.vaultRoot), abs)) {
        throw new Error("Invalid path");
      }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, content);
      return { path: rel, ok: true };
    }
    case "addSharedRef": {
      return addSharedRef(
        ctx.vaultRoot,
        String(p.toolId ?? ""),
        String(p.fromRel ?? ""),
        String(p.toRel ?? ""),
      );
    }
    case "removeSharedRef": {
      removeSharedRef(
        ctx.vaultRoot,
        String(p.toolId ?? ""),
        String(p.toRel ?? ""),
      );
      return { ok: true };
    }
    case "getSettings": {
      const state = readState(ctx.vaultRoot);
      return {
        vaultRoot: ctx.vaultRoot,
        locale: state.settings?.locale ?? "en",
        settings: state.settings ?? {},
      };
    }
    case "setSettings": {
      const nextVault =
        typeof p.vaultRoot === "string" && p.vaultRoot.trim()
          ? path.resolve(p.vaultRoot.trim())
          : ctx.vaultRoot;
      const locale =
        typeof p.locale === "string" && p.locale
          ? p.locale
          : (readState(ctx.vaultRoot).settings?.locale ?? "en");

      // write into current vault first if still same root, else new root
      const writeRoot = nextVault;
      ensureVaultLayout(writeRoot);
      ensureVaultAdapters(writeRoot, ctx.packageRoot);
      const state = readState(writeRoot);
      const settings: VaultSettings = {
        vaultRoot: nextVault,
        locale,
      };
      state.settings = settings;
      writeState(writeRoot, state);
      setVaultRoot(ctx, nextVault);
      return { vaultRoot: ctx.vaultRoot, locale, settings };
    }
    default:
      throw new Error(`Unknown method: ${method}`);
  }
}

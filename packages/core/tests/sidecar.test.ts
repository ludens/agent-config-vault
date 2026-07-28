import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { handleRpc, type SidecarContext } from "../src/rpc.js";
import { ensureVaultLayout } from "../src/core/vault.js";
import { ensureVaultAdapters } from "../src/adapters/load.js";

const packageRoot = path.resolve(import.meta.dirname, "../../..");
const temps: string[] = [];

function tmp(prefix = "acv-rpc-"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}

afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function ctx(): SidecarContext {
  const vaultRoot = tmp();
  ensureVaultLayout(vaultRoot);
  ensureVaultAdapters(vaultRoot, packageRoot);
  return { vaultRoot, packageRoot };
}

describe("sidecar handleRpc", () => {
  it("ensureVault + listTools", () => {
    const c = ctx();
    const e = handleRpc(c, { id: 1, method: "ensureVault" });
    expect(e.ok).toBe(true);
    const list = handleRpc(c, { id: 2, method: "listTools" });
    expect(list.ok).toBe(true);
    const tools = list.result as { id: string }[];
    expect(tools.map((t) => t.id).sort()).toEqual([
      "claude-code",
      "codex",
      "grok",
      "opencode",
      "pi",
    ]);
  });

  it("getSettings / setSettings locale + vault", () => {
    const c = ctx();
    handleRpc(c, { id: 1, method: "ensureVault" });
    const next = tmp("acv-vault2-");
    const set = handleRpc(c, {
      id: 2,
      method: "setSettings",
      params: { vaultRoot: next, locale: "ko" },
    });
    expect(set.ok).toBe(true);
    expect(c.vaultRoot).toBe(path.resolve(next));
    const get = handleRpc(c, { id: 3, method: "getSettings" });
    expect(get.ok).toBe(true);
    const s = get.result as { locale: string; vaultRoot: string };
    expect(s.locale).toBe("ko");
    expect(s.vaultRoot).toBe(path.resolve(next));
  });

  it("writeFile / readFile path jail", () => {
    const c = ctx();
    handleRpc(c, { id: 1, method: "ensureVault" });
    const agent = path.join(c.vaultRoot, "agents", "grok");
    fs.mkdirSync(agent, { recursive: true });
    const w = handleRpc(c, {
      id: 2,
      method: "writeFile",
      params: { toolId: "grok", path: "AGENTS.md", content: "hello\n" },
    });
    expect(w.ok).toBe(true);
    const r = handleRpc(c, {
      id: 3,
      method: "readFile",
      params: { toolId: "grok", path: "AGENTS.md" },
    });
    expect(r.ok).toBe(true);
    expect((r.result as { content: string }).content).toBe("hello\n");

    const bad = handleRpc(c, {
      id: 4,
      method: "readFile",
      params: { toolId: "grok", path: "../state.json" },
    });
    expect(bad.ok).toBe(false);
  });

  it("unknown method errors", () => {
    const c = ctx();
    const r = handleRpc(c, { id: 1, method: "nope" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/Unknown method/);
  });

  it("importTool + planApply dispatch", () => {
    const c = ctx();
    handleRpc(c, { id: 1, method: "ensureVault" });
    const imp = handleRpc(c, {
      id: 2,
      method: "importTool",
      params: { toolId: "grok", mode: "overwrite" },
    });
    expect(imp.ok).toBe(true);
    const plan = handleRpc(c, {
      id: 3,
      method: "planApply",
      params: { toolId: "grok" },
    });
    expect(plan.ok).toBe(true);
    expect(Array.isArray(plan.result)).toBe(true);
    const applyDenied = handleRpc(c, {
      id: 4,
      method: "applyTool",
      params: { toolId: "grok", confirm: false },
    });
    expect(applyDenied.ok).toBe(false);
  });

  it("listShared + writeSharedFile + addSharedRef", () => {
    const c = ctx();
    handleRpc(c, { id: 1, method: "ensureVault" });
    const w = handleRpc(c, {
      id: 2,
      method: "writeSharedFile",
      params: { path: "skills/x.md", content: "s\n" },
    });
    expect(w.ok).toBe(true);
    const list = handleRpc(c, { id: 3, method: "listShared" });
    expect(list.ok).toBe(true);
    const entries = list.result as { rel: string }[];
    expect(entries.some((e) => e.rel === "skills/x.md")).toBe(true);

    fs.mkdirSync(path.join(c.vaultRoot, "agents", "grok"), { recursive: true });
    const ref = handleRpc(c, {
      id: 4,
      method: "addSharedRef",
      params: {
        toolId: "grok",
        fromRel: "skills/x.md",
        toRel: "skills/x.md",
      },
    });
    expect(ref.ok).toBe(true);
    const rm = handleRpc(c, {
      id: 5,
      method: "removeSharedRef",
      params: { toolId: "grok", toRel: "skills/x.md" },
    });
    expect(rm.ok).toBe(true);
  });
});

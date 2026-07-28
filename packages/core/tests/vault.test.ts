import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  agentDir,
  backupsDir,
  ensureVaultLayout,
  sharedDir,
} from "../src/core/vault.js";
import { readState, writeState, updateToolState } from "../src/core/state.js";

const temps: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "acv-vault-"));
  temps.push(d);
  return d;
}
afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("vault layout + state", () => {
  it("ensureVaultLayout creates dirs", () => {
    const root = tmp();
    ensureVaultLayout(root);
    expect(fs.existsSync(path.join(root, "agents"))).toBe(true);
    expect(fs.existsSync(path.join(sharedDir(root), "skills"))).toBe(true);
    expect(fs.existsSync(backupsDir(root))).toBe(true);
    expect(agentDir(root, "grok")).toBe(path.join(root, "agents", "grok"));
  });

  it("read/write state roundtrip", () => {
    const root = tmp();
    ensureVaultLayout(root);
    writeState(root, {
      vaultVersion: 1,
      settings: { vaultRoot: root, locale: "ko" },
      tools: {
        grok: {
          lastImportAt: "2026-01-01T00:00:00.000Z",
          links: [],
          sharedRefs: [],
        },
      },
    });
    const s = readState(root);
    expect(s.vaultVersion).toBe(1);
    expect(s.tools.grok.lastImportAt).toBe("2026-01-01T00:00:00.000Z");
    expect(s.settings?.locale).toBe("ko");
  });

  it("updateToolState merges", () => {
    const root = tmp();
    ensureVaultLayout(root);
    updateToolState(root, "pi", {
      links: [{ category: "skills", target: "/t", source: "/s" }],
    });
    updateToolState(root, "pi", { lastImportAt: "x" });
    const s = readState(root);
    expect(s.tools.pi.links).toHaveLength(1);
    expect(s.tools.pi.lastImportAt).toBe("x");
  });
});

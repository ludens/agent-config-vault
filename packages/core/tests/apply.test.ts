import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAdapterToml, resolveAdapter } from "../src/adapters/load.js";
import { applyPlan, planApply } from "../src/core/apply.js";
import { unlinkTool } from "../src/core/unlink.js";
import { ensureVaultLayout, agentDir, backupsDir } from "../src/core/vault.js";

const temps: string[] = [];
function tmp(prefix = "acv-app-"): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  temps.push(d);
  return d;
}
afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

function setup() {
  const vault = tmp();
  const home = tmp("acv-home-");
  ensureVaultLayout(vault);
  const agent = agentDir(vault, "demo");
  fs.mkdirSync(agent, { recursive: true });
  fs.writeFileSync(path.join(agent, "AGENTS.md"), "vault agents\n");
  const raw = parseAdapterToml(`
id = "demo"
displayName = "Demo"
home = "~/.demo"
[categories.agents_md]
enabled = true
source = "AGENTS.md"
target = "AGENTS.md"
`);
  const adapter = resolveAdapter(raw, {
    homeOverride: home,
    vaultAgentDir: agent,
  });
  return { vault, home, agent, adapter };
}

describe("planApply + applyPlan + unlink", () => {
  it("create symlink when target missing", () => {
    const { vault, adapter } = setup();
    const plan = planApply(adapter);
    expect(plan[0].action).toBe("create");
    const r = applyPlan({
      vaultRoot: vault,
      adapter,
      confirm: true,
      backupTs: "20260101T000000",
      plan,
    });
    expect(r.ok).toBe(true);
    const t = adapter.categories.agents_md!.targetPath;
    expect(fs.lstatSync(t).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(t, "utf8")).toBe("vault agents\n");
  });

  it("noop when already correct symlink", () => {
    const { vault, adapter } = setup();
    applyPlan({
      vaultRoot: vault,
      adapter,
      confirm: true,
      backupTs: "t1",
    });
    const plan = planApply(adapter);
    expect(plan[0].action).toBe("noop");
  });

  it("replace real file with backup", () => {
    const { vault, home, adapter } = setup();
    const toolHome = path.join(home, ".demo");
    fs.mkdirSync(toolHome, { recursive: true });
    fs.writeFileSync(path.join(toolHome, "AGENTS.md"), "original\n");
    const plan = planApply(adapter);
    expect(plan[0].action).toBe("replace");
    applyPlan({
      vaultRoot: vault,
      adapter,
      confirm: true,
      backupTs: "20260102T000000",
      plan,
    });
    const t = adapter.categories.agents_md!.targetPath;
    expect(fs.lstatSync(t).isSymbolicLink()).toBe(true);
    const bak = path.join(
      backupsDir(vault),
      "20260102T000000",
      "demo",
      "AGENTS.md",
    );
    expect(fs.readFileSync(bak, "utf8")).toBe("original\n");
  });

  it("fix-link when symlink points elsewhere", () => {
    const { vault, home, adapter } = setup();
    const toolHome = path.join(home, ".demo");
    fs.mkdirSync(toolHome, { recursive: true });
    fs.symlinkSync("/tmp/other-place", path.join(toolHome, "AGENTS.md"));
    const plan = planApply(adapter);
    expect(plan[0].action).toBe("fix-link");
    applyPlan({
      vaultRoot: vault,
      adapter,
      confirm: true,
      backupTs: "t3",
      plan,
    });
    expect(
      fs.readlinkSync(adapter.categories.agents_md!.targetPath),
    ).toBe(adapter.categories.agents_md!.sourcePath);
  });

  it("missing-source when vault file absent", () => {
    const { adapter, agent } = setup();
    fs.rmSync(path.join(agent, "AGENTS.md"));
    const plan = planApply(adapter);
    expect(plan[0].action).toBe("missing-source");
  });

  it("unlink restores backup", () => {
    const { vault, home, adapter } = setup();
    const toolHome = path.join(home, ".demo");
    fs.mkdirSync(toolHome, { recursive: true });
    fs.writeFileSync(path.join(toolHome, "AGENTS.md"), "original\n");
    applyPlan({
      vaultRoot: vault,
      adapter,
      confirm: true,
      backupTs: "20260103T000000",
    });
    const u = unlinkTool({ vaultRoot: vault, adapter });
    expect(u.ok).toBe(true);
    const t = adapter.categories.agents_md!.targetPath;
    expect(fs.lstatSync(t).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(t, "utf8")).toBe("original\n");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addSharedRef,
  listShared,
  removeSharedRef,
} from "../src/core/shared-ref.js";
import { ensureVaultLayout, sharedDir, agentDir } from "../src/core/vault.js";
import { readState } from "../src/core/state.js";

const temps: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "acv-sh-"));
  temps.push(d);
  return d;
}
afterEach(() => {
  for (const d of temps.splice(0)) {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

describe("shared-ref", () => {
  it("listShared walks tree", () => {
    const vault = tmp();
    ensureVaultLayout(vault);
    fs.writeFileSync(
      path.join(sharedDir(vault), "skills", "foo.md"),
      "x\n",
    );
    const list = listShared(vault);
    expect(list.some((e) => e.rel === "skills/foo.md")).toBe(true);
  });

  it("addSharedRef creates symlink and state", () => {
    const vault = tmp();
    ensureVaultLayout(vault);
    fs.writeFileSync(
      path.join(sharedDir(vault), "skills", "common.md"),
      "shared\n",
    );
    fs.mkdirSync(agentDir(vault, "grok"), { recursive: true });
    addSharedRef(vault, "grok", "skills/common.md", "skills/common.md");
    const link = path.join(agentDir(vault, "grok"), "skills", "common.md");
    expect(fs.lstatSync(link).isSymbolicLink()).toBe(true);
    expect(fs.readFileSync(link, "utf8")).toBe("shared\n");
    expect(readState(vault).tools.grok.sharedRefs).toEqual([
      { from: "skills/common.md", to: "skills/common.md" },
    ]);
  });

  it("removeSharedRef unlinks", () => {
    const vault = tmp();
    ensureVaultLayout(vault);
    fs.writeFileSync(
      path.join(sharedDir(vault), "skills", "common.md"),
      "shared\n",
    );
    fs.mkdirSync(agentDir(vault, "grok"), { recursive: true });
    addSharedRef(vault, "grok", "skills/common.md", "skills/common.md");
    removeSharedRef(vault, "grok", "skills/common.md");
    const link = path.join(agentDir(vault, "grok"), "skills", "common.md");
    expect(fs.existsSync(link)).toBe(false);
    expect(readState(vault).tools.grok.sharedRefs).toEqual([]);
  });

  it("rejects path traversal", () => {
    const vault = tmp();
    ensureVaultLayout(vault);
    expect(() =>
      addSharedRef(vault, "grok", "../etc/passwd", "x"),
    ).toThrow(/escapes/);
  });
});

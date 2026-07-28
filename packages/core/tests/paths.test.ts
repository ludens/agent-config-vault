import { describe, expect, it } from "vitest";
import { expandHome, isPathInside } from "../src/paths.js";
import { resolveRuntimeConfig, parseArgs } from "../src/config.js";

describe("expandHome", () => {
  it("expands ~ with override home", () => {
    expect(expandHome("~", "/tmp/home")).toBe("/tmp/home");
    expect(expandHome("~/.grok", "/tmp/home")).toBe("/tmp/home/.grok");
    expect(expandHome("~/agent/skills", "/Users/t")).toBe(
      "/Users/t/agent/skills",
    );
  });

  it("leaves absolute and relative paths alone", () => {
    expect(expandHome("/abs/path", "/tmp")).toBe("/abs/path");
    expect(expandHome("rel/path", "/tmp")).toBe("rel/path");
  });
});

describe("isPathInside", () => {
  it("detects containment", () => {
    expect(
      isPathInside("/vault/agents/grok", "/vault/agents/grok/AGENTS.md"),
    ).toBe(true);
    expect(isPathInside("/vault/agents/grok", "/vault/agents/other/x")).toBe(
      false,
    );
    expect(isPathInside("/vault", "/vault")).toBe(true);
  });
});

describe("resolveRuntimeConfig", () => {
  it("defaults vault to package root and locale en", () => {
    const c = resolveRuntimeConfig([], {}, undefined, "/pkg");
    expect(c).toEqual({ vaultRoot: "/pkg", locale: "en" });
  });

  it("priority: flags > env > settings", () => {
    const c = resolveRuntimeConfig(
      ["--vault", "/v", "--locale", "ko"],
      { ACV_VAULT: "/env", ACV_LOCALE: "en" },
      { vaultRoot: "/s", locale: "en" },
      "/pkg",
    );
    expect(c).toEqual({ vaultRoot: "/v", locale: "ko" });
  });

  it("uses env over settings", () => {
    const c = resolveRuntimeConfig(
      [],
      { ACV_VAULT: "/env", ACV_LOCALE: "ko" },
      { vaultRoot: "/s", locale: "en" },
      "/pkg",
    );
    expect(c).toEqual({ vaultRoot: "/env", locale: "ko" });
  });

  it("uses settings over defaults", () => {
    const c = resolveRuntimeConfig(
      [],
      {},
      { vaultRoot: "/s", locale: "ko" },
      "/pkg",
    );
    expect(c).toEqual({ vaultRoot: "/s", locale: "ko" });
  });

  it("parseArgs reads equals form", () => {
    expect(parseArgs(["--vault=/v", "--locale=ko"])).toEqual({
      vault: "/v",
      locale: "ko",
    });
  });
});

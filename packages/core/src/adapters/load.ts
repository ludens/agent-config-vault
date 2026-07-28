import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";
import type {
  Adapter,
  Category,
  CategoryId,
  ResolvedAdapter,
  ResolvedCategory,
} from "../types.js";
import { expandHome, join } from "../paths.js";

const CATEGORY_IDS: CategoryId[] = [
  "agents_md",
  "skills",
  "subagents",
  "mcp",
];

function asCategory(raw: unknown): Category | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const o = raw as Record<string, unknown>;
  if (typeof o.enabled !== "boolean") return undefined;
  if (typeof o.source !== "string" || typeof o.target !== "string") {
    return undefined;
  }
  return {
    enabled: o.enabled,
    source: o.source,
    target: o.target,
  };
}

export function parseAdapterToml(text: string): Adapter {
  const data = parseToml(text) as Record<string, unknown>;
  if (typeof data.id !== "string" || !data.id) {
    throw new Error("adapter missing id");
  }
  if (typeof data.displayName !== "string") {
    throw new Error(`adapter ${data.id}: missing displayName`);
  }
  if (typeof data.home !== "string") {
    throw new Error(`adapter ${data.id}: missing home`);
  }
  const categories: Adapter["categories"] = {};
  const cats = (data.categories ?? {}) as Record<string, unknown>;
  for (const id of CATEGORY_IDS) {
    const c = asCategory(cats[id]);
    if (c) categories[id] = c;
  }
  return {
    id: data.id,
    displayName: data.displayName,
    home: data.home,
    categories,
  };
}

export function loadAdapters(dir: string): Adapter[] {
  if (!fs.existsSync(dir)) return [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".toml"))
    .sort();
  const adapters: Adapter[] = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(dir, f), "utf8");
    adapters.push(parseAdapterToml(text));
  }
  return adapters;
}

export type ResolveOpts = {
  homeOverride?: string;
  vaultAgentDir: string;
};

export function resolveAdapter(
  adapter: Adapter,
  opts: ResolveOpts,
): ResolvedAdapter {
  const homePath = expandHome(adapter.home, opts.homeOverride);
  const categories: ResolvedAdapter["categories"] = {};
  for (const id of CATEGORY_IDS) {
    const cat = adapter.categories[id];
    if (!cat) continue;
    const resolved: ResolvedCategory = {
      ...cat,
      sourcePath: join(opts.vaultAgentDir, cat.source),
      targetPath: join(homePath, cat.target),
    };
    categories[id] = resolved;
  }
  return {
    id: adapter.id,
    displayName: adapter.displayName,
    home: adapter.home,
    homePath,
    categories,
  };
}

export function packageAdaptersDir(packageRoot: string): string {
  return path.join(packageRoot, "adapters");
}

/** Copy default adapters into vault if missing. */
export function ensureVaultAdapters(
  vaultRoot: string,
  packageRoot: string,
): void {
  const dest = path.join(vaultRoot, "adapters");
  fs.mkdirSync(dest, { recursive: true });
  const src = packageAdaptersDir(packageRoot);
  if (!fs.existsSync(src)) return;
  for (const f of fs.readdirSync(src).filter((x) => x.endsWith(".toml"))) {
    const d = path.join(dest, f);
    if (!fs.existsSync(d)) {
      fs.copyFileSync(path.join(src, f), d);
    }
  }
}

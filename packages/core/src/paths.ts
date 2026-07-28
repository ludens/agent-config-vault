import path from "node:path";
import os from "node:os";

/** Expand leading ~ to home. Optional homeOverride for tests. */
export function expandHome(p: string, home?: string): string {
  if (!p.startsWith("~")) return p;
  const h = home ?? os.homedir();
  if (p === "~") return h;
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return path.join(h, p.slice(2));
  }
  // ~user not supported — leave as-is
  return p;
}

export function join(...parts: string[]): string {
  return path.join(...parts);
}

export function resolve(...parts: string[]): string {
  return path.resolve(...parts);
}

/** True if child is inside parent (after resolve). */
export function isPathInside(parent: string, child: string): boolean {
  const p = path.resolve(parent);
  const c = path.resolve(child);
  if (p === c) return true;
  const rel = path.relative(p, c);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

import fs from "node:fs";
import path from "node:path";
import type {
  CategoryStatus,
  ResolvedAdapter,
  ToolStatus,
} from "../types.js";

function sameLinkTarget(linkPath: string, sourcePath: string): boolean {
  try {
    const raw = fs.readlinkSync(linkPath);
    const resolved = path.isAbsolute(raw)
      ? path.normalize(raw)
      : path.normalize(path.resolve(path.dirname(linkPath), raw));
    return resolved === path.normalize(sourcePath);
  } catch {
    return false;
  }
}

export function statusTool(adapter: ResolvedAdapter): ToolStatus {
  const categories: CategoryStatus[] = [];
  for (const [catId, cat] of Object.entries(adapter.categories)) {
    if (!cat) continue;
    if (!cat.enabled) {
      categories.push({ category: catId, status: "disabled" });
      continue;
    }
    const { sourcePath, targetPath } = cat;
    if (!fs.existsSync(sourcePath)) {
      categories.push({
        category: catId,
        status: "missing-source",
        sourcePath,
        targetPath,
        detail: "vault source missing",
      });
      continue;
    }
    try {
      const st = fs.lstatSync(targetPath);
      if (st.isSymbolicLink()) {
        if (sameLinkTarget(targetPath, sourcePath)) {
          categories.push({
            category: catId,
            status: "linked",
            sourcePath,
            targetPath,
          });
        } else {
          categories.push({
            category: catId,
            status: "drift",
            sourcePath,
            targetPath,
            detail: "symlink points elsewhere or is broken",
          });
        }
      } else {
        categories.push({
          category: catId,
          status: "unlinked",
          sourcePath,
          targetPath,
          detail: "real file/dir at target",
        });
      }
    } catch {
      categories.push({
        category: catId,
        status: "unlinked",
        sourcePath,
        targetPath,
        detail: "target missing",
      });
    }
  }

  const active = categories.filter((c) => c.status !== "disabled");
  if (active.length === 0) {
    return { overall: "unlinked", categories };
  }
  const linked = active.filter((c) => c.status === "linked").length;
  const drift = active.filter((c) => c.status === "drift").length;

  let overall: ToolStatus["overall"];
  if (drift > 0) overall = "drift";
  else if (linked === active.length) overall = "linked";
  else if (linked === 0) overall = "unlinked";
  else overall = "partial";

  return { overall, categories };
}

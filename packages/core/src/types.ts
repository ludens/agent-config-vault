export type CategoryId = "agents_md" | "skills" | "subagents" | "mcp";

export type Category = {
  enabled: boolean;
  source: string;
  target: string;
};

export type Adapter = {
  id: string;
  displayName: string;
  home: string;
  categories: Partial<Record<CategoryId, Category>>;
};

export type ResolvedCategory = Category & {
  sourcePath: string;
  targetPath: string;
};

export type ResolvedAdapter = Omit<Adapter, "categories"> & {
  homePath: string;
  categories: Partial<Record<CategoryId, ResolvedCategory>>;
};

export type LinkRecord = {
  category: string;
  target: string;
  source: string;
};

export type SharedRefRecord = {
  from: string;
  to: string;
};

export type ToolState = {
  lastImportAt?: string;
  links: LinkRecord[];
  sharedRefs: SharedRefRecord[];
};

export type VaultSettings = {
  vaultRoot?: string;
  locale?: string;
};

export type VaultState = {
  vaultVersion: 1;
  settings?: VaultSettings;
  tools: Record<string, ToolState>;
};

export type PlanAction =
  | "create"
  | "replace"
  | "fix-link"
  | "noop"
  | "missing-source";

export type PlanItem = {
  category: string;
  targetPath: string;
  sourcePath: string;
  action: PlanAction;
};

export type ApplyResult = {
  ok: boolean;
  applied: PlanItem[];
  errors: { category: string; message: string }[];
};

export type ImportResult = {
  ok: boolean;
  imported: { category: string; sourcePath: string }[];
  skipped: { category: string; reason: string }[];
  errors: { category: string; message: string }[];
};

export type UnlinkResult = {
  ok: boolean;
  restored: { category: string; targetPath: string }[];
  removed: { category: string; targetPath: string }[];
  errors: { category: string; message: string }[];
};

export type CategoryStatus = {
  category: string;
  status: "linked" | "unlinked" | "drift" | "missing-source" | "disabled";
  targetPath?: string;
  sourcePath?: string;
  detail?: string;
};

export type ToolStatus = {
  overall: "linked" | "unlinked" | "partial" | "drift";
  categories: CategoryStatus[];
};

export type RuntimeConfig = {
  vaultRoot: string;
  locale: string;
};

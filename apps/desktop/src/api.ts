import { invoke } from "@tauri-apps/api/core";

export async function coreCall<T = unknown>(
  method: string,
  params?: Record<string, unknown>,
): Promise<T> {
  return invoke<T>("core_call", { method, params: params ?? {} });
}

export type ToolListItem = {
  id: string;
  displayName: string;
  home: string;
  homePath?: string;
  status: { overall: string; categories: CategoryStatus[] };
};

export type CategoryStatus = {
  category: string;
  status: string;
  targetPath?: string;
  sourcePath?: string;
  detail?: string;
};

export type ToolDetail = {
  id: string;
  displayName: string;
  home: string;
  homePath: string;
  status: { overall: string; categories: CategoryStatus[] };
  lastImportAt?: string;
  links: unknown[];
  sharedRefs: { from: string; to: string }[];
  files: string[];
};

export type PlanItem = {
  category: string;
  targetPath: string;
  sourcePath: string;
  action: string;
};

export type SharedEntry = {
  rel: string;
  abs: string;
  kind: "file" | "dir";
};

export type Settings = {
  vaultRoot: string;
  locale: string;
  settings: { vaultRoot?: string; locale?: string };
};

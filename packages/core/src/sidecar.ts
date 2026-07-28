/**
 * Stdio newline-delimited JSON-RPC sidecar for the desktop app.
 * One request JSON per line on stdin → one response JSON per line on stdout.
 */
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";
import { resolveRuntimeConfig } from "./config.js";
import { readState } from "./core/state.js";
import { ensureVaultLayout } from "./core/vault.js";
import { ensureVaultAdapters } from "./adapters/load.js";
import { handleRpc, type RpcRequest, type SidecarContext } from "./rpc.js";

const thisDir = path.dirname(fileURLToPath(import.meta.url));

function fsExists(p: string): boolean {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

/**
 * packageRoot holds default adapters/ (and monorepo layout in dev).
 * Priority: ACV_PACKAGE_ROOT > monorepo guess from this file path >
 * dirname of bundled sidecar (resources/).
 */
function resolvePackageRoot(): string {
  if (process.env.ACV_PACKAGE_ROOT) {
    return path.resolve(process.env.ACV_PACKAGE_ROOT);
  }
  // Dev: packages/core/src/sidecar.ts → monorepo root
  const monorepoGuess = path.resolve(thisDir, "../../..");
  if (
    fsExists(path.join(monorepoGuess, "pnpm-workspace.yaml")) &&
    fsExists(path.join(monorepoGuess, "adapters"))
  ) {
    return monorepoGuess;
  }
  // Bundled: resources/sidecar.mjs next to resources/adapters
  if (fsExists(path.join(thisDir, "adapters"))) {
    return thisDir;
  }
  return monorepoGuess;
}

function main() {
  const packageRoot = resolvePackageRoot();
  const preliminary = resolveRuntimeConfig(
    process.argv.slice(2),
    process.env,
    undefined,
    packageRoot,
  );
  let state = readState(preliminary.vaultRoot);
  const cfg = resolveRuntimeConfig(
    process.argv.slice(2),
    process.env,
    state.settings,
    packageRoot,
  );
  if (cfg.vaultRoot !== preliminary.vaultRoot) {
    state = readState(cfg.vaultRoot);
  }

  ensureVaultLayout(cfg.vaultRoot);
  ensureVaultAdapters(cfg.vaultRoot, packageRoot);

  const ctx: SidecarContext = {
    vaultRoot: cfg.vaultRoot,
    packageRoot,
  };

  // ready signal for host
  process.stderr.write(
    `[acv-sidecar] ready vault=${ctx.vaultRoot} locale=${cfg.locale}\n`,
  );

  const rl = readline.createInterface({
    input: process.stdin,
    crlfDelay: Infinity,
  });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let req: RpcRequest;
    try {
      req = JSON.parse(trimmed) as RpcRequest;
    } catch {
      process.stdout.write(
        JSON.stringify({
          id: null,
          ok: false,
          error: "invalid JSON",
        }) + "\n",
      );
      return;
    }
    if (req.id === undefined || req.id === null || !req.method) {
      process.stdout.write(
        JSON.stringify({
          id: req?.id ?? null,
          ok: false,
          error: "id and method required",
        }) + "\n",
      );
      return;
    }
    const res = handleRpc(ctx, req);
    process.stdout.write(JSON.stringify(res) + "\n");
  });
}

main();

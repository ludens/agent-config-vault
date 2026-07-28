import path from "node:path";
import type { RuntimeConfig, VaultSettings } from "./types.js";

const DEFAULT_LOCALE = "en";

export function parseArgs(argv: string[]): {
  vault?: string;
  locale?: string;
} {
  const out: { vault?: string; locale?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--vault" && argv[i + 1]) {
      out.vault = argv[++i];
    } else if (a === "--locale" && argv[i + 1]) {
      out.locale = argv[++i];
    } else if (a.startsWith("--vault=")) {
      out.vault = a.slice("--vault=".length);
    } else if (a.startsWith("--locale=")) {
      out.locale = a.slice("--locale=".length);
    }
  }
  return out;
}

/**
 * Priority: CLI flags > env ACV_* > settings > defaults.
 * vaultRoot default: packageRoot (monorepo/package root when started).
 */
export function resolveRuntimeConfig(
  argv: string[],
  env: NodeJS.ProcessEnv,
  settings?: VaultSettings,
  packageRoot = process.cwd(),
): RuntimeConfig {
  const flags = parseArgs(argv);
  const vaultRoot = path.resolve(
    flags.vault ?? env.ACV_VAULT ?? settings?.vaultRoot ?? packageRoot,
  );
  const locale =
    flags.locale ?? env.ACV_LOCALE ?? settings?.locale ?? DEFAULT_LOCALE;
  return { vaultRoot, locale };
}

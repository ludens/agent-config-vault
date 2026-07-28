# agent-config-vault

Desktop app (Tauri 2 + React) to manage AI agent configs (Grok, Pi, OpenCode, Claude Code, Codex) in one **vault**, then **apply** them to tool homes via **symlinks**.

Domain logic lives in `@agent-config-vault/core` (Node). The desktop shell talks to a **stdio JSON-RPC sidecar** that runs that package.

## Requirements

- Node.js 20+
- pnpm 9+
- Rust toolchain (for Tauri): `rustc` / `cargo`
- macOS or Windows (symlink apply on Windows needs Developer Mode or admin; junctions not supported in MVP)

## Install

```bash
pnpm install
```

## Run (desktop, development)

```bash
pnpm dev:desktop
# equivalent: pnpm --filter desktop tauri dev
```

### How the sidecar is launched (dev)

Rust spawns:

```text
node packages/core/node_modules/tsx/dist/cli.mjs packages/core/src/sidecar.ts
```

with monorepo root as cwd and `ACV_VAULT` defaulting to that root. The monorepo root is found by walking parents for `packages/core/src/sidecar.ts` + `pnpm-workspace.yaml`.

### Production build notes

```bash
pnpm build:desktop
# prepares resources (bundled sidecar.mjs + adapters) then tauri build
```

- macOS: `.app` / `.dmg` under `apps/desktop/src-tauri/target/release/bundle/`
- Windows: `.msi` / NSIS `.exe` under the same `bundle/` tree
- Packaged app spawns **Node** with `resources/sidecar.mjs` — **Node 20+ must be on PATH**
- Packaged default vault: `~/.agent-config-vault` (override with Settings / `ACV_VAULT`)
- Windows: symlink create may need Developer Mode or admin
- Signing / notarization: not configured (add secrets when you ship publicly)

### CI (GitHub Actions)

Workflow: [`.github/workflows/desktop-build.yml`](.github/workflows/desktop-build.yml)

| Trigger | What happens |
|---------|----------------|
| `workflow_dispatch` (manual) | Test + build macOS aarch64 + Windows x64 → **Artifacts** |
| Push tag `v*` (e.g. `v2026.07.28.0`) | Same + **draft GitHub Release** with files attached |

Artifacts:

- `agent-config-vault-macos-aarch64`
- `agent-config-vault-windows-x64`

### Versioning (CalVer)

Format: **`YYYY.MM.DD.N`** (timezone: release operator local date; this project uses KST when releasing from the author machine).

- First release of the day: `N = 0`
- Same day again: `N = 1`, `2`, …
- Git tags: `vYYYY.MM.DD.N` (e.g. `v2026.07.28.0`)

```bash
# local tag release flow
git tag v2026.07.28.0
git push origin v2026.07.28.0
```

## Core only (tests / sidecar)

```bash
pnpm test
# or
pnpm --filter @agent-config-vault/core test

pnpm sidecar
# runs packages/core stdio RPC (newline JSON)
```

## Workflow

1. **Import** — copy tool home files into `agents/<id>/` (original formats).
2. **Edit** — change vault files in the app.
3. **Apply preview** — dry-run plan (create / replace / fix-link / noop / missing-source).
4. **Confirm apply** — backup real files under `backups/<ts>/`, then symlink tool paths → vault.
5. **Unlink** — remove vault symlinks and restore latest backup when present.
6. **Shared** — put common assets under `shared/` and reference them into an agent tree (vault-internal symlinks).

## Vault layout

```
shared/{skills,mcp,subagents,agents-md}/
agents/{grok,pi,opencode,claude-code,codex}/
adapters/*.toml
backups/<timestamp>/
state.json
```

Default adapters ship in repo-root `adapters/` and are copied into the vault on first ensure if missing.

## Settings

- **Vault path** only (plus UI **locale** ko/en).
- No host/port — the old Hono web UI was removed.
- Priority for vault: CLI `--vault` / env `ACV_VAULT` / `state.json` settings / monorepo root default.
- Locale: Settings override or system language; env `ACV_LOCALE` / `--locale` for sidecar.

## Architecture

```
React (i18n ko/en)
  → tauri invoke core_call(method, params)
  → Rust thin proxy (spawn + newline JSON-RPC)
  → Node sidecar (packages/core)
  → vault / adapters / import / apply / unlink / drift / shared-ref
```

RPC methods: `ensureVault`, `listTools`, `getTool`, `readFile`, `writeFile`, `importTool`, `planApply`, `applyTool`, `unlinkTool`, `listShared`, `writeSharedFile`, `addSharedRef`, `removeSharedRef`, `getSettings`, `setSettings`.

## Safety

- Apply goes through preview confirmation in the UI.
- Existing real files are moved to `backups/` before symlink replace.
- Correct existing vault symlink → noop.
- File read/write is path-jailed under the agent (or shared) root.
- MCP / config-like files prefer mode `0600`.
- **Tests never touch real `~/.grok` etc.** — temp dirs + `homeOverride` only.

## Monorepo layout

```
packages/core/     # domain + sidecar + vitest
apps/desktop/      # Tauri 2 + React + Vite + i18next
adapters/          # default tool path adapters (copied into vault)
```

## Non-goals (MVP)

CLI product, format conversion between tools, plugins, cloud sync, multi-user, Windows junctions, auth, embedding a full Node runtime inside the installer (system Node required for now).

## License

Private / local tooling.

# AGENTS.md

Non-discoverable landmines only. Stack, layout, RPC list, and commands: read `README.md`.

## Docs authority

- Prefer `README.md` + `docs/superpowers/specs/2026-07-28-agent-config-vault-design.md` over `docs/superpowers/plans/2026-07-28-agent-config-vault.md`.
- The plan still describes the **retired Hono web UI** (host/port). Do not resurrect HTTP server or bind settings.

## Safety (apply / unlink)

- Apply/unlink create real symlinks under each adapter `home` (`~/.grok`, `~/.pi/agent`, …).
- **Dev default vault = monorepo root** (not `~/.agent-config-vault`). Desktop Apply against seed adapters can mutate the developer’s real tool homes.
- Tests: temp vault + `homeOverride` (temp home) only. Never apply/unlink real `~/.*` agent dirs in tests or casual verification.

## Adapter seed vs vault copy

- Repo-root `adapters/*.toml` is **seed only**. `ensureVaultAdapters` copies into `<vault>/adapters/` **only if the dest file is missing**.
- Runtime loads **vault** adapters. Editing seed TOML does not refresh an existing vault copy — delete the vault file or edit the vault copy.
- Seed location comes from `ACV_PACKAGE_ROOT` / monorepo root / packaged `resources/`; vault from `ACV_VAULT` / settings / defaults.

## Domain vs shell

- Business logic lives in `packages/core` only. Rust (`apps/desktop/src-tauri`) is a thin stdio JSON-RPC proxy; do not reimplement import/apply/drift there.
- Packaged app needs **system Node 20+ on PATH** for the bundled `sidecar.mjs` (not embedded).

## Generated resources (do not commit / hand-edit)

- `apps/desktop/src-tauri/resources/sidecar.mjs` and `.../resources/adapters/` are produced by `scripts/prepare-desktop-resources.mjs` (also via `beforeBuildCommand` / `pnpm build:desktop`). Gitignored; regenerate instead of editing.

## UI i18n

- User-facing strings: update **both** `apps/desktop/src/locales/en.json` and `ko.json` (no i18n lint).

## Version surfaces (release)

- Same SemVer string in: root / `packages/core` / `apps/desktop` `package.json`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src-tauri/Cargo.toml`. Tag `vMAJOR.MINOR.PATCH`.

# agent-config-vault Design

**Date:** 2026-07-28  
**Status:** Approved  
**Approach:** Vault + path adapters + symlink apply

## Problem

AI agent configs (Grok, Pi, OpenCode, Claude Code, Codex) are scattered under home directories. Manage **AGENTS.md / SOUL.md**, **MCP**, **Skills**, and **subagents** in one vault, with per-agent full copies plus optional shared references, applied via **symlinks**.

## Goals (MVP)

1. Five tool adapters resolve documented default paths.
2. Import → edit → Apply (symlink) → Unlink (restore backup) works in temp-dir tests.
3. Dashboard shows linked / unlinked / drift.
4. Shared assets can be referenced into an agent tree.
5. Apply requires dry-run preview confirmation.

## Non-goals (MVP)

CLI, format conversion, plugins, cloud sync, multi-user, Windows junctions, auth.

## Architecture

- **SSOT:** files under vault (original formats; no conversion).
- **Adapters:** path/filename/category support only.
- **Apply:** symlink tool home paths → vault agent paths.
- **Stack (current):** monorepo — `packages/core` (Node domain + stdio JSON-RPC sidecar) + `apps/desktop` (Tauri 2 + React + Vite + i18next ko/en).
- **Settings:** vault path + locale only (no host/port).
- **Retired (2026-07-28):** Hono web UI / HTTP server (`src/web/**`, host/port bind). Use the desktop app instead.

## Vault layout

```
shared/{skills,mcp,subagents,agents-md}/
agents/{grok,pi,opencode,claude-code,codex}/
adapters/*.toml
backups/<timestamp>/
state.json
```

## Customization model

Each `agents/<tool>/` is a full independent copy after import. Optional shared refs: vault-internal symlink from `shared/...` into `agents/<tool>/...`.

## Safety

- Dry-run plan before Apply.
- Real files moved to `backups/<ts>/` before replace with symlink.
- Correct existing vault symlink → no-op.
- Broken symlink → replace.
- MCP secrets stored as-is; GUI masks display; prefer mode `0600`.
- No auth (local desktop process + sidecar only).

## Adapter categories

`agents_md`, `skills`, `subagents`, `mcp` — each `enabled` + `source` (under vault agent dir) + `target` (under tool home).

## Known default homes (macOS probe 2026-07-28)

| Tool | Home | Notes |
|------|------|--------|
| grok | `~/.grok` | `AGENTS.md`; skills under `~/.grok/skills` / bundled |
| pi | `~/.pi/agent` | `AGENTS.md`, `skills/` |
| opencode | `~/.config/opencode` | `AGENTS.md`, `agents/`, `skills/`, `opencode.json` |
| claude-code | `~/.claude` | sparse on this machine; settings.json; enable categories when paths exist |
| codex | `~/.codex` | config.toml dominant; categories best-effort / unsupported flags OK |

## Modules

`adapters`, `vault`, `import`, `apply`, `unlink`, `drift`, `shared-ref`, `state`, `rpc`/`sidecar`, desktop UI.

## Testing

Unit: home expand, resolve, dry-run plan. Integration: temp home + vault full cycle. Drift + shared-ref cases.

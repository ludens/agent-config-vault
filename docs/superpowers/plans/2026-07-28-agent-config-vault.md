# agent-config-vault Implementation Plan

> **For agentic workers:** Implement task-by-task. Checkboxes track progress. Spec: `docs/superpowers/specs/2026-07-28-agent-config-vault-design.md`.

**Goal:** Local web GUI (pnpm/Node + Hono) that manages AGENTS.md, MCP, skills, subagents in a vault and applies them to Grok/Pi/OpenCode/Claude Code/Codex via symlinks.

**Architecture:** Vault SSOT + TOML path adapters + dry-run apply (backup then symlink). Per-agent full trees under `agents/<id>/`, optional `shared/` refs as vault-internal symlinks.

**Tech Stack:** Node 20+, pnpm, TypeScript, Hono (`@hono/node-server`), `smol-toml` or `@iarna/toml`, vitest, server-rendered HTML.

## Global Constraints

- macOS first; no Windows junction code.
- No format conversion between tools.
- Default bind `127.0.0.1:3847`; host/port via `--host`/`--port`, `ACV_HOST`/`ACV_PORT`, or `settings.json`.
- Vault root default: package root (repo). Override: `ACV_VAULT` or settings.
- Secrets: write sensitive files mode 0o600; mask common key patterns in HTML view.
- YAGNI: no CLI product, no auth, no cloud.
- Tests must not touch real `~/.grok` etc.; use temp dirs + adapter home override.

## File map

```
package.json
tsconfig.json
vitest.config.ts
.gitignore
README.md
adapters/*.toml          # default tool adapters (copied to vault on init if missing)
src/
  index.ts               # entry: parse args, load settings, start server
  config.ts              # host/port/vault resolve
  types.ts
  paths.ts               # expandHome, join, resolve
  adapters/load.ts       # load + resolve adapters
  core/vault.ts
  core/state.ts
  core/import.ts
  core/apply.ts
  core/unlink.ts
  core/drift.ts
  core/shared-ref.ts
  web/app.ts             # Hono app
  web/html.ts            # layout helpers
  web/routes/*.ts
tests/
  paths.test.ts
  apply.test.ts
  import.test.ts
  drift.test.ts
  shared-ref.test.ts
```

---

### Task 1: Scaffold + config

**Files:** package.json, tsconfig.json, vitest.config.ts, .gitignore, src/config.ts, src/index.ts, src/types.ts, src/paths.ts, tests/paths.test.ts

**Produces:**
- `expandHome(p: string, home?: string): string`
- `resolveBindConfig(argv, env, settings): { host, port, vaultRoot }`
- `pnpm dev` / `pnpm start` / `pnpm test`

- [ ] Init pnpm TypeScript project (type: module), deps: hono, @hono/node-server, smol-toml; dev: typescript, tsx, vitest, @types/node
- [ ] Implement paths + config with tests
- [ ] Minimal Hono server returning "ok" on GET /
- [ ] .gitignore: node_modules, dist, backups/, state.json optional, .DS_Store, agents/* content maybe keep dirs via .gitkeep

---

### Task 2: Adapters

**Files:** adapters/*.toml, src/adapters/load.ts, tests/adapters.test.ts

**Adapter shape:**
```ts
type CategoryId = 'agents_md' | 'skills' | 'subagents' | 'mcp';
type Category = { enabled: boolean; source: string; target: string };
type Adapter = {
  id: string;
  displayName: string;
  home: string; // may contain ~
  categories: Partial<Record<CategoryId, Category>>;
};
type ResolvedAdapter = Adapter & {
  homePath: string;
  categories: Partial<Record<CategoryId, Category & { sourcePath: string; targetPath: string }>>;
};
```

**Default adapters (best-effort):**

| id | home | agents_md | skills | subagents | mcp |
|----|------|-----------|--------|-----------|-----|
| grok | ~/.grok | AGENTS.md | skills | (disabled or bundled/agents) | (disabled if unknown) |
| pi | ~/.pi/agent | AGENTS.md | skills | (disabled) | (disabled) |
| opencode | ~/.config/opencode | AGENTS.md | skills | agents | opencode.json |
| claude-code | ~/.claude | (disabled or CLAUDE.md if used) | skills if path | agents | settings.json partial — prefer enabled only for known |
| codex | ~/.codex | (disabled) | (disabled) | (disabled) | config.toml optional enabled |

For claude-code/codex sparse machines: mark unsupported categories `enabled = false`.

**Produces:** `loadAdapters(dir): Adapter[]`, `resolveAdapter(a, opts?: { homeOverride?, vaultAgentDir }): ResolvedAdapter`

- [ ] Write TOMLs + loader + unit tests with fake homes

---

### Task 3: Vault + state

**Files:** src/core/vault.ts, src/core/state.ts, tests/vault.test.ts

**Produces:**
- `ensureVaultLayout(root)`
- `agentDir(root, toolId)`, `sharedDir(root)`, `backupsDir(root)`
- `readState/writeState` for:
```ts
type VaultState = {
  vaultVersion: 1;
  settings?: { host?: string; port?: number };
  tools: Record<string, {
    lastImportAt?: string;
    links: { category: string; target: string; source: string }[];
    sharedRefs: { from: string; to: string }[];
  }>;
};
```

---

### Task 4: Import

**Files:** src/core/import.ts, tests/import.test.ts

**Produces:** `importTool({ vaultRoot, adapter: ResolvedAdapter, mode: 'overwrite' | 'skip' }): ImportResult`

- Copy each enabled category targetPath → sourcePath under agents/<id>/
- If source exists and mode skip, leave; overwrite replaces
- Follow symlinks when copying (copy real content once)
- Update state lastImportAt

---

### Task 5: Apply + Unlink + Drift

**Files:** src/core/apply.ts, src/core/unlink.ts, src/core/drift.ts, tests/apply.test.ts, tests/drift.test.ts

**Produces:**
```ts
type PlanItem = {
  category: string;
  targetPath: string;
  sourcePath: string;
  action: 'create' | 'replace' | 'fix-link' | 'noop' | 'missing-source';
};
planApply(...): PlanItem[]
applyPlan(..., { confirm: true, backupTs: string }): ApplyResult
unlinkTool(...): UnlinkResult
statusTool(...): { overall: 'linked' | 'unlinked' | 'partial' | 'drift'; categories: ... }
```

Rules:
- missing vault source → missing-source (skip on apply or error item)
- target is symlink to source → noop
- target is symlink elsewhere or broken → fix-link
- target is real file/dir → replace (move to backups/<ts>/<tool>/<rel>)
- apply only when caller passes confirm after dry-run

---

### Task 6: Shared ref

**Files:** src/core/shared-ref.ts, tests/shared-ref.test.ts

**Produces:**
- `listShared(vaultRoot)`
- `addSharedRef(vaultRoot, toolId, fromRel, toRelUnderAgent)` — creates symlink inside agents tree
- `removeSharedRef(...)`
- update state.sharedRefs

---

### Task 7: Web GUI

**Files:** src/web/app.ts, src/web/html.ts, src/web/routes/*.ts

**Routes:**
- `GET /` dashboard — tool cards + status
- `GET /agents/:id` detail — categories, file list, edit forms
- `GET|POST /agents/:id/file` read/write vault file (path query constrained under agent dir)
- `POST /agents/:id/import` body mode
- `POST /agents/:id/apply/preview` → HTML table of plan
- `POST /agents/:id/apply` confirm
- `POST /agents/:id/unlink`
- `GET /shared` + POST create/ref/remove
- `GET|POST /settings` host/port/vault display (restart note for host/port)

Security: path traversal reject; bind warning banner if host not loopback; mask `apiKey|token|secret|password` values in JSON display.

UI: minimal clean CSS, no framework.

---

### Task 8: README + polish

- README: install (`pnpm i`), run (`pnpm dev`), host/port, safety, non-goals
- Ensure `pnpm test` green
- Ensure `pnpm dev` serves dashboard

---

## Execution note

Implement Tasks 1–8 in order. Prefer one PR-quality tree. Do not apply symlinks to the developer's real agent homes during tests.

use serde_json::{json, Value};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::Mutex;

pub struct Sidecar {
    child: Child,
    stdin: ChildStdin,
    reader: BufReader<std::process::ChildStdout>,
    next_id: u64,
}

pub struct SidecarLaunch {
    pub resource_dir: Option<PathBuf>,
}

fn looks_like_monorepo(dir: &Path) -> bool {
    dir.join("packages/core/src/sidecar.ts").is_file()
        && dir.join("pnpm-workspace.yaml").is_file()
}

/// Walk cwd and parents for monorepo root (packages/core + workspace).
pub fn find_monorepo_root() -> Option<PathBuf> {
    let mut cur = std::env::current_dir().ok()?;
    loop {
        if looks_like_monorepo(&cur) {
            return Some(cur);
        }
        for rel in ["../..", "../../.."] {
            let cand = cur.join(rel);
            if looks_like_monorepo(&cand) {
                return cand.canonicalize().ok();
            }
        }
        if !cur.pop() {
            break;
        }
    }
    None
}

fn resolve_tsx(monorepo: &Path) -> Option<PathBuf> {
    let candidates = [
        monorepo.join("packages/core/node_modules/tsx/dist/cli.mjs"),
        monorepo.join("node_modules/tsx/dist/cli.mjs"),
        monorepo.join("apps/desktop/node_modules/tsx/dist/cli.mjs"),
    ];
    candidates.into_iter().find(|c| c.is_file())
}

fn default_user_vault() -> PathBuf {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    home.join(".agent-config-vault")
}

fn node_bin() -> PathBuf {
    std::env::var_os("ACV_NODE")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("node"))
}

impl Sidecar {
    pub fn spawn(launch: &SidecarLaunch) -> Result<Self, String> {
        let mut cmd = Command::new(node_bin());
        let package_root: PathBuf;
        let vault_default: PathBuf;
        let cwd: PathBuf;

        if let Some(monorepo) = find_monorepo_root() {
            // Dev: tsx + TypeScript source
            let tsx = resolve_tsx(&monorepo)
                .ok_or_else(|| "tsx not found; run pnpm install at monorepo root".to_string())?;
            let script = monorepo.join("packages/core/src/sidecar.ts");
            if !script.is_file() {
                return Err(format!("sidecar missing: {}", script.display()));
            }
            cmd.arg(&tsx).arg(&script);
            package_root = monorepo.clone();
            vault_default = monorepo.clone();
            cwd = monorepo;
        } else if let Some(res) = launch.resource_dir.as_ref() {
            // Packaged: bundled resources/sidecar.mjs
            let script = res.join("sidecar.mjs");
            if !script.is_file() {
                return Err(format!(
                    "packaged sidecar missing: {} (Node required on PATH)",
                    script.display()
                ));
            }
            cmd.arg(&script);
            package_root = res.clone();
            vault_default = default_user_vault();
            cwd = res.clone();
        } else {
            return Err(
                "sidecar launch failed: monorepo not found and no resource_dir".into(),
            );
        }

        let vault = std::env::var("ACV_VAULT").unwrap_or_else(|_| {
            vault_default.to_string_lossy().into_owned()
        });

        let mut child = cmd
            .current_dir(&cwd)
            .env("ACV_PACKAGE_ROOT", package_root.to_string_lossy().as_ref())
            .env("ACV_VAULT", &vault)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| {
                format!(
                    "spawn sidecar (need Node.js on PATH): {e}"
                )
            })?;

        let stdin = child.stdin.take().ok_or("sidecar stdin")?;
        let stdout = child.stdout.take().ok_or("sidecar stdout")?;
        let reader = BufReader::new(stdout);

        let mut s = Self {
            child,
            stdin,
            reader,
            next_id: 1,
        };
        let _ = s.call("ensureVault", json!({}))?;
        Ok(s)
    }

    pub fn call(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = self.next_id;
        self.next_id += 1;
        let req = json!({
            "id": id,
            "method": method,
            "params": if params.is_null() { json!({}) } else { params },
        });
        let line = serde_json::to_string(&req).map_err(|e| e.to_string())?;
        writeln!(self.stdin, "{line}").map_err(|e| format!("write sidecar: {e}"))?;
        self.stdin.flush().map_err(|e| e.to_string())?;

        let mut buf = String::new();
        self.reader
            .read_line(&mut buf)
            .map_err(|e| format!("read sidecar: {e}"))?;
        if buf.trim().is_empty() {
            return Err("sidecar closed stdout".into());
        }
        let res: Value = serde_json::from_str(buf.trim()).map_err(|e| {
            format!("invalid sidecar JSON: {e}; line={}", buf.trim())
        })?;
        if res.get("ok").and_then(|v| v.as_bool()) == Some(true) {
            Ok(res.get("result").cloned().unwrap_or(Value::Null))
        } else {
            Err(res
                .get("error")
                .and_then(|v| v.as_str())
                .unwrap_or("sidecar error")
                .to_string())
        }
    }
}

impl Drop for Sidecar {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

pub struct SidecarState {
    pub launch: SidecarLaunch,
    pub child: Mutex<Option<Sidecar>>,
}

pub fn with_sidecar<F, T>(state: &SidecarState, f: F) -> Result<T, String>
where
    F: FnOnce(&mut Sidecar) -> Result<T, String>,
{
    let mut guard = state.child.lock().map_err(|e| e.to_string())?;
    if guard.is_none() {
        *guard = Some(Sidecar::spawn(&state.launch)?);
    }
    let sc = guard.as_mut().unwrap();
    match f(sc) {
        Ok(v) => Ok(v),
        Err(e) => {
            if e.contains("read sidecar") || e.contains("write sidecar") || e.contains("closed")
            {
                *guard = None;
            }
            Err(e)
        }
    }
}

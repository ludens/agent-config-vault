import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { coreCall, type PlanItem, type ToolDetail } from "../api";
import { Badge } from "../components/Badge";

type Props = {
  toolId: string;
  onBack: () => void;
};

type View =
  | { kind: "main" }
  | { kind: "plan"; plan: PlanItem[] }
  | { kind: "result"; title: string; data: unknown }
  | { kind: "file"; path: string; content: string };

export function AgentDetail({ toolId, onBack }: Props) {
  const { t } = useTranslation();
  const [tool, setTool] = useState<ToolDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>({ kind: "main" });
  const [fileDraft, setFileDraft] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const d = await coreCall<ToolDetail>("getTool", { toolId });
      setTool(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [toolId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  if (error && !tool) {
    return (
      <div>
        <button type="button" className="secondary" onClick={onBack}>
          ← {t("agent.back")}
        </button>
        <div className="banner error">{error}</div>
      </div>
    );
  }

  if (!tool) {
    return <p className="muted">{t("common.loading")}</p>;
  }

  if (view.kind === "file") {
    return (
      <div>
        <button
          type="button"
          className="secondary"
          onClick={() => setView({ kind: "main" })}
        >
          ← {tool.displayName}
        </button>
        <h1>
          {t("agent.editFile")}: {view.path}
        </h1>
        {error && <div className="banner error">{error}</div>}
        <textarea
          value={fileDraft}
          onChange={(e) => setFileDraft(e.target.value)}
        />
        <div className="row">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await coreCall("writeFile", {
                  toolId,
                  path: view.path,
                  content: fileDraft,
                });
                setView({ kind: "result", title: t("agent.saved"), data: { path: view.path } });
                await load();
              })
            }
          >
            {t("agent.save")}
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "plan") {
    return (
      <div>
        <h1>
          {t("agent.planTitle")} — {tool.displayName}
        </h1>
        <p className="muted">{t("agent.planHint")}</p>
        {error && <div className="banner error">{error}</div>}
        <table>
          <thead>
            <tr>
              <th>{t("agent.category")}</th>
              <th>{t("agent.action")}</th>
              <th>{t("agent.target")}</th>
              <th>{t("agent.source")}</th>
            </tr>
          </thead>
          <tbody>
            {view.plan.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  —
                </td>
              </tr>
            ) : (
              view.plan.map((p) => (
                <tr key={`${p.category}-${p.targetPath}`}>
                  <td>{p.category}</td>
                  <td>
                    <code>{p.action}</code>
                  </td>
                  <td className="muted">
                    <code>{p.targetPath}</code>
                  </td>
                  <td className="muted">
                    <code>{p.sourcePath}</code>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        <div className="row">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const r = await coreCall("applyTool", {
                  toolId,
                  confirm: true,
                });
                setView({ kind: "result", title: t("agent.result"), data: r });
                await load();
              })
            }
          >
            {t("agent.applyConfirm")}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setView({ kind: "main" })}
          >
            {t("agent.applyCancel")}
          </button>
        </div>
      </div>
    );
  }

  if (view.kind === "result") {
    return (
      <div>
        <h1>{view.title}</h1>
        <pre>{JSON.stringify(view.data, null, 2)}</pre>
        <button
          type="button"
          onClick={() => {
            setView({ kind: "main" });
            void load();
          }}
        >
          ← {t("agent.back")}
        </button>
      </div>
    );
  }

  return (
    <div>
      <button type="button" className="secondary" onClick={onBack}>
        ← {t("agent.back")}
      </button>
      <h1>{tool.displayName}</h1>
      <p>
        <Badge status={tool.status.overall} />{" "}
        <span className="muted">
          {t("agent.home")} <code>{tool.homePath}</code>
        </span>
      </p>
      {tool.lastImportAt && (
        <p className="muted">
          {t("agent.lastImport")}: {tool.lastImportAt}
        </p>
      )}
      {error && <div className="banner error">{error}</div>}

      <div className="actions">
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await coreCall("importTool", {
                toolId,
                mode: "overwrite",
              });
              setView({ kind: "result", title: t("agent.result"), data: r });
              await load();
            })
          }
        >
          {t("agent.importOverwrite")}
        </button>
        <button
          type="button"
          className="secondary"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const r = await coreCall("importTool", {
                toolId,
                mode: "skip",
              });
              setView({ kind: "result", title: t("agent.result"), data: r });
              await load();
            })
          }
        >
          {t("agent.importSkip")}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              const plan = await coreCall<PlanItem[]>("planApply", { toolId });
              setView({ kind: "plan", plan });
            })
          }
        >
          {t("agent.applyPreview")}
        </button>
        <button
          type="button"
          className="danger"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(t("agent.unlinkConfirm"))) return;
            void run(async () => {
              const r = await coreCall("unlinkTool", { toolId });
              setView({ kind: "result", title: t("agent.result"), data: r });
              await load();
            });
          }}
        >
          {t("agent.unlink")}
        </button>
      </div>

      <h2>{t("agent.categories")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("agent.category")}</th>
            <th>{t("agent.status")}</th>
            <th>{t("agent.target")}</th>
            <th>{t("agent.detail")}</th>
          </tr>
        </thead>
        <tbody>
          {tool.status.categories.map((c) => (
            <tr key={c.category}>
              <td>{c.category}</td>
              <td>
                <Badge status={c.status} />
              </td>
              <td className="muted">
                <code>{c.targetPath ?? ""}</code>
              </td>
              <td className="muted">{c.detail ?? ""}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>{t("agent.files")}</h2>
      <ul>
        {tool.files.length === 0 ? (
          <li className="muted">{t("agent.noFiles")}</li>
        ) : (
          tool.files.map((f) => (
            <li key={f}>
              <a
                onClick={() =>
                  void run(async () => {
                    const r = await coreCall<{ path: string; content: string }>(
                      "readFile",
                      { toolId, path: f },
                    );
                    setFileDraft(r.content);
                    setView({ kind: "file", path: f, content: r.content });
                  })
                }
              >
                {f}
              </a>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

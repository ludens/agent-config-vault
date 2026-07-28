import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { coreCall, type SharedEntry, type ToolListItem } from "../api";

export function Shared() {
  const { t } = useTranslation();
  const [entries, setEntries] = useState<SharedEntry[]>([]);
  const [tools, setTools] = useState<ToolListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [rel, setRel] = useState("");
  const [content, setContent] = useState("");
  const [toolId, setToolId] = useState("");
  const [fromRel, setFromRel] = useState("");
  const [toRel, setToRel] = useState("");
  const [rmToolId, setRmToolId] = useState("");
  const [rmToRel, setRmToRel] = useState("");

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, toolList] = await Promise.all([
        coreCall<SharedEntry[]>("listShared"),
        coreCall<ToolListItem[]>("listTools"),
      ]);
      setEntries(list);
      setTools(toolList);
      setToolId((cur) => cur || toolList[0]?.id || "");
      setRmToolId((cur) => cur || toolList[0]?.id || "");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div>
      <h1>{t("shared.title")}</h1>
      <p className="muted">{t("shared.hint")}</p>
      {error && <div className="banner error">{error}</div>}

      <h2>{t("shared.contents")}</h2>
      <table>
        <thead>
          <tr>
            <th>{t("shared.path")}</th>
            <th>{t("shared.kind")}</th>
          </tr>
        </thead>
        <tbody>
          {entries.length === 0 ? (
            <tr>
              <td colSpan={2} className="muted">
                {t("shared.empty")}
              </td>
            </tr>
          ) : (
            entries.map((e) => (
              <tr key={e.rel}>
                <td>
                  <code>{e.rel}</code>
                </td>
                <td>{e.kind}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <h2>{t("shared.create")}</h2>
      <label>{t("shared.relPath")}</label>
      <input value={rel} onChange={(e) => setRel(e.target.value)} />
      <label>{t("shared.content")}</label>
      <textarea
        style={{ minHeight: 120 }}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="row">
        <button
          type="button"
          onClick={() =>
            void (async () => {
              try {
                await coreCall("writeSharedFile", { path: rel, content });
                setRel("");
                setContent("");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })()
          }
        >
          {t("shared.createBtn")}
        </button>
      </div>

      <h2>{t("shared.addRef")}</h2>
      <label>{t("shared.tool")}</label>
      <select value={toolId} onChange={(e) => setToolId(e.target.value)}>
        {tools.map((a) => (
          <option key={a.id} value={a.id}>
            {a.displayName}
          </option>
        ))}
      </select>
      <label>{t("shared.from")}</label>
      <input value={fromRel} onChange={(e) => setFromRel(e.target.value)} />
      <label>{t("shared.to")}</label>
      <input value={toRel} onChange={(e) => setToRel(e.target.value)} />
      <div className="row">
        <button
          type="button"
          onClick={() =>
            void (async () => {
              try {
                await coreCall("addSharedRef", { toolId, fromRel, toRel });
                setFromRel("");
                setToRel("");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })()
          }
        >
          {t("shared.link")}
        </button>
      </div>

      <h2>{t("shared.removeRef")}</h2>
      <label>{t("shared.tool")}</label>
      <select value={rmToolId} onChange={(e) => setRmToolId(e.target.value)}>
        {tools.map((a) => (
          <option key={a.id} value={a.id}>
            {a.displayName}
          </option>
        ))}
      </select>
      <label>{t("shared.toPath")}</label>
      <input value={rmToRel} onChange={(e) => setRmToRel(e.target.value)} />
      <div className="row">
        <button
          type="button"
          className="danger"
          onClick={() =>
            void (async () => {
              try {
                await coreCall("removeSharedRef", {
                  toolId: rmToolId,
                  toRel: rmToRel,
                });
                setRmToRel("");
                await load();
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })()
          }
        >
          {t("shared.remove")}
        </button>
      </div>
    </div>
  );
}

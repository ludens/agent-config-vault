import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { coreCall, type ToolListItem } from "../api";
import { Badge } from "../components/Badge";

type Props = {
  onOpenAgent: (id: string) => void;
};

export function Dashboard({ onOpenAgent }: Props) {
  const { t } = useTranslation();
  const [tools, setTools] = useState<ToolListItem[] | null>(null);
  const [vaultRoot, setVaultRoot] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      await coreCall("ensureVault");
      const settings = await coreCall<{ vaultRoot: string }>("getSettings");
      setVaultRoot(settings.vaultRoot);
      const list = await coreCall<ToolListItem[]>("listTools");
      setTools(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div>
        <h1>{t("dashboard.title")}</h1>
        <div className="banner error">
          {t("dashboard.error")}: {error}
        </div>
        <button type="button" onClick={() => void load()}>
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (!tools) {
    return (
      <div>
        <h1>{t("dashboard.title")}</h1>
        <p className="muted">{t("dashboard.loading")}</p>
      </div>
    );
  }

  return (
    <div>
      <h1>{t("dashboard.title")}</h1>
      <p className="muted">
        {t("dashboard.vault")}: <code>{vaultRoot}</code>
      </p>
      <div className="cards">
        {tools.length === 0 ? (
          <p className="muted">{t("dashboard.empty")}</p>
        ) : (
          tools.map((a) => (
            <div
              key={a.id}
              className="card"
              role="button"
              tabIndex={0}
              onClick={() => onOpenAgent(a.id)}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") onOpenAgent(a.id);
              }}
            >
              <h3>{a.displayName}</h3>
              <div>
                <Badge status={a.status.overall} />
              </div>
              <p className="muted">
                <code>{a.id}</code> · <code>{a.home}</code>
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

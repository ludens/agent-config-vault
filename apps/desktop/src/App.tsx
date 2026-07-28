import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Dashboard } from "./pages/Dashboard";
import { AgentDetail } from "./pages/AgentDetail";
import { Shared } from "./pages/Shared";
import { Settings } from "./pages/Settings";
import i18n from "./i18n";

type Page =
  | { name: "dashboard" }
  | { name: "shared" }
  | { name: "settings" }
  | { name: "agent"; id: string };

export default function App() {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>({ name: "dashboard" });
  const lang = i18n.language.startsWith("ko") ? "ko" : "en";

  function setLocale(locale: string) {
    void i18n.changeLanguage(locale);
  }

  return (
    <>
      <header className="app-header">
        <span className="brand">{t("appName")}</span>
        <nav>
          <a
            className={page.name === "dashboard" || page.name === "agent" ? "active" : ""}
            onClick={() => setPage({ name: "dashboard" })}
          >
            {t("nav.dashboard")}
          </a>
          <a
            className={page.name === "shared" ? "active" : ""}
            onClick={() => setPage({ name: "shared" })}
          >
            {t("nav.shared")}
          </a>
          <a
            className={page.name === "settings" ? "active" : ""}
            onClick={() => setPage({ name: "settings" })}
          >
            {t("nav.settings")}
          </a>
        </nav>
        <div className="lang-switch">
          <select
            value={lang}
            onChange={(e) => setLocale(e.target.value)}
            aria-label="Language"
          >
            <option value="en">{t("lang.en")}</option>
            <option value="ko">{t("lang.ko")}</option>
          </select>
        </div>
      </header>
      <main>
        {page.name === "dashboard" && (
          <Dashboard onOpenAgent={(id) => setPage({ name: "agent", id })} />
        )}
        {page.name === "agent" && (
          <AgentDetail
            toolId={page.id}
            onBack={() => setPage({ name: "dashboard" })}
          />
        )}
        {page.name === "shared" && <Shared />}
        {page.name === "settings" && (
          <Settings onLocaleChange={setLocale} />
        )}
      </main>
    </>
  );
}

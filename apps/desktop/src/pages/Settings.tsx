import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { coreCall, type Settings as SettingsData } from "../api";
import i18n from "../i18n";

type Props = {
  onLocaleChange: (locale: string) => void;
};

export function Settings({ onLocaleChange }: Props) {
  const { t } = useTranslation();
  const [vaultRoot, setVaultRoot] = useState("");
  const [locale, setLocale] = useState(i18n.language.startsWith("ko") ? "ko" : "en");
  const [flash, setFlash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const s = await coreCall<SettingsData>("getSettings");
        setVaultRoot(s.vaultRoot);
        const loc = s.locale === "ko" ? "ko" : "en";
        setLocale(loc);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <div>
      <h1>{t("settings.title")}</h1>
      <p className="muted">{t("settings.hint")}</p>
      {flash && <div className="banner info">{flash}</div>}
      {error && <div className="banner error">{error}</div>}

      <label>{t("settings.vaultRoot")}</label>
      <input value={vaultRoot} onChange={(e) => setVaultRoot(e.target.value)} />

      <label>{t("settings.locale")}</label>
      <select value={locale} onChange={(e) => setLocale(e.target.value)}>
        <option value="en">{t("lang.en")}</option>
        <option value="ko">{t("lang.ko")}</option>
      </select>

      <div className="row">
        <button
          type="button"
          onClick={() =>
            void (async () => {
              setError(null);
              setFlash(null);
              try {
                const r = await coreCall<SettingsData>("setSettings", {
                  vaultRoot,
                  locale,
                });
                setVaultRoot(r.vaultRoot);
                const loc = r.locale === "ko" ? "ko" : "en";
                setLocale(loc);
                onLocaleChange(loc);
                setFlash(t("settings.saved"));
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            })()
          }
        >
          {t("settings.save")}
        </button>
      </div>
    </div>
  );
}

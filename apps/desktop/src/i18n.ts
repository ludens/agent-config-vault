import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "./locales/en.json";
import ko from "./locales/ko.json";

function systemLocale(): string {
  const lang =
    typeof navigator !== "undefined"
      ? navigator.language || (navigator as { userLanguage?: string }).userLanguage || "en"
      : "en";
  return lang.toLowerCase().startsWith("ko") ? "ko" : "en";
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    ko: { translation: ko },
  },
  lng: systemLocale(),
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
export { systemLocale };

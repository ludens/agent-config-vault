import { useTranslation } from "react-i18next";

const KNOWN = new Set(["linked", "unlinked", "partial", "drift"]);

export function Badge({ status }: { status: string }) {
  const { t } = useTranslation();
  const cls = KNOWN.has(status) ? status : "unlinked";
  const key = `badge.${cls}` as const;
  const label = t(key, { defaultValue: status });
  return <span className={`badge ${cls}`}>{label}</span>;
}

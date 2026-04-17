"use client";

import {
  getGuestLanguageName,
  getGuestLanguageOptions,
  useGuestLanguage,
  type GuestLanguageCode,
} from "@/lib/guest-language";

export function LanguageToggle() {
  const { language, setLanguage, t } = useGuestLanguage();

  return (
    <div className="fixed left-4 top-4 z-50">
      <label className="flex items-center gap-2 rounded-2xl border border-[var(--guest-border)] bg-[var(--guest-surface)]/90 px-3 py-2 text-xs text-[var(--guest-text-muted)] shadow-lg backdrop-blur">
        <span className="uppercase tracking-[0.18em]">{t("language.label")}</span>
        <select
          value={language}
          onChange={(event) => setLanguage(event.target.value as GuestLanguageCode)}
          className="rounded-lg bg-[var(--guest-bg)] px-2 py-1 text-sm text-[var(--guest-text)] outline-none"
          aria-label={t("language.label")}
        >
          {getGuestLanguageOptions().map((option) => (
            <option key={option.code} value={option.code}>
              {getGuestLanguageName(option.code)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

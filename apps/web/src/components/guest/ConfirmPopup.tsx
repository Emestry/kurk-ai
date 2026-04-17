"use client";

import { Button } from "@/components/ui/button";
import { useTranslatedTexts } from "@/hooks/useTranslatedTexts";
import { useGuestLanguage } from "@/lib/guest-language";
import type { ParseRequestResponse } from "@/lib/types";

interface ConfirmPopupProps {
  parsed: ParseRequestResponse;
  transcript: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface ErrorPopupProps {
  error: string;
  onDismiss: () => void;
}

export function ConfirmPopup({
  parsed,
  transcript,
  onConfirm,
  onCancel,
}: ConfirmPopupProps) {
  const { language, t } = useGuestLanguage();
  const translatedTexts = useTranslatedTexts(
    [
      transcript,
      ...parsed.items.map((item) => item.name),
    ].filter(Boolean),
    language,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--guest-bg)]/60 backdrop-blur-sm" />

      <div className="relative z-10 mx-4 w-full max-w-sm rounded-3xl bg-[var(--guest-surface)] p-6">
        <p className="mb-4 text-sm text-[var(--guest-text-muted)]">
          &ldquo;{translatedTexts[transcript] ?? transcript}&rdquo;
        </p>

        <div className="mb-6 flex flex-col gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-[var(--guest-text-dim)]">
            {t("confirm.itemsFound")}
          </p>
          {parsed.items.map((item) => (
            <div
              key={item.inventory_item_id}
              className="flex items-center justify-between rounded-xl bg-[var(--guest-bg)] px-3 py-2"
            >
              <span className="text-sm text-[var(--guest-text)]">
                {translatedTexts[item.name] ?? item.name}
              </span>
              <span className="text-sm font-medium text-[var(--guest-accent)]">
                x{item.quantity}
              </span>
            </div>
          ))}
        </div>

        <div className="flex gap-3">
          <Button
            onClick={onCancel}
            variant="outline"
            className="flex-1 border-[var(--guest-text-dim)]/20 bg-transparent text-[var(--guest-text-muted)] hover:bg-[var(--guest-surface-hover)]"
            size="lg"
          >
            {t("confirm.cancel")}
          </Button>
          <Button
            onClick={onConfirm}
            className="flex-1 bg-[var(--guest-accent)] text-[var(--guest-accent-foreground)] hover:opacity-90"
            size="lg"
          >
            {t("confirm.confirm")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ErrorPopup({ error, onDismiss }: ErrorPopupProps) {
  const { language, t } = useGuestLanguage();
  const translatedErrors = useTranslatedTexts([error], language);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-[var(--guest-bg)]/60 backdrop-blur-sm" />

      <div className="relative z-10 mx-4 w-full max-w-sm rounded-3xl bg-[var(--guest-surface)] p-6">
        <p className="mb-4 text-sm text-[var(--guest-status-rejected)]">
          {translatedErrors[error] ?? error}
        </p>
        <Button
          onClick={onDismiss}
          className="w-full bg-[var(--guest-surface-hover)] text-[var(--guest-text)] hover:opacity-90"
          size="lg"
        >
          {t("error.dismiss")}
        </Button>
      </div>
    </div>
  );
}

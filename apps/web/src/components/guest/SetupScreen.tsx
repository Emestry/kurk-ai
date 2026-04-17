"use client";

import Image from "next/image";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useGuestAudio } from "@/hooks/useGuestAudio";
import { createDeviceSession, storeSession } from "@/lib/api";
import { useGuestLanguage } from "@/lib/guest-language";
import { useTranslatedTexts } from "@/hooks/useTranslatedTexts";

interface SetupScreenProps {
  onSubmit: (roomNumber: string) => void;
  onPrimeAudio: () => Promise<void>;
  onArmWakeWord: () => Promise<void>;
}

function getDeviceFingerprint(): string {
  if (typeof window === "undefined") return "tablet-server";
  return [
    "tablet",
    window.navigator.platform,
    window.navigator.language,
    window.screen.width,
    window.screen.height,
  ].join(":");
}

export function SetupScreen({
  onSubmit,
  onPrimeAudio,
  onArmWakeWord,
}: SetupScreenProps) {
  const { language, t } = useGuestLanguage();
  const { playCue } = useGuestAudio();
  const [roomNumber, setRoomNumber] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const translatedErrors = useTranslatedTexts(error ? [error] : [], language);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmedRoom = roomNumber.trim();
    const trimmedCode = pairingCode.trim();
    if (!trimmedRoom || !trimmedCode) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await onPrimeAudio();
      await onArmWakeWord();
      const session = await createDeviceSession({
        roomCode: `ROOM-${trimmedRoom}`,
        pairingCode: trimmedCode,
        deviceFingerprint: getDeviceFingerprint(),
        deviceName: `Room ${trimmedRoom} Tablet`,
      });
      storeSession(session);
      playCue("activation");
      onSubmit(session.roomNumber);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : t("setup.activationError");
      playCue("error");
      setError(message);
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-[var(--guest-bg)] px-4">
      <form
        onSubmit={handleSubmit}
        className="flex w-full max-w-sm flex-col items-center gap-8 rounded-3xl bg-[var(--guest-surface)] p-10"
      >
        <div className="flex flex-col items-center gap-3">
          <Image
            src="/logo-highres.png"
            alt="Kurk AI"
            width={128}
            height={128}
            priority
            unoptimized
            className="h-20 w-20"
          />
          <Image
            src="/text-highres.png"
            alt="Kurk AI"
            width={320}
            height={64}
            priority
            unoptimized
            className="h-7 w-auto"
          />
        </div>

        <p className="text-sm text-[var(--guest-text-muted)]">
          {t("setup.tagline")}
        </p>

        <div className="flex w-full flex-col gap-3">
          <label
            htmlFor="room-number"
            className="text-sm text-[var(--guest-text-muted)]"
          >
            {t("setup.roomNumber")}
          </label>
          <input
            id="room-number"
            type="text"
            inputMode="numeric"
            autoFocus
            value={roomNumber}
            onChange={(e) => setRoomNumber(e.target.value)}
            placeholder={t("setup.placeholder")}
            disabled={isSubmitting}
            className="w-full rounded-xl bg-[var(--guest-bg)] px-4 py-3 text-center text-2xl font-medium text-[var(--guest-text)] placeholder:text-[var(--guest-text-dim)] outline-none focus:ring-2 focus:ring-[var(--guest-accent)] disabled:opacity-60"
          />
        </div>

        <div className="flex w-full flex-col gap-3">
          <label
            htmlFor="pairing-code"
            className="text-sm text-[var(--guest-text-muted)]"
          >
            {t("setup.pairingCode")}
          </label>
          <input
            id="pairing-code"
            type="text"
            inputMode="numeric"
            pattern="\d*"
            maxLength={6}
            value={pairingCode}
            onChange={(e) => setPairingCode(e.target.value.replace(/\D/g, ""))}
            placeholder={t("setup.pairingPlaceholder")}
            disabled={isSubmitting}
            className="w-full rounded-xl bg-[var(--guest-bg)] px-4 py-3 text-center text-2xl font-medium tracking-[0.5em] text-[var(--guest-text)] placeholder:text-[var(--guest-text-dim)] outline-none focus:ring-2 focus:ring-[var(--guest-accent)] disabled:opacity-60"
          />
          <p className="text-center text-xs text-[var(--guest-text-muted)]">
            {t("setup.pairingHint")}
          </p>
        </div>

        {error && (
          <p className="text-center text-xs text-[var(--guest-status-rejected)]">
            {translatedErrors[error] ?? error}
          </p>
        )}

        <Button
          type="submit"
          disabled={!roomNumber.trim() || pairingCode.length !== 6 || isSubmitting}
          className="w-full rounded-xl bg-[var(--guest-accent)] py-3 text-base font-medium text-[var(--guest-accent-foreground)] hover:opacity-90 disabled:opacity-40"
          size="lg"
        >
          {isSubmitting ? t("setup.activating") : t("setup.start")}
        </Button>
      </form>
    </div>
  );
}

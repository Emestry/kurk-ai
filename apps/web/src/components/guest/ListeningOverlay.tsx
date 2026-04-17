"use client";

import SiriOrb from "@/components/ui/siri-orb";
import { useTranslatedTexts } from "@/hooks/useTranslatedTexts";
import { useGuestLanguage } from "@/lib/guest-language";

interface ListeningOverlayProps {
  interimTranscript: string;
  finalTranscript: string;
  onStopListening: () => void;
}

export function ListeningOverlay({
  interimTranscript,
  finalTranscript,
  onStopListening,
}: ListeningOverlayProps) {
  const { language, t } = useGuestLanguage();
  const transcript = finalTranscript || interimTranscript;
  const translatedTranscript = useTranslatedTexts(
    transcript && transcript !== "Finishing..." ? [transcript] : [],
    language,
  );

  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center">
      <div className="absolute inset-0 bg-[var(--guest-bg)]/80 backdrop-blur-sm" />

      <div className="relative z-10 flex flex-col items-center gap-8">
        <button
          type="button"
          onClick={onStopListening}
          className="cursor-pointer touch-none rounded-full"
          aria-label={t("listening.stop")}
        >
          <SiriOrb
            size="192px"
            colors={{
              bg: "var(--guest-orb-bg)",
              c1: "var(--guest-orb-c1)",
              c2: "var(--guest-orb-c2)",
              c3: "var(--guest-orb-c3)",
            }}
            animationDuration={4}
          />
        </button>

        <div className="max-w-md px-6 text-center">
          {transcript ? (
            <p className="text-lg text-[var(--guest-text)]">
              {transcript === "Finishing..."
                ? t("listening.finishing")
                : (translatedTranscript[transcript] ?? transcript)}
            </p>
          ) : (
            <p className="animate-pulse text-lg text-[var(--guest-text-dim)]">
              {t("listening.placeholder")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

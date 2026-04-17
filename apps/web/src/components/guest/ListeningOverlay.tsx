"use client";

import { motion } from "motion/react";
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
    <motion.div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: "easeOut" }}
    >
      <motion.div
        className="absolute inset-0 bg-[var(--guest-bg)]/80 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.24, ease: "easeOut" }}
      />

      <motion.div
        className="relative z-10 flex flex-col items-center gap-8"
        initial={{ y: 18, scale: 0.96 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 12, scale: 0.98 }}
        transition={{ type: "spring", stiffness: 210, damping: 22 }}
      >
        <motion.button
          type="button"
          onClick={onStopListening}
          className="cursor-pointer touch-none rounded-full"
          aria-label={t("listening.stop")}
          layoutId="guest-orb-button"
          transition={{
            type: "spring",
            stiffness: 220,
            damping: 24,
          }}
        >
          <motion.div
            layoutId="guest-orb-visual"
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 24,
            }}
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
          </motion.div>
        </motion.button>

        <motion.div
          className="max-w-md px-6 text-center"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          transition={{ delay: 0.08, duration: 0.18, ease: "easeOut" }}
        >
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
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

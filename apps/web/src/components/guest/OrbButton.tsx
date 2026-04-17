"use client";

import { useCallback, useRef } from "react";
import SiriOrb from "@/components/ui/siri-orb";
import { useGuestLanguage } from "@/lib/guest-language";

interface OrbButtonProps {
  isListening: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
}

const HOLD_THRESHOLD_MS = 300;

export function OrbButton({
  isListening,
  onStartListening,
  onStopListening,
}: OrbButtonProps) {
  const { t } = useGuestLanguage();
  const pressStartRef = useRef<number>(0);
  const wasListeningRef = useRef(false);

  const handlePointerDown = useCallback(() => {
    pressStartRef.current = Date.now();
    wasListeningRef.current = isListening;

    if (!isListening) {
      onStartListening();
    }
  }, [isListening, onStartListening]);

  const handlePointerUp = useCallback(() => {
    const holdDuration = Date.now() - pressStartRef.current;

    if (holdDuration >= HOLD_THRESHOLD_MS) {
      onStopListening();
    } else if (wasListeningRef.current) {
      onStopListening();
    }
  }, [onStopListening]);

  return (
    <div className="fixed bottom-8 left-1/2 z-30 -translate-x-1/2">
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        className="cursor-pointer touch-none rounded-full transition-transform hover:scale-105 active:scale-95"
        aria-label={isListening ? t("listening.stop") : t("listening.start")}
      >
        <SiriOrb
          size="64px"
          colors={{
            bg: "var(--guest-orb-bg)",
            c1: "var(--guest-orb-c1)",
            c2: "var(--guest-orb-c2)",
            c3: "var(--guest-orb-c3)",
          }}
          animationDuration={isListening ? 6 : 20}
        />
      </button>
    </div>
  );
}

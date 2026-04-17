"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "motion/react";

interface VoiceHintToastProps {
  message: string | null;
  onDismiss: () => void;
  /** Milliseconds to stay visible before auto-dismissing. */
  durationMs?: number;
}

/**
 * Non-blocking top banner used when the voice assistant couldn't hear or
 * match the guest's request. Fades itself in, waits, and fades out — no
 * button press required, so the guest can just speak again.
 */
export function VoiceHintToast({
  message,
  onDismiss,
  durationMs = 3000,
}: VoiceHintToastProps) {
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [message, durationMs, onDismiss]);

  return (
    <AnimatePresence>
      {message ? (
        <motion.div
          key={message}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="pointer-events-none fixed right-0 top-24 z-[60] flex"
          role="status"
          aria-live="polite"
        >
          <div className="pointer-events-auto max-w-[16rem] rounded-l-full border border-r-0 border-[var(--guest-border)] bg-[var(--guest-surface)]/95 px-5 py-2 text-sm text-[var(--guest-text)] shadow-xl backdrop-blur">
            {message}
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

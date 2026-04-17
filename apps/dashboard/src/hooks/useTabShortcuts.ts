"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const MAP: Record<string, string> = {
  "1": "/",
  "2": "/inventory",
  "3": "/rooms",
  "4": "/stocktake",
  "5": "/reports",
};

/**
 * 1–5 jump between tabs. Ignored while typing in inputs/textareas
 * or when modifier keys are held.
 */
export function useTabShortcuts() {
  const router = useRouter();
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      const href = MAP[e.key];
      if (href) router.push(href);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);
}

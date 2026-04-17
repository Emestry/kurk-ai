"use client";

import { useEffect, useRef } from "react";
import { useSoundEnabled } from "@/components/shared/SoundToggle";

/**
 * Returns a `play()` function that plays the new-request chime when sound
 * is enabled. Autoplay is gated on a user gesture; first play after page
 * load may throw, which we swallow.
 */
export function useSoundAlert() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [enabled] = useSoundEnabled();

  useEffect(() => {
    audioRef.current = new Audio("/sounds/new-request.mp3");
    audioRef.current.preload = "auto";
  }, []);

  return function play() {
    if (!enabled) return;
    void audioRef.current?.play().catch(() => {
      /* autoplay blocked — require user gesture before the first play */
    });
  };
}

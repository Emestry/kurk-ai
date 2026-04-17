"use client";

import { useEffect, useRef } from "react";
import { useSoundEnabled } from "@/components/shared/SoundToggle";

type DashboardCue = "new-request" | "status-update" | "low-stock";

interface ToneStep {
  duration: number;
  frequency: number;
  gain: number;
}

const CUE_PATTERNS: Record<Exclude<DashboardCue, "new-request">, ToneStep[]> = {
  "status-update": [
    { frequency: 523.25, duration: 0.07, gain: 0.02 },
    { frequency: 659.25, duration: 0.1, gain: 0.024 },
  ],
  "low-stock": [
    { frequency: 783.99, duration: 0.08, gain: 0.022 },
    { frequency: 659.25, duration: 0.08, gain: 0.024 },
    { frequency: 523.25, duration: 0.12, gain: 0.026 },
  ],
};

function createContext() {
  if (typeof window === "undefined") {
    return null;
  }

  const browserWindow = globalThis as typeof globalThis & {
    AudioContext?: typeof AudioContext;
    webkitAudioContext?: typeof AudioContext;
  };
  const AudioContextCtor =
    browserWindow.AudioContext ?? browserWindow.webkitAudioContext;
  return AudioContextCtor ? new AudioContextCtor() : null;
}

/**
 * Returns a `play()` function for dashboard sound cues. New requests use the
 * committed mp3 asset; other cues are lightweight synthesized earcons so we
 * can distinguish request progression and low-stock warnings.
 */
export function useSoundAlert() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [enabled] = useSoundEnabled();

  useEffect(() => {
    audioRef.current = new Audio("/sounds/new-request.mp3");
    audioRef.current.preload = "auto";

    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  function queueCue(context: AudioContext, cue: Exclude<DashboardCue, "new-request">) {
    let cursor = context.currentTime;

    for (const step of CUE_PATTERNS[cue]) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = cue === "low-stock" ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(step.frequency, cursor);
      gain.gain.setValueAtTime(0.0001, cursor);
      gain.gain.exponentialRampToValueAtTime(step.gain, cursor + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, cursor + step.duration);

      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(cursor);
      oscillator.stop(cursor + step.duration);

      cursor += step.duration + 0.02;
    }
  }

  return function play(cue: DashboardCue = "new-request") {
    if (!enabled) return;

    if (cue === "new-request") {
      void audioRef.current?.play().catch(() => {
        /* autoplay blocked — require user gesture before the first play */
      });
      return;
    }

    const context = audioContextRef.current ?? createContext();

    if (!context) {
      return;
    }

    audioContextRef.current = context;

    if (context.state === "running") {
      queueCue(context, cue);
      return;
    }

    void context.resume().then(() => {
      if (context.state === "running") {
        queueCue(context, cue);
      }
    }).catch(() => {
      /* autoplay blocked — require user gesture before the first play */
    });
  };
}

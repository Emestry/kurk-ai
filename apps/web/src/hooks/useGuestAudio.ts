"use client";

import { useEffect, useRef } from "react";

type GuestCue =
  | "activation"
  | "listening"
  | "success"
  | "error"
  | "complete"
  | "mismatch";

interface ToneStep {
  duration: number;
  frequency: number;
  gain: number;
}

const CUE_PATTERNS: Record<GuestCue, ToneStep[]> = {
  activation: [
    { frequency: 523.25, duration: 0.08, gain: 0.03 },
    { frequency: 659.25, duration: 0.12, gain: 0.035 },
  ],
  listening: [
    { frequency: 659.25, duration: 0.06, gain: 0.025 },
    { frequency: 783.99, duration: 0.08, gain: 0.03 },
  ],
  success: [
    { frequency: 587.33, duration: 0.08, gain: 0.028 },
    { frequency: 783.99, duration: 0.12, gain: 0.035 },
  ],
  error: [
    { frequency: 349.23, duration: 0.12, gain: 0.03 },
    { frequency: 293.66, duration: 0.16, gain: 0.026 },
  ],
  mismatch: [
    { frequency: 440, duration: 0.08, gain: 0.025 },
    { frequency: 349.23, duration: 0.08, gain: 0.026 },
    { frequency: 293.66, duration: 0.14, gain: 0.028 },
  ],
  complete: [
    { frequency: 523.25, duration: 0.08, gain: 0.028 },
    { frequency: 659.25, duration: 0.08, gain: 0.03 },
    { frequency: 783.99, duration: 0.16, gain: 0.034 },
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
 * Centralizes guest-facing tablet sound cues.
 */
export function useGuestAudio() {
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        void audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  async function primeAudio() {
    const context = audioContextRef.current ?? createContext();

    if (!context) {
      return;
    }

    audioContextRef.current = context;

    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        // Ignore blocked resume attempts; later user gestures can unlock audio.
      }
    }
  }

  function queueCue(context: AudioContext, cue: GuestCue) {
    const steps = CUE_PATTERNS[cue];
    let cursor = context.currentTime;

    for (const step of steps) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();

      oscillator.type = "sine";
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

  function playCue(cue: GuestCue) {
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
      // Ignore blocked autoplay; the next user gesture can unlock playback.
    });
  }

  return {
    playCue,
    primeAudio,
  };
}

"use client";

import { useCallback, useEffect, useRef } from "react";
import { transcribeGuestAudio } from "@/lib/api";

interface UseWakeWordOptions {
  enabled: boolean;
  onWake: (command?: string) => void;
}

interface UseWakeWordReturn {
  arm: () => Promise<void>;
}

const WAKE_PREFIXES = new Set(["hey", "hei", "hi", "hello", "okay", "ok", "ou"]);
const WAKE_VARIANTS = [
  "charlie",
  "charly",
  "charley",
  "charli",
  "charlee",
  "charlea",
  "charliee",
  "charliey",
  "charlye",
  "sharlie",
  "sharley",
  "sharli",
  "sharly",
  "charles",
  "char lie",
  "char lee",
  "char li",
  "char lei",
] as const;
const WAKE_CANONICAL_FORMS = new Set(
  WAKE_VARIANTS.map((variant) => canonicalizeWakeText(variant)).filter(Boolean),
);
const CHUNK_MS = 2200;

function normalizeWakeTranscript(value: string) {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function canonicalizeWakeText(value: string) {
  return normalizeWakeTranscript(value)
    .replace(/\s+/g, "")
    .replace(/^sh/, "ch")
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/q/g, "k")
    .replace(/z/g, "s")
    .replace(/ie$/, "y")
    .replace(/ee$/, "y")
    .replace(/ey$/, "y")
    .replace(/ea$/, "y")
    .replace(/e+$/g, "")
    .replace(/a+$/g, "")
    .replace(/y+$/g, "y");
}

function levenshteinDistance(a: string, b: string) {
  if (a === b) {
    return 0;
  }

  if (!a.length) {
    return b.length;
  }

  if (!b.length) {
    return a.length;
  }

  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = previous[0];
    previous[0] = i;

    for (let j = 1; j <= b.length; j += 1) {
      const upper = previous[j];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + cost,
      );
      diagonal = upper;
    }
  }

  return previous[b.length];
}

function isWakeCandidate(value: string) {
  const canonical = canonicalizeWakeText(value);

  if (!canonical) {
    return false;
  }

  if (WAKE_CANONICAL_FORMS.has(canonical)) {
    return true;
  }

  for (const variant of WAKE_CANONICAL_FORMS) {
    if (Math.abs(variant.length - canonical.length) > 2) {
      continue;
    }

    if (levenshteinDistance(variant, canonical) <= 2) {
      return true;
    }
  }

  return false;
}

function isWakeMatch(value: string) {
  const normalized = normalizeWakeTranscript(value);
  const tokens = normalized.split(" ").filter(Boolean);

  for (let index = 0; index < tokens.length; index += 1) {
    if (isWakeCandidate(tokens[index])) {
      return true;
    }

    if (index < tokens.length - 1 && isWakeCandidate(`${tokens[index]} ${tokens[index + 1]}`)) {
      return true;
    }
  }

  return false;
}

function extractWakeCommand(value: string) {
  const normalized = normalizeWakeTranscript(value);
  const tokens = normalized.split(" ").filter(Boolean);
  let startIndex = 0;

  if (tokens[startIndex] && WAKE_PREFIXES.has(tokens[startIndex])) {
    startIndex += 1;
  }

  if (!tokens[startIndex]) {
    return null;
  }

  if (isWakeCandidate(tokens[startIndex])) {
    return tokens.slice(startIndex + 1).join(" ");
  }

  if (
    tokens[startIndex + 1] &&
    isWakeCandidate(`${tokens[startIndex]} ${tokens[startIndex + 1]}`)
  ) {
    return tokens.slice(startIndex + 2).join(" ");
  }

  return null;
}

export function useWakeWord({ enabled, onWake }: UseWakeWordOptions): UseWakeWordReturn {
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const shouldRunRef = useRef(false);
  const hasArmedRef = useRef(false);
  const chunkTimeoutRef = useRef<number | null>(null);
  const transcribingRef = useRef(false);
  const onWakeRef = useRef(onWake);
  onWakeRef.current = onWake;

  const stopMonitoring = useCallback(() => {
    if (chunkTimeoutRef.current !== null) {
      window.clearTimeout(chunkTimeoutRef.current);
      chunkTimeoutRef.current = null;
    }
    recorderRef.current?.stop();
    recorderRef.current = null;
    transcribingRef.current = false;
  }, []);

  const startMonitoring = useCallback(() => {
    if (!shouldRunRef.current || !streamRef.current || recorderRef.current) {
      return;
    }

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";
    const recorder = new MediaRecorder(
      streamRef.current,
      mimeType ? { mimeType } : undefined,
    );
    let latestChunk: Blob | null = null;

    recorder.ondataavailable = (event) => {
      if (!event.data.size) {
        return;
      }

      latestChunk = event.data;
    };

    recorder.onstop = () => {
      recorderRef.current = null;

      if (!shouldRunRef.current) {
        return;
      }

      if (!latestChunk || transcribingRef.current) {
        startMonitoring();
        return;
      }

      transcribingRef.current = true;

      void (async () => {
        try {
          const transcript = await transcribeGuestAudio({
            audio: latestChunk!,
            fileName: `wake-word-${Date.now()}.webm`,
          });

          if (isWakeMatch(transcript.transcript)) {
            shouldRunRef.current = false;
            onWakeRef.current(extractWakeCommand(transcript.transcript) ?? undefined);
            return;
          }
        } catch {
          // Ignore a failed snippet and continue passive listening.
        } finally {
          transcribingRef.current = false;
          if (shouldRunRef.current) {
            startMonitoring();
          }
        }
      })();
    };

    recorder.start();
    recorderRef.current = recorder;
    chunkTimeoutRef.current = window.setTimeout(() => {
      if (recorder.state !== "inactive") {
        recorder.stop();
      }
    }, CHUNK_MS);
  }, []);

  const arm = useCallback(async () => {
    hasArmedRef.current = true;
    shouldRunRef.current = enabled;

    if (!streamRef.current) {
      streamRef.current = await window.navigator.mediaDevices.getUserMedia({
        audio: true,
      });
    }

    if (enabled) {
      startMonitoring();
    }
  }, [enabled, startMonitoring]);

  useEffect(() => {
    shouldRunRef.current = enabled;

    if (!enabled) {
      stopMonitoring();
      return;
    }

    if (hasArmedRef.current) {
      startMonitoring();
    }

    return () => {
      shouldRunRef.current = false;
      stopMonitoring();
    };
  }, [enabled, startMonitoring, stopMonitoring]);

  useEffect(() => {
    return () => {
      stopMonitoring();
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [stopMonitoring]);

  return { arm };
}

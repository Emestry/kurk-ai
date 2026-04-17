"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { transcribeGuestAudio } from "@/lib/api";

const SILENCE_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 1400;
const MIN_RECORDING_BEFORE_AUTOSTOP_MS = 1200;

function getFriendlyVoiceError(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "SecurityError") {
      return "Microphone access is blocked. Please allow microphone access and try again.";
    }

    if (
      error.name === "NotFoundError" ||
      error.name === "NotReadableError" ||
      error.name === "AbortError"
    ) {
      return "This device couldn't start the microphone right now. Please try again.";
    }
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (message.includes("empty")) {
      return "I couldn't catch that. Please try again and speak a little closer.";
    }

    if (
      message.includes("transcribe") ||
      message.includes("understand") ||
      message.includes("audio")
    ) {
      return "I heard you, but couldn't understand the request clearly. Please try again.";
    }

    if (message.includes("microphone") || message.includes("permission")) {
      return "Microphone access is blocked. Please allow microphone access and try again.";
    }
  }

  return "There was a problem with the voice recording. Please try again.";
}

export interface UseVoiceCaptureReturn {
  isListening: boolean;
  interimTranscript: string;
  finalTranscript: string;
  error: string | null;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
}

interface UseVoiceCaptureOptions {
  onFinalTranscript?: (transcript: string) => void;
  onError?: (message: string) => void;
  onStopWithoutTranscript?: () => void;
}

export function useVoiceCapture(options: UseVoiceCaptureOptions = {}): UseVoiceCaptureReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [finalTranscript, setFinalTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pendingChunksRef = useRef(0);
  const transcriptSnapshotRef = useRef("");
  const audioChunksRef = useRef<Blob[]>([]);
  const stoppedRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartedAtRef = useRef<number | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const recordingStartedAtRef = useRef<number>(0);
  const onFinalTranscriptRef = useRef(options.onFinalTranscript);
  const onErrorRef = useRef(options.onError);
  const onStopWithoutTranscriptRef = useRef(options.onStopWithoutTranscript);

  useEffect(() => {
    onFinalTranscriptRef.current = options.onFinalTranscript;
    onErrorRef.current = options.onError;
    onStopWithoutTranscriptRef.current = options.onStopWithoutTranscript;
  }, [options.onError, options.onFinalTranscript, options.onStopWithoutTranscript]);

  const isSupported =
    typeof window !== "undefined" &&
    typeof MediaRecorder !== "undefined" &&
    Boolean(window.navigator.mediaDevices?.getUserMedia);

  const finalizeIfReady = useCallback(() => {
    if (!stoppedRef.current || pendingChunksRef.current > 0) {
      return;
    }

    const final = transcriptSnapshotRef.current.trim();
    setFinalTranscript(final);
    setInterimTranscript("");
    setIsFinalizing(false);

    if (final) {
      onFinalTranscriptRef.current?.(final);
      return;
    }

    onStopWithoutTranscriptRef.current?.();
  }, []);

  const reportError = useCallback((message: string) => {
    setError(message);
    onErrorRef.current?.(message);
  }, []);

  const cleanup = useCallback(() => {
    mediaRecorderRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    analyserRef.current = null;
    silenceStartedAtRef.current = null;
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      mediaRecorderRef.current?.stop();
      cleanup();
    };
  }, [cleanup]);

  const start = useCallback(async () => {
    if (!isSupported) {
      reportError("This device couldn't start the microphone right now. Please try again.");
      return;
    }

    if (mediaRecorderRef.current) {
      return;
    }

    setError(null);
    setInterimTranscript("");
    setFinalTranscript("");
    transcriptSnapshotRef.current = "";
    audioChunksRef.current = [];
    pendingChunksRef.current = 0;
    stoppedRef.current = false;

    try {
      const stream = await window.navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      streamRef.current = stream;
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      recordingStartedAtRef.current = Date.now();

      const audioContext = new AudioContext();
      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);
      audioContextRef.current = audioContext;
      analyserRef.current = analyser;

      const monitorSilence = () => {
        const node = analyserRef.current;

        if (!node || !mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
          return;
        }

        const samples = new Uint8Array(node.fftSize);
        node.getByteTimeDomainData(samples);

        let sumSquares = 0;
        for (const sample of samples) {
          const normalized = sample / 128 - 1;
          sumSquares += normalized * normalized;
        }

        const rms = Math.sqrt(sumSquares / samples.length);
        const now = Date.now();

        if (rms > SILENCE_THRESHOLD) {
          silenceStartedAtRef.current = null;
        } else if (now - recordingStartedAtRef.current > MIN_RECORDING_BEFORE_AUTOSTOP_MS) {
          silenceStartedAtRef.current ??= now;
          if (now - silenceStartedAtRef.current > SILENCE_DURATION_MS) {
            setInterimTranscript((current) => (current ? current : "Finishing..."));
            mediaRecorderRef.current.stop();
            return;
          }
        }

        animationFrameRef.current = window.requestAnimationFrame(monitorSilence);
      };

      animationFrameRef.current = window.requestAnimationFrame(monitorSilence);

      recorder.ondataavailable = (event) => {
        if (!event.data.size) {
          return;
        }

        audioChunksRef.current.push(event.data);
        pendingChunksRef.current += 1;

        void (async () => {
          try {
            const result = await transcribeGuestAudio({
              audio: new Blob(audioChunksRef.current, {
                type: recorder.mimeType || "audio/webm",
              }),
              fileName: `guest-progress-${Date.now()}.webm`,
            });

            const text = result.transcript.trim();

            if (text) {
              transcriptSnapshotRef.current = text;
              setInterimTranscript(text);
            }
          } catch (transcriptionError) {
            reportError(getFriendlyVoiceError(transcriptionError));
          } finally {
            pendingChunksRef.current -= 1;
            finalizeIfReady();
          }
        })();
      };

      recorder.onerror = () => {
        reportError("There was a problem with the voice recording. Please try again.");
        setIsRecording(false);
        setIsFinalizing(false);
        cleanup();
      };

      recorder.onstop = () => {
        setIsRecording(false);
        setIsFinalizing(true);
        stoppedRef.current = true;
        cleanup();
        finalizeIfReady();
      };

      recorder.start(1200);
    } catch (recordingError) {
      cleanup();
      reportError(getFriendlyVoiceError(recordingError));
      setInterimTranscript("");
      setIsRecording(false);
      setIsFinalizing(false);
    }
  }, [cleanup, finalizeIfReady, isSupported, reportError]);

  const stop = useCallback(() => {
    if (!mediaRecorderRef.current) {
      return;
    }

    setInterimTranscript((current) => (current ? current : "Finishing..."));
    mediaRecorderRef.current.stop();
  }, []);

  return {
    isListening: isRecording || isFinalizing,
    interimTranscript,
    finalTranscript,
    error,
    isSupported,
    start,
    stop,
  };
}

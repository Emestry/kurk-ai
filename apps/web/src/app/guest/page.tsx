"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup } from "motion/react";
import type { GuestState, ParseRequestResponse, RequestStatus } from "@/lib/types";
import { GuestLanguageProvider, useGuestLanguage } from "@/lib/guest-language";
import {
  parseRequest,
  createRequest,
  clearSession,
  clearHistoryHiddenBefore,
  setHistoryHiddenBefore,
} from "@/lib/api";
import { useGuestAudio } from "@/hooks/useGuestAudio";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { useGuestSocket } from "@/hooks/useGuestSocket";
import { useWakeWord } from "@/hooks/useWakeWord";
import { SetupScreen } from "@/components/guest/SetupScreen";
import { GuestView } from "@/components/guest/GuestView";
import { ListeningOverlay } from "@/components/guest/ListeningOverlay";
import { LanguageToggle } from "@/components/guest/LanguageToggle";
import { ConfirmPopup, ErrorPopup } from "@/components/guest/ConfirmPopup";

const ROOM_STORAGE_KEY = "kurkai-room-number";

// Wake-word detection is temporarily disabled — the current passive-listen +
// transcribe approach is too noisy. Flip this to true once a better detector
// lands. All supporting hooks stay wired so re-enabling is a one-line change.
const WAKE_WORD_ENABLED = false;

function GuestPageContent() {
  const { t } = useGuestLanguage();
  const { playCue, primeAudio } = useGuestAudio();
  const [roomNumber, setRoomNumber] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return localStorage.getItem(ROOM_STORAGE_KEY);
  });
  const [state, setState] = useState<GuestState>(() => {
    if (typeof window === "undefined") {
      return "setup";
    }

    return localStorage.getItem(ROOM_STORAGE_KEY) ? "idle" : "setup";
  });
  const [parsedResult, setParsedResult] = useState<ParseRequestResponse | null>(null);
  const [lastTranscript, setLastTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const hasArmedWakeWordRef = useRef(false);
  const requestStatusesRef = useRef<Map<string, RequestStatus>>(new Map());

  const handleParseRequest = useCallback(async (transcript: string) => {
    try {
      const result = await parseRequest(roomNumber!, transcript);

      if (result.items.length === 0) {
        playCue("mismatch");
        setParsedResult(null);
        setErrorMessage(t("error.noMatchingItems"));
        setState("confirming");
        return;
      }

      setParsedResult(result);
      setState("confirming");
    } catch (err) {
      playCue("error");
      const message = err instanceof Error ? err.message : "Something went wrong, please try again.";
      setErrorMessage(message);
      setState("confirming");
    }
  }, [playCue, roomNumber, t]);

  const voice = useVoiceCapture({
    onFinalTranscript: (transcript) => {
      if (state !== "listening") {
        return;
      }

      setLastTranscript(transcript);
      setState("processing");
      void handleParseRequest(transcript);
    },
    onError: (message) => {
      if (state !== "listening") {
        return;
      }

      playCue("error");
      setErrorMessage(message);
      setState("confirming");
    },
    onStopWithoutTranscript: () => {
      if (state === "listening") {
        setState("idle");
      }
    },
  });
  const { connectionStatus, requests, setRequests } = useGuestSocket(roomNumber, {
    onSessionRevoked: () => {
      clearSession();
      clearHistoryHiddenBefore();
      localStorage.removeItem(ROOM_STORAGE_KEY);
      hasArmedWakeWordRef.current = false;
      playCue("error");
      setRoomNumber(null);
      setParsedResult(null);
      setLastTranscript("");
      setErrorMessage(t("error.sessionRevoked"));
      setState("setup");
    },
  });

  const wakeWord = useWakeWord({
    enabled: WAKE_WORD_ENABLED && state === "idle",
    onWake: (command) => {
      playCue("activation");
      setErrorMessage(null);
      setParsedResult(null);
      setLastTranscript(command ?? "");

      if (command) {
        setState("processing");
        void handleParseRequest(command);
        return;
      }

      setLastTranscript("");
      setState("listening");
      voice.start();
    },
  });

  useEffect(() => {
    if (!WAKE_WORD_ENABLED) return;
    if (state !== "idle" || !roomNumber || hasArmedWakeWordRef.current) {
      return;
    }

    hasArmedWakeWordRef.current = true;
    void wakeWord.arm().catch((error) => {
      hasArmedWakeWordRef.current = false;
      setErrorMessage(
        error instanceof Error
          ? error.message
          : t("error.voicePassiveWake"),
      );
    });
  }, [roomNumber, state, t, wakeWord]);

  function handleSetupSubmit(room: string) {
    localStorage.setItem(ROOM_STORAGE_KEY, room);
    setHistoryHiddenBefore(new Date().toISOString());
    setRoomNumber(room);
    setState("idle");
    hasArmedWakeWordRef.current = true;
  }

  function handleStartListening() {
    void primeAudio();
    setErrorMessage(null);
    setState("listening");
    playCue("listening");
    voice.start();
  }

  function handleStopListening() {
    voice.stop();
  }

  async function handleConfirm() {
    if (!parsedResult || !roomNumber) return;

    try {
      const newRequest = await createRequest(
        roomNumber,
        lastTranscript,
        parsedResult.items,
        parsedResult.category,
      );
      playCue("success");
      setRequests((prev) => [newRequest, ...prev.filter((entry) => entry.id !== newRequest.id)]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create request.";
      playCue("error");
      setErrorMessage(message);
    }

    setParsedResult(null);
    setLastTranscript("");
    setState("idle");
  }

  function handleCancel() {
    setParsedResult(null);
    setLastTranscript("");
    setErrorMessage(null);
    setState("idle");
  }

  function handleDismissError() {
    setErrorMessage(null);
    setState("idle");
  }

  useEffect(() => {
    if (requests.length === 0) {
      requestStatusesRef.current = new Map();
      return;
    }

    if (requestStatusesRef.current.size === 0) {
      requestStatusesRef.current = new Map(
        requests.map((request) => [request.id, request.status]),
      );
      return;
    }

    const nextStatuses = new Map<string, RequestStatus>();

    for (const request of requests) {
      nextStatuses.set(request.id, request.status);

      const previousStatus = requestStatusesRef.current.get(request.id);

      if (!previousStatus || previousStatus === request.status) {
        continue;
      }

      if (request.status === "rejected") {
        playCue("error");
        continue;
      }

      if (
        request.status === "delivered" ||
        request.status === "partially_delivered"
      ) {
        playCue("complete");
      } else {
        playCue("success");
      }
    }

    requestStatusesRef.current = nextStatuses;
  }, [playCue, requests]);

  return (
    <div className="guest-theme dark min-h-screen bg-[var(--guest-bg)]">
      <LanguageToggle />

      {state === "setup" && (
        <SetupScreen
          onSubmit={handleSetupSubmit}
          onPrimeAudio={primeAudio}
          onArmWakeWord={WAKE_WORD_ENABLED ? wakeWord.arm : async () => undefined}
        />
      )}

      {state !== "setup" && (
        <LayoutGroup id="guest-orb-transition">
          <GuestView
            roomNumber={roomNumber!}
            connectionStatus={connectionStatus}
            requests={requests}
            isListening={state === "listening"}
            onStartListening={handleStartListening}
            onStopListening={handleStopListening}
          />

          <AnimatePresence>
            {state === "listening" && (
              <ListeningOverlay
                interimTranscript={voice.interimTranscript}
                finalTranscript={voice.finalTranscript}
                onStopListening={handleStopListening}
              />
            )}
          </AnimatePresence>

          {state === "processing" && (
            <div className="fixed inset-0 z-40 flex items-center justify-center">
              <div className="absolute inset-0 bg-[var(--guest-bg)]/60" />
              <div className="relative z-10 flex flex-col items-center gap-4">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--guest-accent)] border-t-transparent" />
                <p className="text-sm text-[var(--guest-text-muted)]">
                  {t("processing.message")}
                </p>
              </div>
            </div>
          )}

          {state === "confirming" && parsedResult && !errorMessage && (
            <ConfirmPopup
              parsed={parsedResult}
              transcript={lastTranscript}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
            />
          )}

          {state === "confirming" && errorMessage && (
            <ErrorPopup error={errorMessage} onDismiss={handleDismissError} />
          )}
        </LayoutGroup>
      )}
    </div>
  );
}

export default function GuestPage() {
  return (
    <GuestLanguageProvider>
      <GuestPageContent />
    </GuestLanguageProvider>
  );
}

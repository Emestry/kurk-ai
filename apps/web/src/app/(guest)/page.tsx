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
  ensureLegacyRoomSession,
  getCurrentRequest,
  getStoredSession,
  setHistoryHiddenBefore,
  previewGuestRequest,
  ApiError,
  type AvailabilityLine,
} from "@/lib/api";
import { useGuestAudio } from "@/hooks/useGuestAudio";
import { useVoiceCapture } from "@/hooks/useVoiceCapture";
import { useGuestSocket } from "@/hooks/useGuestSocket";
import { useWakeWord } from "@/hooks/useWakeWord";
import { SetupScreen } from "@/components/guest/SetupScreen";
import { GuestView } from "@/components/guest/GuestView";
import { ListeningOverlay } from "@/components/guest/ListeningOverlay";
import { LanguageToggle } from "@/components/guest/LanguageToggle";
import {
  ConfirmPopup,
  ErrorPopup,
  PartialConfirmPopup,
} from "@/components/guest/ConfirmPopup";
import { VoiceHintToast } from "@/components/guest/VoiceHintToast";

const ROOM_STORAGE_KEY = "kurkai-room-number";

const WAKE_WORD_ENABLED = true;

function GuestPageContent() {
  const { t } = useGuestLanguage();
  const { playCue, primeAudio } = useGuestAudio();
  const [roomNumber, setRoomNumber] = useState<string | null>(null);
  const [state, setState] = useState<GuestState>("setup");
  const [isBootstrappingSession, setIsBootstrappingSession] = useState(true);
  const [parsedResult, setParsedResult] = useState<ParseRequestResponse | null>(null);
  const [lastTranscript, setLastTranscript] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hintMessage, setHintMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [partialLines, setPartialLines] = useState<AvailabilityLine[] | null>(null);
  const hasArmedWakeWordRef = useRef(false);
  const requestStatusesRef = useRef<Map<string, RequestStatus>>(new Map());

  // Only server (5xx) or raw network failures should interrupt the guest with
  // the blocking error popup. Everything else — "couldn't hear that", no
  // inventory match, 4xx parse errors — is something they can recover from
  // by simply speaking again, so we surface a transient top toast instead.
  const isConnectionError = (err: unknown) => {
    if (err instanceof ApiError) return err.statusCode >= 500;
    return err instanceof Error && !(err instanceof ApiError);
  };

  const resetGuestAccess = useCallback((nextErrorMessage?: string) => {
    clearSession();
    clearHistoryHiddenBefore();
    localStorage.removeItem(ROOM_STORAGE_KEY);
    hasArmedWakeWordRef.current = false;
    setRoomNumber(null);
    setParsedResult(null);
    setPartialLines(null);
    setLastTranscript("");
    setHintMessage(null);
    setErrorMessage(nextErrorMessage ?? null);
    setState("setup");
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapRoomSession() {
      const storedSession = getStoredSession();
      const storedRoom = storedSession?.roomNumber ?? localStorage.getItem(ROOM_STORAGE_KEY);

      if (!storedRoom) {
        if (!cancelled) {
          setRoomNumber(null);
          setState("setup");
          setIsBootstrappingSession(false);
        }
        return;
      }

      try {
        const roomSessionToken = storedSession?.token
          ? storedSession.token
          : await ensureLegacyRoomSession(storedRoom);
        const current = await getCurrentRequest(roomSessionToken);

        if (cancelled) {
          return;
        }

        localStorage.setItem(ROOM_STORAGE_KEY, current.roomNumber);
        setRoomNumber(current.roomNumber);
        setState("idle");
      } catch (error) {
        if (cancelled) {
          return;
        }

        if (
          !(error instanceof ApiError) ||
          error.statusCode === 401 ||
          error.statusCode === 404
        ) {
          resetGuestAccess();
        } else {
          setRoomNumber(storedRoom);
          setState("idle");
        }
      } finally {
        if (!cancelled) {
          setIsBootstrappingSession(false);
        }
      }
    }

    void bootstrapRoomSession();

    return () => {
      cancelled = true;
    };
  }, [resetGuestAccess]);

  const handleParseRequest = useCallback(async (transcript: string) => {
    try {
      const result = await parseRequest(roomNumber!, transcript);

      if (result.clarification) {
        setParsedResult(result);
        setErrorMessage(null);
        setState("confirming");
        return;
      }

      if (result.items.length === 0) {
        playCue("mismatch");
        setParsedResult(null);
        setHintMessage(t("hint.sayAgain"));
        setState("idle");
        return;
      }

      setParsedResult(result);
      setState("confirming");
    } catch (err) {
      playCue("error");
      if (isConnectionError(err)) {
        const message = err instanceof Error ? err.message : "Something went wrong, please try again.";
        setErrorMessage(message);
        setState("confirming");
        return;
      }
      setHintMessage(t("hint.sayAgain"));
      setState("idle");
    }
  }, [playCue, roomNumber, t]);

  const voice = useVoiceCapture({
    onFinalTranscript: (transcript) => {
      if (state !== "listening" && state !== "processing") {
        return;
      }

      setLastTranscript(transcript);
      setState("processing");
      void handleParseRequest(transcript);
    },
    onError: () => {
      if (state !== "listening" && state !== "processing") {
        return;
      }

      playCue("error");
      setHintMessage(t("hint.sayAgain"));
      setState("idle");
    },
    onStopWithoutTranscript: () => {
      if (state === "listening" || state === "processing") {
        setState("idle");
      }
    },
  });
  const { connectionStatus, requests, setRequests } = useGuestSocket(roomNumber, {
    onSessionRevoked: () => {
      playCue("error");
      resetGuestAccess(t("error.sessionRevoked"));
    },
  });

  const wakeWord = useWakeWord({
    enabled: WAKE_WORD_ENABLED && state === "idle",
    onWake: (command) => {
      hasArmedWakeWordRef.current = true;
      playCue("activation");
      setErrorMessage(null);
      setHintMessage(null);
      setParsedResult(null);
      setPartialLines(null);
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
    hasArmedWakeWordRef.current = false;
  }

  function handleStartListening() {
    void primeAudio();
    setErrorMessage(null);
    setHintMessage(null);
    setState("listening");
    playCue("listening");
    voice.start();
  }

  function handleStopListening() {
    const capturedTranscript = (voice.finalTranscript || voice.interimTranscript).trim();

    if (capturedTranscript && state === "listening") {
      setLastTranscript(capturedTranscript);
      setState("processing");
    }

    voice.stop();
  }

  async function submitFinalRequest(allowPartial: boolean) {
    if (!parsedResult || !roomNumber) return;
    setIsSubmitting(true);
    try {
      const newRequest = await createRequest(
        roomNumber,
        lastTranscript,
        parsedResult.items,
        parsedResult.category,
        { allowPartial },
      );
      playCue("success");
      setRequests((prev) => [newRequest, ...prev.filter((entry) => entry.id !== newRequest.id)]);
      setParsedResult(null);
      setPartialLines(null);
      setLastTranscript("");
      setState("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create request.";
      playCue("error");
      setErrorMessage(message);
      setPartialLines(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleConfirm() {
    if (!parsedResult || !roomNumber) return;
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const preview = await previewGuestRequest({
        items: parsedResult.items.map((item) => ({
          inventoryItemId: item.inventory_item_id,
          quantity: item.quantity,
        })),
      });

      if (!preview.anyAvailable) {
        playCue("error");
        setErrorMessage(t("partial.description"));
        setIsSubmitting(false);
        return;
      }

      if (preview.fullyAvailable) {
        await submitFinalRequest(false);
        return;
      }

      // Some but not all items — ask the guest to confirm a partial order.
      setPartialLines(preview.lines);
      setIsSubmitting(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to check availability.";
      playCue("error");
      setErrorMessage(message);
      setIsSubmitting(false);
    }
  }

  async function handleClarifySelect(item: {
    inventory_item_id: string;
    name: string;
    quantity: number;
  }) {
    if (!parsedResult || !roomNumber) return;
    if (isSubmitting) return;

    setIsSubmitting(true);

    try {
      const newRequest = await createRequest(
        roomNumber,
        lastTranscript,
        [item],
        parsedResult.category,
      );
      playCue("success");
      setRequests((prev) => [newRequest, ...prev.filter((entry) => entry.id !== newRequest.id)]);
      setParsedResult(null);
      setLastTranscript("");
      setState("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create request.";
      playCue("error");
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleConfirmPartial() {
    if (isSubmitting) return;
    void submitFinalRequest(true);
  }

  function handleCancelPartial() {
    if (isSubmitting) return;
    setPartialLines(null);
    setParsedResult(null);
    setLastTranscript("");
    setState("idle");
  }

  function handleCancel() {
    setParsedResult(null);
    setPartialLines(null);
    setLastTranscript("");
    setErrorMessage(null);
    setState("idle");
  }

  function handleDismissError() {
    setErrorMessage(null);
    setPartialLines(null);
    setParsedResult(null);
    setLastTranscript("");
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
    <div className="guest-theme dark min-h-[100dvh] bg-[var(--guest-bg)]">
      <LanguageToggle />
      <VoiceHintToast
        message={hintMessage}
        onDismiss={() => setHintMessage(null)}
      />

      {isBootstrappingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--guest-bg)]">
          <div className="flex flex-col items-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--guest-accent)] border-t-transparent" />
            <p className="text-sm text-[var(--guest-text-muted)]">
              {t("setup.loadingRoom")}
            </p>
          </div>
        </div>
      )}

      {!isBootstrappingSession && state === "setup" && (
        <SetupScreen
          onSubmit={handleSetupSubmit}
          onPrimeAudio={primeAudio}
          onArmWakeWord={WAKE_WORD_ENABLED ? wakeWord.arm : async () => undefined}
        />
      )}

      {!isBootstrappingSession && state !== "setup" && (
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

          {state === "confirming" && parsedResult && !errorMessage && !partialLines && (
            <ConfirmPopup
              parsed={parsedResult}
              transcript={lastTranscript}
              onConfirm={handleConfirm}
              onCancel={handleCancel}
              isSubmitting={isSubmitting}
              onClarifySelect={handleClarifySelect}
            />
          )}

          {state === "confirming" && partialLines && !errorMessage && (
            <PartialConfirmPopup
              lines={partialLines}
              onConfirm={handleConfirmPartial}
              onCancel={handleCancelPartial}
              isSubmitting={isSubmitting}
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

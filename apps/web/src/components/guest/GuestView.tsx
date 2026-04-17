"use client";

import type { ConnectionStatus, GuestRequest } from "@/lib/types";
import { ConnectionInfo } from "./ConnectionInfo";
import { OrbButton } from "./OrbButton";
import { RequestList } from "./RequestList";

interface GuestViewProps {
  roomNumber: string;
  connectionStatus: ConnectionStatus;
  requests: GuestRequest[];
  isListening: boolean;
  onStartListening: () => void;
  onStopListening: () => void;
}

export function GuestView({
  roomNumber,
  connectionStatus,
  requests,
  isListening,
  onStartListening,
  onStopListening,
}: GuestViewProps) {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-5xl flex-col bg-[var(--guest-bg)]">
      <div className="p-4 pt-20">
        <ConnectionInfo status={connectionStatus} roomNumber={roomNumber} />
      </div>

      <RequestList requests={requests} />

      <OrbButton
        isListening={isListening}
        onStartListening={onStartListening}
        onStopListening={onStopListening}
      />
    </div>
  );
}

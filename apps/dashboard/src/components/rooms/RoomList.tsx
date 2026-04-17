"use client";

import { useEffect, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Copy, KeyRound, RotateCcw, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { ApiError } from "@/lib/api";
import {
  useIssuePairingCodeMutation,
  useResetRoomHistoryMutation,
  useRoomsQuery,
} from "@/hooks/useRoomsQuery";
import { RevokeSessionDialog } from "./RevokeSessionDialog";
import type { RoomDTO, RoomDeviceSessionDTO } from "@/lib/types";

/**
 * Rooms overview — one card per room, showing only the active connection (if
 * any). Staff can issue a single-use pairing code (6 digits) that the tablet
 * must enter to connect. Issuing a code does not kick the current tablet;
 * the pairing itself does, atomically.
 */
export function RoomList() {
  const { data, isLoading, isError, error } = useRoomsQuery();
  const [revoking, setRevoking] = useState<
    | null
    | { session: RoomDeviceSessionDTO; roomNumber: string }
  >(null);

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  if (isError) {
    const message =
      error instanceof Error ? error.message : "Failed to load rooms.";
    return <p className="text-destructive">Failed to load rooms — {message}</p>;
  }

  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground">No rooms have been seeded yet.</p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {data.map((room) => (
          <RoomCard
            key={room.id}
            room={room}
            onRevoke={(session) =>
              setRevoking({ session, roomNumber: room.number })
            }
          />
        ))}
      </div>

      {revoking ? (
        <RevokeSessionDialog
          session={revoking.session}
          roomNumber={revoking.roomNumber}
          onClose={() => setRevoking(null)}
        />
      ) : null}
    </>
  );
}

function RoomCard({
  room,
  onRevoke,
}: {
  room: RoomDTO;
  onRevoke: (session: RoomDeviceSessionDTO) => void;
}) {
  const activeSession = room.activeSessions[0] ?? null;
  const activeDevice = activeSession
    ? room.devices.find((d) => d.id === activeSession.roomDeviceId) ?? null
    : null;

  return (
    <Card className="flex flex-col">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
        <div>
          <h3 className="text-lg font-semibold">Room {room.number}</h3>
          <p className="font-mono text-xs text-muted-foreground">{room.code}</p>
        </div>
        {activeSession ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
            <Wifi className="h-3 w-3" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <WifiOff className="h-3 w-3" /> Idle
          </span>
        )}
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-4">
        {activeSession && activeDevice ? (
          <ActiveConnection
            roomId={room.id}
            session={activeSession}
            deviceName={activeDevice.name}
            lastSeenAt={activeDevice.lastSeenAt}
            onRevoke={() => onRevoke(activeSession)}
          />
        ) : (
          <PairingPanel room={room} />
        )}
      </CardContent>
    </Card>
  );
}

function ActiveConnection({
  roomId,
  session,
  deviceName,
  lastSeenAt,
  onRevoke,
}: {
  roomId: string;
  session: RoomDeviceSessionDTO;
  deviceName: string;
  lastSeenAt: string | null;
  onRevoke: () => void;
}) {
  const reset = useResetRoomHistoryMutation();

  async function onReset() {
    try {
      await reset.mutateAsync({ roomId });
      toast.success("Tablet history cleared");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reset failed");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="space-y-1 text-sm">
        <p className="font-medium">{deviceName}</p>
        <p className="text-xs text-muted-foreground">
          Paired {format(new Date(session.createdAt), "PP p")}
        </p>
        {lastSeenAt ? (
          <p className="text-xs text-muted-foreground">
            Last seen {formatDistanceToNowStrict(new Date(lastSeenAt), { addSuffix: true })}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          Expires {formatDistanceToNowStrict(new Date(session.expiresAt), { addSuffix: true })}
        </p>
      </div>
      <div className="mt-auto flex flex-col gap-2">
        <Button
          size="sm"
          variant="outline"
          onClick={onReset}
          disabled={reset.isPending}
        >
          <RotateCcw className="mr-2 h-4 w-4" />
          {reset.isPending ? "Resetting…" : "Reset history"}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={onRevoke}
        >
          Disconnect tablet
        </Button>
      </div>
    </div>
  );
}

function PairingPanel({ room }: { room: RoomDTO }) {
  const issue = useIssuePairingCodeMutation();
  const [now, setNow] = useState(() => Date.now());

  const expiresAt = room.pairingCodeExpiresAt
    ? new Date(room.pairingCodeExpiresAt).getTime()
    : null;
  const isValid = Boolean(
    room.pairingCode && expiresAt != null && expiresAt > now,
  );
  const secondsLeft = expiresAt != null ? Math.max(0, Math.floor((expiresAt - now) / 1000)) : 0;

  useEffect(() => {
    if (!isValid) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [isValid]);

  async function onIssue() {
    try {
      await issue.mutateAsync({ roomId: room.id });
      toast.success("Pairing code issued");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Issue failed");
    }
  }

  async function copyCode() {
    if (!room.pairingCode) return;
    try {
      await navigator.clipboard.writeText(room.pairingCode);
      toast.success("Code copied");
    } catch {
      toast.error("Copy failed");
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-3">
      {isValid && room.pairingCode ? (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground">
            Enter on the tablet — expires in{" "}
            {Math.floor(secondsLeft / 60)}:
            {String(secondsLeft % 60).padStart(2, "0")}
          </p>
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-2xl font-semibold tracking-[0.35em]">
              {room.pairingCode}
            </span>
            <Button size="icon-sm" variant="outline" onClick={copyCode} title="Copy">
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          No tablet connected. Issue a one-time code for staff to enter on the
          tablet.
        </p>
      )}

      <Button
        size="sm"
        variant={isValid ? "outline" : "default"}
        onClick={onIssue}
        disabled={issue.isPending}
        className="mt-auto"
      >
        <KeyRound className="mr-2 h-4 w-4" />
        {issue.isPending
          ? "Issuing…"
          : isValid
            ? "Replace code"
            : "Issue pairing code"}
      </Button>
    </div>
  );
}

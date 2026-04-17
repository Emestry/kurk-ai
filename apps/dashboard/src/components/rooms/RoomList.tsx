"use client";

import { useEffect, useMemo, useState } from "react";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";
import { Ban, Copy, KeyRound, RotateCcw, Search, Wifi, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api";
import {
  useIssuePairingCodeMutation,
  useRevokePairingCodeMutation,
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
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<
    | null
    | { session: RoomDeviceSessionDTO; roomNumber: string }
  >(null);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return data;
    return data.filter((room) => room.number.toLowerCase().includes(needle));
  }, [data, query]);

  const expandedRoom = useMemo(
    () => (expandedId ? data?.find((room) => room.id === expandedId) ?? null : null),
    [data, expandedId],
  );

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
      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-full max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search room number…"
            className="pl-9"
            aria-label="Search rooms"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No rooms match &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
          {filtered.map((room) => (
            <RoomCard
              key={room.id}
              room={room}
              onOpen={() => setExpandedId(room.id)}
            />
          ))}
        </div>
      )}

      {expandedRoom ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setExpandedId(null);
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader className="p-6 pb-2">
              <DialogTitle>Room {expandedRoom.number}</DialogTitle>
            </DialogHeader>
            <div className="px-6 pb-6">
              <RoomDetails
                room={expandedRoom}
                onRevoke={(session) =>
                  setRevoking({ session, roomNumber: expandedRoom.number })
                }
              />
            </div>
          </DialogContent>
        </Dialog>
      ) : null}

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
  onOpen,
}: {
  room: RoomDTO;
  onOpen: () => void;
}) {
  const activeSession = room.activeSessions[0] ?? null;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl bg-card px-4 py-3 text-left text-sm text-card-foreground ring-1 ring-foreground/10 transition-all hover:-translate-y-0.5 hover:ring-primary/50 hover:bg-accent/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h3 className="text-base font-semibold">Room {room.number}</h3>
      {activeSession ? (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
          <Wifi className="h-3 w-3" /> Connected
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
          <WifiOff className="h-3 w-3" /> Idle
        </span>
      )}
    </button>
  );
}

function RoomDetails({
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-xs text-muted-foreground">{room.code}</p>
        {activeSession ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs font-medium text-emerald-400">
            <Wifi className="h-3 w-3" /> Connected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            <WifiOff className="h-3 w-3" /> Idle
          </span>
        )}
      </div>
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
    </div>
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
  const revoke = useRevokePairingCodeMutation();
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

  async function onRevoke() {
    try {
      await revoke.mutateAsync({ roomId: room.id });
      toast.success("Pairing code disabled");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Disable failed");
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
        disabled={issue.isPending || revoke.isPending}
        className={isValid ? "" : "mt-auto"}
      >
        <KeyRound className="mr-2 h-4 w-4" />
        {issue.isPending
          ? "Issuing…"
          : isValid
            ? "Replace code"
            : "Issue pairing code"}
      </Button>

      {isValid ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onRevoke}
          disabled={revoke.isPending || issue.isPending}
          className="text-muted-foreground hover:text-foreground"
        >
          <Ban className="mr-2 h-4 w-4" />
          {revoke.isPending ? "Disabling…" : "Disable code"}
        </Button>
      ) : null}
    </div>
  );
}

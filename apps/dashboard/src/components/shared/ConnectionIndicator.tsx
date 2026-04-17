"use client";
import { useLiveEvents } from "@/hooks/useLiveEvents";

const TEXT: Record<string, string> = {
  connecting: "Connecting…",
  open: "Live",
  reconnecting: "Reconnecting…",
  closed: "Disconnected",
};

const COLOR: Record<string, string> = {
  connecting: "bg-amber-400",
  open: "bg-emerald-500",
  reconnecting: "bg-amber-400 animate-pulse",
  closed: "bg-red-500",
};

/**
 * Displays the current WebSocket connection state as a coloured dot + label.
 */
export function ConnectionIndicator() {
  const { state } = useLiveEvents();
  return (
    <div
      className="flex items-center gap-2 text-xs text-muted-foreground"
      title={TEXT[state]}
    >
      <span className={`h-2 w-2 rounded-full ${COLOR[state]}`} aria-hidden />
      <span>{TEXT[state]}</span>
    </div>
  );
}

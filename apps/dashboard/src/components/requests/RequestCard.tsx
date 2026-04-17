"use client";

import { formatDistanceToNowStrict } from "date-fns";
import { Mic, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useEtaCountdown } from "@/hooks/useEtaCountdown";
import type { GuestRequestDTO, RequestStatus } from "@/lib/types";

interface Props {
  request: GuestRequestDTO;
  onAcknowledge: () => void;
  onMarkDelivered: () => void;
  onOpenDrawer: () => void;
  subdued?: boolean;
}

/**
 * Single request card for the kanban board. The card surfaces only the
 * status-advancing primary action; secondary actions (partial delivery,
 * reject, notes, ETA) live in the side drawer — click the card body to
 * open it.
 */
export function RequestCard({
  request,
  onAcknowledge,
  onMarkDelivered,
  onOpenDrawer,
  subdued = false,
}: Props) {
  const relative = formatDistanceToNowStrict(new Date(request.createdAt), {
    addSuffix: true,
  });
  const eta = useEtaCountdown(request.etaAt, request.status);

  return (
    <article
      className={`cursor-pointer rounded-xl border p-4 shadow-sm transition-colors ${
        subdued
          ? "border-border/60 bg-card/65 opacity-85 hover:border-border/70"
          : "border-border bg-card hover:border-border/80"
      }`}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        onOpenDrawer();
      }}
    >
      <header className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-lg font-semibold">Room {request.roomNumber}</span>
          <span className="text-xs text-muted-foreground">· {relative}</span>
        </div>
        <StatusBadge status={request.status} />
      </header>

      <p className="mb-3 line-clamp-2 text-sm text-foreground/80">
        {request.rawText}
      </p>

      <ul className="mb-3 space-y-1 text-xs text-muted-foreground">
        {request.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between">
            <span>
              {item.requestedQuantity}× {item.name}
            </span>
            <span className="font-mono">
              {item.deliveredQuantity}/{item.requestedQuantity}
            </span>
          </li>
        ))}
      </ul>

      <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
        {request.source === "voice" ? (
          <Mic className="h-3 w-3" />
        ) : (
          <Type className="h-3 w-3" />
        )}
        {request.category ? (
          <span className="rounded-full bg-muted px-2 py-0.5 capitalize">
            {request.category.replace("_", " ")}
          </span>
        ) : null}
        {eta.label ? <span>ETA {eta.label}</span> : null}
      </div>

      {request.staffNote ? (
        <p className="mb-3 italic text-xs text-muted-foreground">
          &ldquo;{request.staffNote}&rdquo;
        </p>
      ) : null}

      <PrimaryAction
        status={request.status}
        onAcknowledge={onAcknowledge}
        onMarkDelivered={onMarkDelivered}
      />
    </article>
  );
}

function PrimaryAction(props: {
  status: RequestStatus;
  onAcknowledge: () => void;
  onMarkDelivered: () => void;
}) {
  const { status, onAcknowledge, onMarkDelivered } = props;

  if (status === "received") {
    return (
      <Button size="sm" className="w-full" onClick={onAcknowledge}>
        Acknowledge
      </Button>
    );
  }

  if (status === "in_progress") {
    return (
      <Button size="sm" className="w-full" onClick={onMarkDelivered}>
        Mark Delivered
      </Button>
    );
  }

  return null;
}

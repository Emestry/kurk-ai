"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { ConciergeBellIcon, type ConciergeBellHandle } from "@/components/ui/concierge-bell";
import {
  getGuestLocale,
  useGuestLanguage,
  type TranslationKey,
} from "@/lib/guest-language";
import { useEtaCountdown } from "@/hooks/useEtaCountdown";
import { cn } from "@/lib/utils";
import type { GuestRequest, RequestStatus } from "@/lib/types";

interface RequestCardProps {
  request: GuestRequest;
  isExpanded?: boolean;
  onToggle?: () => void;
}

const STATUS_CONFIG: Record<
  RequestStatus,
  { labelKey: TranslationKey; descriptionKey: TranslationKey; color: string }
> = {
  received: {
    labelKey: "request.received.label",
    descriptionKey: "request.received.description",
    color: "var(--guest-status-received)",
  },
  in_progress: {
    labelKey: "request.in_progress.label",
    descriptionKey: "request.in_progress.description",
    color: "var(--guest-status-in-progress)",
  },
  delivered: {
    labelKey: "request.delivered.label",
    descriptionKey: "request.delivered.description",
    color: "var(--guest-status-delivered)",
  },
  partially_delivered: {
    labelKey: "request.partially_delivered.label",
    descriptionKey: "request.partially_delivered.description",
    color: "var(--guest-status-delivered)",
  },
  rejected: {
    labelKey: "request.rejected.label",
    descriptionKey: "request.rejected.description",
    color: "var(--guest-status-rejected)",
  },
};

function formatTimeAgo(dateString: string, locale: string) {
  const now = Date.now();
  const then = new Date(dateString).getTime();
  const diffSeconds = Math.floor((then - now) / 1000);
  const formatter = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  });

  if (Math.abs(diffSeconds) < 60) return formatter.format(diffSeconds, "second");
  const diffMinutes = Math.floor(diffSeconds / 60);
  if (Math.abs(diffMinutes) < 60) return formatter.format(diffMinutes, "minute");
  const diffHours = Math.floor(diffMinutes / 60);
  return formatter.format(diffHours, "hour");
}

function isCompleted(status: RequestStatus): boolean {
  return status === "delivered" || status === "partially_delivered";
}

function InProgressIcon({ playKey, expanded }: { playKey: number; expanded: boolean }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (playKey > 0 && containerRef.current) {
      const el = containerRef.current.querySelector("lord-icon") as HTMLElement & {
        playerInstance?: { play: () => void; playFromBeginning: () => void };
      } | null;
      el?.playerInstance?.playFromBeginning();
    }
  }, [playKey]);

  return (
    <div
      ref={containerRef}
      className={cn("transition-opacity", expanded ? "opacity-100" : "opacity-60")}
    >
      <lord-icon
        src="https://cdn.lordicon.com/njmquueq.json"
        trigger="none"
        state="hover-pinch"
        colors="primary:#D4913A"
        style={{ width: "28px", height: "28px" }}
      />
    </div>
  );
}

function ReceivedIcon({ animate }: { animate: boolean }) {
  const bellRef = useRef<ConciergeBellHandle>(null);

  useEffect(() => {
    if (animate && bellRef.current) {
      bellRef.current.startAnimation();
    }
  }, [animate]);

  return (
    <ConciergeBellIcon
      ref={bellRef}
      size={22}
      className={cn("transition-opacity", animate ? "opacity-100" : "opacity-60")}
      style={{ color: "var(--guest-status-received)" }}
    />
  );
}

export function RequestCard({ request, isExpanded, onToggle }: RequestCardProps) {
  const { language, t } = useGuestLanguage();
  const [internalExpanded, setInternalExpanded] = useState(false);
  const [playCount, setPlayCount] = useState(0);
  const config = STATUS_CONFIG[request.status];
  const completed = isCompleted(request.status);
  const rejected = request.status === "rejected";
  const isPast = completed || rejected;
  const expanded = isExpanded ?? internalExpanded;
  const eta = useEtaCountdown(request.etaAt, request.status);

  const handleClick = useCallback(() => {
    if (onToggle) {
      if (!expanded && request.status === "in_progress") {
        setPlayCount((count) => count + 1);
      }
      onToggle();
      return;
    }

    setInternalExpanded((prev) => {
      if (!prev && request.status === "in_progress") {
        setPlayCount((count) => count + 1);
      }
      return !prev;
    });
  }, [expanded, onToggle, request.status]);

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "group relative flex w-full gap-4 rounded-2xl p-5 text-left transition-all duration-200",
        isPast
          ? "border border-[var(--guest-border-dim)] hover:border-[var(--guest-border)]"
          : "border border-[var(--guest-border)] hover:border-[var(--guest-text-dim)]",
      )}
    >
      <div
        className={cn(
          "absolute bottom-4 left-0 top-4 w-0.5 rounded-full",
          isPast && "opacity-50",
        )}
        style={{ backgroundColor: config.color }}
      />

      <div className="min-w-0 flex-1 pl-2">
        <div className="mb-2 flex items-center gap-3">
          <span
            className="text-xs font-medium tracking-wide"
            style={{ color: config.color }}
          >
            {t(config.labelKey)}
          </span>
          <span className="text-[0.65rem] text-[var(--guest-text-dim)]">
            {formatTimeAgo(request.createdAt, getGuestLocale(language))}
          </span>
          {eta.label ? (
            <span
              className="text-[0.65rem] font-medium"
              style={{ color: config.color }}
            >
              ETA {eta.label}
            </span>
          ) : null}
        </div>

        <p className="mb-1 text-[0.65rem] uppercase tracking-wider text-[var(--guest-text-dim)]">
          {t("request.yourRequest")}
        </p>
        <p
          className={cn(
            "border-l-2 border-[var(--guest-border-dim)] pl-3 text-sm italic leading-relaxed text-[var(--guest-text)]",
            isPast && "text-[var(--guest-text-muted)]",
          )}
        >
          &ldquo;{request.text}&rdquo;
        </p>

        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {request.items.map((item) => (
            <span
              key={item.inventory_item_id}
              className="text-xs text-[var(--guest-text-dim)]"
            >
              {request.status === "partially_delivered"
                ? `${item.quantity_fulfilled}/${item.quantity_requested} ${item.name}`
                : `${item.quantity_requested}x ${item.name}`}
            </span>
          ))}
        </div>

        {expanded && (
          <p className="mt-3 text-xs leading-relaxed text-[var(--guest-text-dim)]">
            {t(config.descriptionKey)}
          </p>
        )}

        {(rejected || request.status === "partially_delivered") && request.notes && (
          <p className="mt-2 text-xs" style={{ color: config.color }}>
            {request.notes}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center">
        {request.status === "received" && <ReceivedIcon animate={expanded} />}
        {request.status === "in_progress" && (
          <InProgressIcon playKey={playCount} expanded={expanded} />
        )}
        {completed && (
          <Check
            className="h-5 w-5"
            strokeWidth={2.5}
            style={{ color: "var(--guest-status-delivered)" }}
          />
        )}
        {rejected && (
          <X
            className="h-5 w-5"
            strokeWidth={2.5}
            style={{ color: "var(--guest-status-rejected)" }}
          />
        )}
      </div>
    </button>
  );
}

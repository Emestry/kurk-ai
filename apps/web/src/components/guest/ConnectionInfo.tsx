"use client";

import { useEffect, useState } from "react";
import { useGuestLanguage, type TranslationKey } from "@/lib/guest-language";
import { cn } from "@/lib/utils";
import type { ConnectionStatus } from "@/lib/types";

interface ConnectionInfoProps {
  status: ConnectionStatus;
  roomNumber: string;
}

const STATUS_CONFIG: Record<ConnectionStatus, { color: string; labelKey: TranslationKey }> = {
  connected: {
    color: "bg-[var(--guest-dot-connected)]",
    labelKey: "connection.connected",
  },
  reconnecting: {
    color: "bg-[var(--guest-dot-reconnecting)] animate-pulse",
    labelKey: "connection.reconnecting",
  },
  disconnected: {
    color: "bg-[var(--guest-dot-disconnected)]",
    labelKey: "connection.disconnected",
  },
};

export function ConnectionInfo({ status, roomNumber }: ConnectionInfoProps) {
  const { t } = useGuestLanguage();
  const [showLabel, setShowLabel] = useState(false);

  useEffect(() => {
    if (!showLabel) return;
    const timer = setTimeout(() => setShowLabel(false), 2000);
    return () => clearTimeout(timer);
  }, [showLabel]);

  const config = STATUS_CONFIG[status];

  return (
    <button
      type="button"
      onClick={() => setShowLabel(true)}
      className="flex items-center gap-2 rounded-xl px-3 py-2 transition-colors hover:bg-[var(--guest-surface)]"
    >
      <span
        className={cn("inline-block h-2.5 w-2.5 rounded-full", config.color)}
      />
      <span className="text-sm text-[var(--guest-text-muted)]">
          {t("connection.roomLabel", { roomNumber })}
      </span>
      {showLabel && (
        <span className="animate-in ml-1 text-xs text-[var(--guest-text-dim)] fade-in duration-200">
          {t(config.labelKey)}
        </span>
      )}
    </button>
  );
}

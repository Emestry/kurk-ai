"use client";

import { useEffect, useState } from "react";
import type { RequestStatus } from "@/lib/types";

interface EtaCountdown {
  minutes: number | null;
  label: string | null;
}

/**
 * Ticks once per second and returns the rounded-up minutes between `now` and
 * `etaAt`. Shows "soon" once the deadline has passed but the request is still
 * open, and hides itself entirely for delivered/rejected requests.
 */
export function useEtaCountdown(
  etaAt: string | null,
  status: RequestStatus,
): EtaCountdown {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!etaAt) return;
    if (status === "delivered" || status === "rejected") return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [etaAt, status]);

  if (!etaAt) return { minutes: null, label: null };
  if (status === "delivered" || status === "rejected") {
    return { minutes: null, label: null };
  }

  const remainingMs = new Date(etaAt).getTime() - now;
  const minutes = Math.max(0, Math.ceil(remainingMs / 60_000));
  const label = remainingMs <= 0 ? "soon" : `${minutes} min`;
  return { minutes, label };
}

"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useLiveEvents } from "./useLiveEvents";
import { useSoundAlert } from "./useSoundAlert";
import { queryKeys } from "@/lib/query-keys";
import type { LiveEvent } from "@/lib/types";

/**
 * Bridges WS events into the TanStack Query cache. Mounted once at the
 * app shell level.
 *
 * NOTE: The backend's publishRealtimeEvent sends only a partial data payload
 * (e.g. { roomNumber, category, guestMessage, rejectionReason }) — NOT the
 * full RequestSummary shape. Fields like requestId, rawText, source, items,
 * createdAt, and updatedAt are absent from event.data. Therefore we cannot
 * call mapStaffRequest(event.data) here; instead we fall back to
 * invalidateQueries so the query refetches fresh data from GET /staff/requests.
 *
 * For request.created we additionally fire the sound alert and a toast using
 * the partial fields that are available (roomNumber, guestMessage).
 */
export function useRequestEventBridge() {
  const { subscribe, state } = useLiveEvents();
  const qc = useQueryClient();
  const playSound = useSoundAlert();

  useEffect(() => {
    if (state !== "open") return;
    const unsubscribe = subscribe((event: LiveEvent) => {
      switch (event.type) {
        case "request.created": {
          // Partial data only — invalidate and let the query refetch.
          // Requests and inventory share state via reservations: every
          // new request reserves stock, so refresh inventory too (the
          // inventory.updated event is best-effort and can be missed).
          qc.invalidateQueries({ queryKey: queryKeys.requests.all() });
          qc.invalidateQueries({ queryKey: queryKeys.inventory.all() });
          playSound();
          toast(`New request · Room ${String(event.data.roomNumber ?? "")}`, {
            description: String(event.data.guestMessage ?? ""),
          });
          break;
        }
        case "request.updated":
        case "request.rejected":
        case "request.delivered": {
          // Reservations release / deliver on these transitions → inventory
          // counts move too, so invalidate both caches.
          qc.invalidateQueries({ queryKey: queryKeys.requests.all() });
          qc.invalidateQueries({ queryKey: queryKeys.inventory.all() });
          break;
        }
        case "inventory.updated":
        case "alert.low_stock":
          // Backend emits alert.low_stock *instead of* inventory.updated once
          // an item crosses its threshold (see inventory-service.emitInventoryUpdate),
          // so we must refresh on both to keep Reserved/Available counts current.
          qc.invalidateQueries({ queryKey: queryKeys.inventory.all() });
          break;
        case "stocktake.finalized":
          qc.invalidateQueries({ queryKey: queryKeys.stocktake.all() });
          qc.invalidateQueries({ queryKey: queryKeys.reports.all() });
          break;
      }
    });
    return unsubscribe;
  }, [state, subscribe, qc, playSound]);

  useEffect(() => {
    if (state === "open") {
      qc.invalidateQueries({ queryKey: queryKeys.requests.all() });
      qc.invalidateQueries({ queryKey: queryKeys.inventory.all() });
    }
  }, [state, qc]);
}

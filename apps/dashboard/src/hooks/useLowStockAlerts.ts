"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { queryKeys } from "@/lib/query-keys";
import type { InventoryItemDTO } from "@/lib/types";

const DEBOUNCE_MS = 5 * 60 * 1000;

/**
 * Fires a toast when an inventory item crosses below its low-stock
 * threshold during a fulfillment event. Passive "already low" items are
 * shown via the tab pip, not toasted.
 */
export function useLowStockAlerts() {
  const qc = useQueryClient();
  const prevRef = useRef<Map<string, number>>(new Map());
  const lastToastRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const unsub = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated") return;
      const query = event.query;
      if (!Array.isArray(query.queryKey) || query.queryKey[0] !== "inventory") return;
      const next = qc.getQueryData<InventoryItemDTO[]>(queryKeys.inventory.list());
      if (!next) return;
      const now = Date.now();
      for (const item of next) {
        const prevAvailable = prevRef.current.get(item.id);
        prevRef.current.set(item.id, item.quantityAvailable);
        if (prevAvailable == null) continue;
        if (
          prevAvailable > item.lowStockThreshold &&
          item.quantityAvailable <= item.lowStockThreshold
        ) {
          const last = lastToastRef.current.get(item.id) ?? 0;
          if (now - last < DEBOUNCE_MS) continue;
          lastToastRef.current.set(item.id, now);
          toast.warning(
            `${item.name} is low — ${item.quantityAvailable} left`,
            {
              description: "Consider restocking.",
            },
          );
        }
      }
    });
    return () => unsub();
  }, [qc]);
}

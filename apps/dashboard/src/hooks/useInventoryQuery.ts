"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  InventoryAdjustmentReason,
  InventoryItemDTO,
  InventoryMovementDTO,
  RequestCategory,
} from "@/lib/types";

/**
 * Normalizes a raw inventory item response into the client DTO shape.
 *
 * The backend's toInventoryItemSummary() returns camelCase fields but does
 * NOT include createdAt/updatedAt. We default them to empty strings since
 * the dashboard doesn't render those fields on inventory items.
 */
export function mapInventoryItem(raw: unknown): InventoryItemDTO {
  const r = raw as Record<string, unknown>;
  return {
    id: r.id as string,
    sku: r.sku as string,
    name: r.name as string,
    category: r.category as RequestCategory,
    unit: r.unit as string,
    quantityInStock: r.quantityInStock as number,
    quantityReserved: r.quantityReserved as number,
    quantityAvailable: r.quantityAvailable as number,
    lowStockThreshold: r.lowStockThreshold as number,
    isActive: r.isActive as boolean,
    createdAt: (r.createdAt as string | undefined) ?? "",
    updatedAt: (r.updatedAt as string | undefined) ?? "",
  };
}

/**
 * Normalizes a raw movement response into the client DTO shape.
 *
 * GET /staff/inventory/movements returns { movements: [...] }.
 * Each movement matches InventoryMovementDTO fields directly.
 */
export function mapInventoryMovement(raw: unknown): InventoryMovementDTO {
  const r = raw as Record<string, unknown>;
  return {
    id: r.id as string,
    inventoryItemId: r.inventoryItemId as string,
    requestId: (r.requestId as string | null) ?? null,
    type: r.type as InventoryMovementDTO["type"],
    reason: (r.reason as InventoryMovementDTO["reason"]) ?? null,
    quantityDelta: r.quantityDelta as number,
    note: (r.note as string | null) ?? null,
    createdAt: r.createdAt as string,
  };
}

export function useInventoryQuery() {
  return useQuery<InventoryItemDTO[]>({
    queryKey: queryKeys.inventory.list(),
    queryFn: async () => {
      const res = await apiFetch<{ items: unknown[] }>("/staff/inventory");
      return res.items.map(mapInventoryItem);
    },
  });
}

interface RestockInput { itemId: string; quantity: number; note?: string }
export function useRestockMutation() {
  const qc = useQueryClient();
  return useMutation<void, Error, RestockInput>({
    mutationFn: async ({ itemId, ...body }) => {
      // POST /staff/inventory/:id/restock returns { inventoryItemId, quantityAdded }
      // — not a full item summary — so we just fire-and-invalidate.
      await apiFetch<unknown>(`/staff/inventory/${itemId}/restock`, {
        method: "POST",
        body,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.inventory.list() });
    },
  });
}

interface AdjustInput {
  itemId: string;
  quantityDelta: number;
  reason: InventoryAdjustmentReason;
  note?: string;
}
export function useAdjustMutation() {
  const qc = useQueryClient();
  return useMutation<InventoryItemDTO, Error, AdjustInput>({
    mutationFn: async ({ itemId, ...body }) => {
      const raw = await apiFetch<unknown>(`/staff/inventory/${itemId}/adjustments`, {
        method: "POST",
        body,
      });
      return mapInventoryItem(raw);
    },
    onSuccess: (updated) => {
      qc.setQueryData<InventoryItemDTO[]>(queryKeys.inventory.list(), (prev) =>
        prev ? prev.map((i) => (i.id === updated.id ? updated : i)) : [updated],
      );
    },
  });
}

interface CreateItemInput {
  sku: string;
  name: string;
  category: RequestCategory;
  unit: string;
  quantityInStock: number;
  lowStockThreshold: number;
}
export function useCreateItemMutation() {
  const qc = useQueryClient();
  return useMutation<InventoryItemDTO, Error, CreateItemInput>({
    mutationFn: async (body) => {
      const raw = await apiFetch<unknown>("/staff/inventory", {
        method: "POST",
        body,
      });
      return mapInventoryItem(raw);
    },
    onSuccess: (created) => {
      qc.setQueryData<InventoryItemDTO[]>(queryKeys.inventory.list(), (prev) =>
        prev ? [created, ...prev] : [created],
      );
    },
  });
}

interface UpdateItemInput {
  itemId: string;
  name?: string;
  category?: RequestCategory;
  unit?: string;
  lowStockThreshold?: number;
  isActive?: boolean;
}
export function useUpdateItemMutation() {
  const qc = useQueryClient();
  return useMutation<InventoryItemDTO, Error, UpdateItemInput>({
    mutationFn: async ({ itemId, ...body }) => {
      const raw = await apiFetch<unknown>(`/staff/inventory/${itemId}`, {
        method: "PATCH",
        body,
      });
      return mapInventoryItem(raw);
    },
    onSuccess: (updated) => {
      qc.setQueryData<InventoryItemDTO[]>(queryKeys.inventory.list(), (prev) =>
        prev ? prev.map((i) => (i.id === updated.id ? updated : i)) : [updated],
      );
    },
  });
}

export function useItemMovementsQuery(itemId: string | null) {
  return useQuery<InventoryMovementDTO[]>({
    enabled: Boolean(itemId),
    queryKey: itemId ? queryKeys.inventory.movements(itemId) : ["inventory", "movements", "nil"],
    queryFn: async () => {
      const res = await apiFetch<{ movements: unknown[] }>(
        `/staff/inventory/movements?inventoryItemId=${itemId}`,
      );
      return res.movements.map(mapInventoryMovement);
    },
  });
}

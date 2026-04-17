"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  RequestCategory,
  StocktakeDiscrepancyReason,
  StocktakeLineDTO,
  StocktakeSessionDTO,
  StocktakeStatus,
} from "@/lib/types";

/**
 * Normalize a raw stocktake line response to the client DTO shape.
 * Backend includes a nested `inventoryItem` relation; we flatten
 * its name and category to the `itemName` / `itemCategory` fields
 * expected by StocktakeLineDTO.
 */
export function mapStocktakeLine(raw: unknown): StocktakeLineDTO {
  const r = raw as Record<string, unknown>;
  const item = (r.inventoryItem ?? {}) as Record<string, unknown>;
  return {
    id: r.id as string,
    sessionId: r.sessionId as string,
    inventoryItemId: r.inventoryItemId as string,
    itemName: (item.name as string | undefined) ?? (r.itemName as string) ?? "",
    itemCategory: ((item.category ?? r.itemCategory) as RequestCategory) ?? "room_service",
    expectedQuantity: r.expectedQuantity as number,
    physicalCount: (r.physicalCount as number | null) ?? null,
    discrepancyQuantity: (r.discrepancyQuantity as number | null) ?? null,
    reason: (r.reason as StocktakeDiscrepancyReason | null) ?? null,
  };
}

/**
 * Normalize a raw stocktake session response to the client DTO shape.
 */
export function mapStocktakeSession(raw: unknown): StocktakeSessionDTO {
  const r = raw as Record<string, unknown>;
  const lines = Array.isArray(r.lines) ? r.lines : [];
  return {
    id: r.id as string,
    status: r.status as StocktakeStatus,
    note: (r.note as string | null) ?? null,
    startedByUserId: (r.startedByUserId as string | null) ?? null,
    finalizedByUserId: (r.finalizedByUserId as string | null) ?? null,
    createdAt: r.createdAt as string,
    finalizedAt: (r.finalizedAt as string | null) ?? null,
    lines: lines.map(mapStocktakeLine),
  };
}

export function useStocktakeListQuery() {
  return useQuery<StocktakeSessionDTO[]>({
    queryKey: queryKeys.stocktake.list(),
    queryFn: async () => {
      const raw = await apiFetch<unknown>("/staff/stocktakes");
      const arr = Array.isArray(raw)
        ? raw
        : (raw as { stocktakes?: unknown[]; sessions?: unknown[]; data?: unknown[] })?.stocktakes ??
          (raw as { sessions?: unknown[] })?.sessions ??
          (raw as { data?: unknown[] })?.data ??
          [];
      return (arr as unknown[]).map(mapStocktakeSession);
    },
  });
}

export function useStocktakeDetailQuery(id: string | null) {
  return useQuery<StocktakeSessionDTO>({
    enabled: Boolean(id),
    queryKey: id ? queryKeys.stocktake.detail(id) : ["stocktake", "detail", "nil"],
    queryFn: async () => {
      const raw = await apiFetch<unknown>(`/staff/stocktakes/${id}`);
      return mapStocktakeSession(raw);
    },
  });
}

export function useStartStocktakeMutation() {
  const qc = useQueryClient();
  return useMutation<StocktakeSessionDTO, Error, void>({
    mutationFn: async () => {
      const raw = await apiFetch<unknown>("/staff/stocktakes", { method: "POST" });
      return mapStocktakeSession(raw);
    },
    onSuccess: (session) => {
      qc.setQueryData<StocktakeSessionDTO[]>(
        queryKeys.stocktake.list(),
        (prev) => (prev ? [session, ...prev] : [session]),
      );
    },
  });
}

interface UpsertLinesInput {
  sessionId: string;
  lines: Array<{
    inventoryItemId: string;
    physicalCount: number;
    reason?: StocktakeDiscrepancyReason;
  }>;
}
export function useUpsertLinesMutation() {
  const qc = useQueryClient();
  return useMutation<StocktakeSessionDTO, Error, UpsertLinesInput>({
    mutationFn: async ({ sessionId, lines }) => {
      const raw = await apiFetch<unknown>(`/staff/stocktakes/${sessionId}/lines`, {
        method: "POST",
        body: { lines },
      });
      return mapStocktakeSession(raw);
    },
    onSuccess: (session) => {
      qc.setQueryData(queryKeys.stocktake.detail(session.id), session);
    },
  });
}

export function useFinalizeStocktakeMutation() {
  const qc = useQueryClient();
  return useMutation<StocktakeSessionDTO, Error, { sessionId: string }>({
    mutationFn: async ({ sessionId }) => {
      const raw = await apiFetch<unknown>(`/staff/stocktakes/${sessionId}/finalize`, {
        method: "POST",
      });
      return mapStocktakeSession(raw);
    },
    onSuccess: (session) => {
      qc.invalidateQueries({ queryKey: queryKeys.stocktake.all() });
      qc.invalidateQueries({ queryKey: queryKeys.inventory.all() });
      qc.setQueryData(queryKeys.stocktake.detail(session.id), session);
    },
  });
}

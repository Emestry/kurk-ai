"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type {
  GuestRequestDTO,
  RequestStatus,
} from "@/lib/types";

interface UpdateRequestInput {
  requestId: string;
  status?: RequestStatus;
  rejectionReason?: string;
  staffNote?: string | null;
  etaMinutes?: number | null;
  items?: Array<{ requestItemId: string; deliveredQuantity: number }>;
}

/**
 * Fetches every request for the staff dashboard. Refetches are driven by
 * WebSocket events, not polling.
 */
export function useRequestsQuery() {
  return useQuery<GuestRequestDTO[]>({
    queryKey: queryKeys.requests.list(),
    queryFn: async () => {
      const raw = await apiFetch<unknown>("/staff/requests");
      const arr = Array.isArray(raw)
        ? raw
        : ((raw as { requests?: unknown[] })?.requests ?? []);
      return arr.map(mapStaffRequest);
    },
  });
}

/**
 * Advances status, sets a note, an ETA, or partial-delivery quantities
 * on an existing request. Performs an optimistic update on the cache
 * keyed by `queryKeys.requests.list()`.
 */
export function useUpdateRequestMutation() {
  const qc = useQueryClient();
  return useMutation<GuestRequestDTO, Error, UpdateRequestInput>({
    mutationFn: async ({ requestId, ...body }) => {
      const raw = await apiFetch<unknown>(`/staff/requests/${requestId}`, {
        method: "PATCH",
        body,
      });
      return mapStaffRequest(raw);
    },
    onSuccess: (updated) => {
      qc.setQueryData<GuestRequestDTO[]>(queryKeys.requests.list(), (prev) => {
        if (!prev) return prev;
        const index = prev.findIndex((r) => r.id === updated.id);
        if (index === -1) return [updated, ...prev];
        const next = prev.slice();
        next[index] = updated;
        return next;
      });
    },
  });
}

/**
 * Pushes the ETA deadline out by N minutes on the server (defaulting to 5
 * when the side panel "+5 min" button is pressed). Uses the same cache
 * update pattern as `useUpdateRequestMutation` so the countdown re-renders
 * instantly without waiting for a WebSocket round-trip.
 */
export function useExtendRequestEtaMutation() {
  const qc = useQueryClient();
  return useMutation<
    GuestRequestDTO,
    Error,
    { requestId: string; minutes?: number }
  >({
    mutationFn: async ({ requestId, minutes = 5 }) => {
      const raw = await apiFetch<unknown>(
        `/staff/requests/${requestId}/eta/extend`,
        { method: "POST", body: { minutes } },
      );
      return mapStaffRequest(raw);
    },
    onSuccess: (updated) => {
      qc.setQueryData<GuestRequestDTO[]>(queryKeys.requests.list(), (prev) => {
        if (!prev) return prev;
        const index = prev.findIndex((r) => r.id === updated.id);
        if (index === -1) return [updated, ...prev];
        const next = prev.slice();
        next[index] = updated;
        return next;
      });
    },
  });
}

/**
 * Raw shape returned by GET /staff/requests (mirrors RequestSummary from
 * apps/api/src/services/request-service.ts → listStaffRequests).
 *
 * Key differences from GuestRequestDTO:
 *  - `requestId`  → mapped to `id`
 *  - items[].requestItemId  → mapped to items[].id
 *  - items[].inventoryItemName  → mapped to items[].name
 *  - items[].category / unit are not present in the backend summary; we
 *    default them to empty strings so the DTO shape is satisfied.
 *  - createdAt / updatedAt are Date objects on the server but arrive as
 *    ISO strings over the wire; we coerce them to strings explicitly.
 */
interface RawRequestSummary {
  requestId: string;
  roomId: string;
  roomNumber: string;
  roomDeviceSessionId: string | null;
  status: string;
  source: string;
  category: string | null;
  rawText: string;
  normalizedText: string | null;
  guestMessage: string | null;
  staffNote: string | null;
  etaMinutes: number | null;
  etaAt: string | Date | null;
  rejectionReason: string | null;
  createdAt: string | Date;
  updatedAt: string | Date;
  items: Array<{
    requestItemId: string;
    inventoryItemId: string;
    inventoryItemName: string;
    requestedQuantity: number;
    reservedQuantity: number;
    deliveredQuantity: number;
    unavailableQuantity: number;
    activeReservationId?: string;
    activeReservedQuantity?: number;
  }>;
}

/**
 * Normalizes the staff request response into the client DTO shape.
 *
 * Backend returns `requestId` (not `id`) and items with `requestItemId` /
 * `inventoryItemName` instead of `id` / `name`. `category` and `unit` are
 * absent from item summaries so they are defaulted to empty strings.
 */
export function mapStaffRequest(raw: unknown): GuestRequestDTO {
  const r = raw as RawRequestSummary;
  return {
    id: r.requestId,
    roomId: r.roomId,
    roomNumber: r.roomNumber,
    source: r.source as GuestRequestDTO["source"],
    rawText: r.rawText,
    normalizedText: r.normalizedText,
    category: r.category as GuestRequestDTO["category"],
    guestMessage: r.guestMessage,
    staffNote: r.staffNote,
    etaMinutes: r.etaMinutes,
    etaAt:
      r.etaAt == null
        ? null
        : typeof r.etaAt === "string"
          ? r.etaAt
          : r.etaAt.toISOString(),
    status: r.status as GuestRequestDTO["status"],
    rejectionReason: r.rejectionReason,
    createdAt: typeof r.createdAt === "string" ? r.createdAt : r.createdAt.toISOString(),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : r.updatedAt.toISOString(),
    items: r.items.map((item) => ({
      id: item.requestItemId,
      inventoryItemId: item.inventoryItemId,
      name: item.inventoryItemName,
      // category and unit are not included in RequestSummary items; default to empty string
      category: "" as GuestRequestDTO["items"][number]["category"],
      unit: "",
      requestedQuantity: item.requestedQuantity,
      reservedQuantity: item.reservedQuantity,
      deliveredQuantity: item.deliveredQuantity,
      unavailableQuantity: item.unavailableQuantity,
    })),
  };
}

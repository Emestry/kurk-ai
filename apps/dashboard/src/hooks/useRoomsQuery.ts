"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { RoomDTO, RoomDeviceSessionDTO } from "@/lib/types";

/**
 * Normalize a raw device session into the client DTO shape.
 */
function mapSession(raw: unknown): RoomDeviceSessionDTO {
  const r = raw as Record<string, unknown>;
  return {
    id: r.id as string,
    roomId: r.roomId as string,
    roomDeviceId: r.roomDeviceId as string,
    token: r.token as string,
    expiresAt: r.expiresAt as string,
    revokedAt: (r.revokedAt as string | null) ?? null,
    createdAt: r.createdAt as string,
  };
}

/**
 * Normalize a raw room response to the client DTO shape.
 *
 * GET /admin/rooms returns { rooms: [...] } where each room has
 *   devices: [{ id, name, isActive, lastSeenAt, sessions: [...] }]
 *
 * RoomDTO expects a flat `activeSessions` array on the room, so we
 * flatten devices[].sessions here.
 */
export function mapRoom(raw: unknown): RoomDTO {
  const r = raw as Record<string, unknown>;
  const devices = (r.devices as Array<Record<string, unknown>>) ?? [];

  const activeSessions: RoomDeviceSessionDTO[] = devices.flatMap((d) => {
    const sessions = (d.sessions as unknown[]) ?? [];
    return sessions.map(mapSession);
  });

  return {
    id: r.id as string,
    number: r.number as string,
    code: r.code as string,
    isActive: r.isActive as boolean,
    pairingCode: (r.pairingCode as string | null) ?? null,
    pairingCodeExpiresAt: (r.pairingCodeExpiresAt as string | null) ?? null,
    devices: devices.map((d) => ({
      id: d.id as string,
      name: d.name as string,
      isActive: d.isActive as boolean,
      lastSeenAt: (d.lastSeenAt as string | null) ?? null,
    })),
    activeSessions,
  };
}

export function useRoomsQuery() {
  return useQuery<RoomDTO[]>({
    queryKey: queryKeys.rooms.list(),
    queryFn: async () => {
      // Backend wraps as { rooms: [...] }
      const raw = await apiFetch<{ rooms: unknown[] }>("/admin/rooms");
      return raw.rooms.map(mapRoom);
    },
  });
}

export function useRevokeSessionMutation() {
  const qc = useQueryClient();
  return useMutation<void, Error, { sessionId: string }>({
    mutationFn: ({ sessionId }) =>
      apiFetch<void>(`/admin/device-sessions/${sessionId}/revoke`, {
        method: "POST",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.rooms.all() });
    },
  });
}

export interface IssuePairingCodeResponse {
  roomId: string;
  pairingCode: string;
  expiresAt: string;
}

export function useIssuePairingCodeMutation() {
  const qc = useQueryClient();
  return useMutation<IssuePairingCodeResponse, Error, { roomId: string }>({
    mutationFn: ({ roomId }) =>
      apiFetch<IssuePairingCodeResponse>(
        `/admin/rooms/${roomId}/pairing-code`,
        { method: "POST" },
      ),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.rooms.all() });
    },
  });
}

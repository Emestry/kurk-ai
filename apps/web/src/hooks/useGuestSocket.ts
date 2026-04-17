"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ConnectionStatus, GuestRequest } from "@/lib/types";
import {
  ensureLegacyRoomSession,
  fetchRoomRequests,
  getApiBaseUrl,
  getCurrentRequest,
} from "@/lib/api";

interface UseGuestSocketOptions {
  onSessionRevoked?: () => void;
}

interface UseGuestSocketReturn {
  connectionStatus: ConnectionStatus;
  requests: GuestRequest[];
  setRequests: React.Dispatch<React.SetStateAction<GuestRequest[]>>;
}

export function useGuestSocket(
  roomNumber: string | null,
  options: UseGuestSocketOptions = {},
): UseGuestSocketReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [requests, setRequests] = useState<GuestRequest[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const onSessionRevoked = useEffectEvent(() => {
    options.onSessionRevoked?.();
  });

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      if (!roomNumber) {
        return;
      }

      try {
        const roomSessionToken = await ensureLegacyRoomSession(roomNumber);
        const [history, current] = await Promise.all([
          fetchRoomRequests(roomNumber),
          getCurrentRequest(roomSessionToken),
        ]);

        if (cancelled) {
          return;
        }

        const merged = current.request
          ? [
              {
                id: current.request.requestId,
                room: current.request.roomNumber,
                text: current.request.rawText,
                category: current.request.category ?? "reception",
                status: current.request.status,
                notes: current.request.staffNote ?? current.request.rejectionReason,
                createdAt: current.request.createdAt,
                updatedAt: current.request.updatedAt,
                items: current.request.items.map((item) => ({
                  inventory_item_id: item.inventoryItemId,
                  name: item.inventoryItemName,
                  quantity_requested: item.requestedQuantity,
                  quantity_fulfilled: item.deliveredQuantity,
                })),
              },
              ...history.filter((entry) => entry.id !== current.request!.requestId),
            ]
          : history;

        setRequests(merged);
        setConnectionStatus("connected");

        const url = new URL(`${getApiBaseUrl()}/guest/events`);
        url.searchParams.set("roomSessionToken", roomSessionToken);
        const source = new EventSource(url);
        eventSourceRef.current = source;

        const refresh = async () => {
          const latest = await fetchRoomRequests(roomNumber);
          if (!cancelled) {
            setRequests(latest);
            setConnectionStatus("connected");
          }
        };

        const onEvent = () => {
          void refresh();
        };

        source.addEventListener("request.created", onEvent);
        source.addEventListener("request.updated", onEvent);
        source.addEventListener("request.rejected", onEvent);
        source.addEventListener("request.delivered", onEvent);
        source.addEventListener("room.session.revoked", () => {
          if (cancelled) return;
          source.close();
          eventSourceRef.current = null;
          setConnectionStatus("disconnected");
          onSessionRevoked();
        });
        source.onerror = () => {
          if (!cancelled) {
            setConnectionStatus("reconnecting");
          }
        };
      } catch {
        if (!cancelled) {
          setConnectionStatus("disconnected");
        }
      }
    }

    void connect();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
    };
  }, [roomNumber]);

  return { connectionStatus, requests, setRequests };
}

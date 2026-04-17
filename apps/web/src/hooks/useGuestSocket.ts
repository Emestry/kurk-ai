"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import type { ConnectionStatus, GuestRequest } from "@/lib/types";
import {
  ensureLegacyRoomSession,
  fetchRoomRequests,
  getApiBaseUrl,
  getCurrentRequest,
  getHistoryHiddenBefore,
  setHistoryHiddenBefore,
} from "@/lib/api";

interface UseGuestSocketOptions {
  onSessionRevoked?: () => void;
}

interface UseGuestSocketReturn {
  connectionStatus: ConnectionStatus;
  requests: GuestRequest[];
  setRequests: React.Dispatch<React.SetStateAction<GuestRequest[]>>;
}

function filterHistory(requests: GuestRequest[], hiddenBefore: string | null) {
  if (!hiddenBefore) return requests;
  return requests.filter((request) => request.createdAt > hiddenBefore);
}

export function useGuestSocket(
  roomNumber: string | null,
  options: UseGuestSocketOptions = {},
): UseGuestSocketReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [rawRequests, setRequests] = useState<GuestRequest[]>([]);
  const [hiddenBefore, setHiddenBefore] = useState<string | null>(() =>
    getHistoryHiddenBefore(),
  );
  const eventSourceRef = useRef<EventSource | null>(null);
  const onSessionRevoked = useEffectEvent(() => {
    options.onSessionRevoked?.();
  });

  const requests = filterHistory(rawRequests, hiddenBefore);

  useEffect(() => {
    let cancelled = false;

    async function connect() {
      if (!roomNumber) {
        return;
      }

      setHiddenBefore(getHistoryHiddenBefore());

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
        source.addEventListener("room.history.reset", () => {
          if (cancelled) return;
          const stamp = new Date().toISOString();
          setHistoryHiddenBefore(stamp);
          setHiddenBefore(stamp);
        });
        const revoke = () => {
          if (cancelled) return;
          source.close();
          eventSourceRef.current = null;
          setConnectionStatus("disconnected");
          onSessionRevoked();
        };

        source.addEventListener("room.session.revoked", revoke);
        source.onerror = async () => {
          if (cancelled) return;
          setConnectionStatus("reconnecting");

          // EventSource hides the HTTP status, so confirm whether the session
          // was revoked by probing a cheap endpoint with the same token. A 401
          // means staff disconnected the tablet; clear local state and route
          // back to setup instead of reconnecting forever.
          try {
            const response = await fetch(`${getApiBaseUrl()}/guest/requests/current`, {
              headers: { "x-room-session-token": roomSessionToken },
              cache: "no-store",
            });
            if (!cancelled && response.status === 401) {
              revoke();
            }
          } catch {
            // Network error — leave EventSource to keep retrying.
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

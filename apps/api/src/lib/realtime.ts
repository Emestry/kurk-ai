import type { RequestStatus } from "@/generated/prisma/enums.js";
import { publishWebsocketMessage } from "@/lib/websocket.js";

export interface RealtimeEvent {
  id?: string;
  type:
    | "request.created"
    | "request.updated"
    | "request.rejected"
    | "request.delivered"
    | "inventory.updated"
    | "stocktake.finalized"
    | "alert.low_stock"
    | "room.session.revoked"
    | "room.session.created"
    | "room.history.reset";
  requestId: string;
  roomId?: string;
  status?: RequestStatus;
  occurredAt: string;
  data: Record<string, unknown>;
}

type RealtimeListener = (event: RealtimeEvent) => void;
type RealtimeFilter = (event: RealtimeEvent) => boolean;

interface Subscription {
  filter: RealtimeFilter;
  listener: RealtimeListener;
}

class RealtimeBus {
  private subscriptions = new Map<string, Subscription>();

  subscribe(filter: RealtimeFilter, listener: RealtimeListener) {
    const subscriptionId = crypto.randomUUID();

    this.subscriptions.set(subscriptionId, { filter, listener });

    return () => {
      this.subscriptions.delete(subscriptionId);
    };
  }

  publish(event: RealtimeEvent) {
    for (const subscription of this.subscriptions.values()) {
      if (subscription.filter(event)) {
        subscription.listener(event);
      }
    }
  }
}

export const realtimeBus = new RealtimeBus();

/**
 * Broadcasts a realtime event to in-process listeners and WebSocket clients.
 *
 * @param event - Event payload describing the room, request, or inventory change.
 * @returns Nothing.
 */
export function publishRealtimeEvent(event: RealtimeEvent) {
  realtimeBus.publish(event);
  publishWebsocketMessage({
    type: event.type,
    requestId: event.requestId,
    roomId: event.roomId,
    status: event.status,
    occurredAt: event.occurredAt,
    data: event.data,
  });
}

/**
 * Registers a realtime subscription filtered to the events the caller cares about.
 *
 * @param filter - Predicate that decides whether a listener should receive an event.
 * @param listener - Callback invoked for each matching event.
 * @returns An unsubscribe function that removes the subscription.
 */
export function subscribeToRealtimeEvents(
  filter: RealtimeFilter,
  listener: RealtimeListener,
) {
  return realtimeBus.subscribe(filter, listener);
}

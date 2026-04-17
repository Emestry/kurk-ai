import type { LiveEvent, LiveEventType } from "./types";

export type WsState = "connecting" | "open" | "reconnecting" | "closed";

export interface WsManager {
  getState(): WsState;
  subscribe(listener: (event: LiveEvent) => void): () => void;
  onState(listener: (state: WsState) => void): () => void;
  close(): void;
}

interface CreateWsOptions {
  url: string;
}

const LIVE_EVENT_TYPES: LiveEventType[] = [
  "request.created",
  "request.updated",
  "request.rejected",
  "request.delivered",
  "inventory.updated",
  "stocktake.finalized",
  "alert.low_stock",
  "room.session.created",
  "room.session.revoked",
];

function normalizeLiveEventsUrl(rawUrl: string) {
  const normalizedProtocol = rawUrl
    .replace(/^ws:\/\//i, "http://")
    .replace(/^wss:\/\//i, "https://");
  const url = new URL(normalizedProtocol, window.location.origin);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (pathname === "/ws" || pathname === "/") {
    url.pathname = "/staff/events";
  }

  url.search = "";
  url.hash = "";

  return url.toString();
}

/**
 * Creates a staff-scoped live event connection with exponential-backoff
 * reconnect, visibility-aware pausing, and a fan-out subscribe API.
 *
 * @param options - Base API URL or legacy staff WebSocket endpoint.
 * @returns A manager exposing state, message, and lifecycle observers.
 */
export function createWsManager(options: CreateWsOptions): WsManager {
  const listeners = new Set<(event: LiveEvent) => void>();
  const stateListeners = new Set<(state: WsState) => void>();
  let source: EventSource | null = null;
  let state: WsState = "connecting";
  let attempt = 0;
  let closedByUser = false;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  function setState(next: WsState) {
    state = next;
    for (const l of stateListeners) l(next);
  }

  function scheduleReconnect() {
    if (closedByUser) return;
    // Always mark the UI as reconnecting so the visibility handler can pick
    // the socket up again when the tab returns to the foreground — otherwise
    // a close while hidden leaves `state` stuck at "open" and we never retry.
    setState("reconnecting");
    if (document.hidden) return;
    const delay = Math.min(30_000, 1_000 * 2 ** attempt);
    attempt += 1;
    reconnectTimer = setTimeout(connect, delay);
  }

  function connect() {
    reconnectTimer = null;
    setState(attempt === 0 ? "connecting" : "reconnecting");

    try {
      source = new EventSource(normalizeLiveEventsUrl(options.url), {
        withCredentials: true,
      });
    } catch {
      scheduleReconnect();
      return;
    }

    source.addEventListener("open", () => {
      attempt = 0;
      setState("open");
    });

    source.addEventListener("connected", () => {
      attempt = 0;
      setState("open");
    });

    const onEvent = (ev: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(ev.data) as LiveEvent;
        for (const l of listeners) l(parsed);
      } catch {
        /* drop malformed frames silently */
      }
    };

    for (const type of LIVE_EVENT_TYPES) {
      source.addEventListener(type, onEvent as EventListener);
    }

    source.addEventListener("error", () => {
      source?.close();
      source = null;
      if (closedByUser) {
        setState("closed");
        return;
      }
      scheduleReconnect();
    });
  }

  function onVisibilityChange() {
    if (document.hidden) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      return;
    }
    // When the tab returns to the foreground, try again regardless of the
    // cached `state` — it may be stale if a close fired while we were hidden.
    if (!source || source.readyState !== EventSource.OPEN) {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      attempt = 0;
      connect();
    }
  }

  document.addEventListener("visibilitychange", onVisibilityChange);
  connect();

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    onState(listener) {
      stateListeners.add(listener);
      listener(state);
      return () => stateListeners.delete(listener);
    },
    close() {
      closedByUser = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
      source = null;
      setState("closed");
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

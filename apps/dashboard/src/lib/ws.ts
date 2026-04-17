import type { LiveEvent } from "./types";

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

/**
 * Creates a staff-scoped WebSocket connection with exponential-backoff
 * reconnect, visibility-aware pausing, and a fan-out subscribe API.
 *
 * @param options - URL for the staff WebSocket endpoint.
 * @returns A manager exposing state, message, and lifecycle observers.
 */
export function createWsManager(options: CreateWsOptions): WsManager {
  const listeners = new Set<(event: LiveEvent) => void>();
  const stateListeners = new Set<(state: WsState) => void>();
  let socket: WebSocket | null = null;
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
      socket = new WebSocket(`${options.url}?scope=staff`);
    } catch {
      scheduleReconnect();
      return;
    }

    socket.addEventListener("open", () => {
      attempt = 0;
      setState("open");
    });

    socket.addEventListener("message", (ev: MessageEvent<string>) => {
      try {
        const parsed = JSON.parse(ev.data) as LiveEvent;
        for (const l of listeners) l(parsed);
      } catch {
        /* drop malformed frames silently */
      }
    });

    socket.addEventListener("close", () => {
      socket = null;
      if (closedByUser) {
        setState("closed");
      } else {
        scheduleReconnect();
      }
    });

    socket.addEventListener("error", () => {
      socket?.close();
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
    if (!socket || socket.readyState !== WebSocket.OPEN) {
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
      socket?.close();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    },
  };
}

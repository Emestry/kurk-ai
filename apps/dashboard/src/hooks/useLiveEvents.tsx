"use client";

import {
  createContext,
  ReactNode,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createWsManager, type WsManager, type WsState } from "@/lib/ws";
import type { LiveEvent } from "@/lib/types";

interface LiveEventsContextValue {
  state: WsState;
  subscribe: WsManager["subscribe"];
}

const LiveEventsContext = createContext<LiveEventsContextValue | null>(null);

/**
 * Opens a single staff-scoped live event stream for the lifetime of the app
 * shell and exposes state + a subscribe API to descendants.
 */
export function LiveEventsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<WsState>("connecting");
  const managerRef = useRef<WsManager | null>(null);

  useEffect(() => {
    const manager = createWsManager({
      url:
        process.env.NEXT_PUBLIC_API_URL ??
        process.env.NEXT_PUBLIC_WS_URL ??
        "http://localhost:3001",
    });
    managerRef.current = manager;
    const unsubscribe = manager.onState(setState);
    return () => {
      unsubscribe();
      manager.close();
      managerRef.current = null;
    };
  }, []);

  return (
    <LiveEventsContext.Provider
      value={{
        state,
        subscribe: (listener: (event: LiveEvent) => void) =>
          managerRef.current?.subscribe(listener) ?? (() => {}),
      }}
    >
      {children}
    </LiveEventsContext.Provider>
  );
}

/**
 * Returns the live connection state and a subscribe function for live events.
 * Must be used inside LiveEventsProvider.
 */
export function useLiveEvents() {
  const ctx = useContext(LiveEventsContext);
  if (!ctx) throw new Error("useLiveEvents must be used inside LiveEventsProvider");
  return ctx;
}

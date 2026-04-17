"use client";
import { Bell, BellOff } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const KEY = "dashboard.sound-enabled";
const EVENT = "dashboard:sound-enabled-change";

function readPreference(): boolean {
  if (typeof window === "undefined") return true;
  const saved = window.localStorage.getItem(KEY);
  return saved === null ? true : saved === "true";
}

function subscribe(listener: () => void): () => void {
  const handler = () => listener();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

function setPreference(next: boolean) {
  window.localStorage.setItem(KEY, String(next));
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Sound-alert preference, shared across every component in the app.
 * Backed by localStorage with a custom event channel for same-tab
 * propagation; the "storage" listener covers cross-tab changes.
 */
export function useSoundEnabled(): [boolean, (next: boolean) => void] {
  const enabled = useSyncExternalStore(
    subscribe,
    readPreference,
    () => true,
  );
  return [enabled, setPreference];
}

export function SoundToggle() {
  const [enabled, setEnabled] = useSoundEnabled();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setEnabled(!enabled)}
      title={enabled ? "Mute alerts" : "Unmute alerts"}
    >
      {enabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
    </Button>
  );
}

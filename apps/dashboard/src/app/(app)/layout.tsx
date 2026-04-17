"use client";

import { ReactNode } from "react";
import { TopBar } from "@/components/shared/TopBar";
import { LiveEventsProvider } from "@/hooks/useLiveEvents";
import { useRequestEventBridge } from "@/hooks/useRequestEventBridge";
import { useLowStockAlerts } from "@/hooks/useLowStockAlerts";
import { useTabShortcuts } from "@/hooks/useTabShortcuts";

function Bridge() {
  useRequestEventBridge();
  useLowStockAlerts();
  useTabShortcuts();
  return null;
}

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <LiveEventsProvider>
      <Bridge />
      <TopBar />
      <div className="px-6 py-6">{children}</div>
    </LiveEventsProvider>
  );
}

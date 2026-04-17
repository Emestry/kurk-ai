import type { ReactNode } from "react";
import type { Viewport } from "next";

export const viewport: Viewport = {
  themeColor: "#050507",
};

export default function GuestLayout({ children }: { children: ReactNode }) {
  return children;
}

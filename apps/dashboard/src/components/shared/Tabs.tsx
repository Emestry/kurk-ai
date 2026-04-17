"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useInventoryQuery } from "@/hooks/useInventoryQuery";

const TABS = [
  { href: "/", label: "Requests" },
  { href: "/inventory", label: "Inventory" },
  { href: "/rooms", label: "Rooms" },
  { href: "/stocktake", label: "Stocktake" },
  { href: "/reports", label: "Reports" },
];

export function Tabs() {
  const pathname = usePathname();
  const { data } = useInventoryQuery();
  const hasLow = (data ?? []).some(
    (i) => i.isActive && i.quantityAvailable <= i.lowStockThreshold,
  );
  return (
    <nav className="flex items-center gap-1">
      {TABS.map((tab) => {
        const active =
          tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`relative rounded-md px-3 py-1.5 text-sm transition-colors ${
              active
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {tab.href === "/inventory" && hasLow ? (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-red-500" />
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

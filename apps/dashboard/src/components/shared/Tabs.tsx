"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useInventoryQuery } from "@/hooks/useInventoryQuery";

const TABS = [
  { href: "/", label: "Requests" },
  { href: "/inventory", label: "Inventory" },
  { href: "/rooms", label: "Rooms" },
  { href: "/stocktake", label: "Stocktake" },
  { href: "/reports", label: "Reports" },
];

function isActiveHref(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Inline tab row — shown in the top bar's left cluster on lg+ viewports. */
export function Tabs() {
  const pathname = usePathname();
  const { data } = useInventoryQuery();
  const hasLow = (data ?? []).some(
    (i) => i.isActive && i.quantityAvailable <= i.lowStockThreshold,
  );

  return (
    <nav className="hidden items-center gap-1 lg:flex">
      {TABS.map((tab) => {
        const active = isActiveHref(pathname, tab.href);
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

/** Hamburger + right-side drawer — shown in the top bar's right cluster
 *  below lg so the collapsed menu opens from the right edge. */
export function TabsMenu() {
  const pathname = usePathname();
  const { data } = useInventoryQuery();
  const [open, setOpen] = useState(false);
  const hasLow = (data ?? []).some(
    (i) => i.isActive && i.quantityAvailable <= i.lowStockThreshold,
  );

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={() => setOpen(true)}
        aria-label="Open navigation"
        className="relative"
      >
        <Menu className="h-5 w-5" />
        {hasLow ? (
          <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-red-500" />
        ) : null}
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-72 p-0">
          <SheetHeader className="p-4">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <nav className="flex flex-col gap-1 p-2">
            {TABS.map((tab) => {
              const active = isActiveHref(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  onClick={() => setOpen(false)}
                  className={`relative flex items-center rounded-md px-3 py-2 text-sm transition-colors ${
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                  }`}
                >
                  {tab.label}
                  {tab.href === "/inventory" && hasLow ? (
                    <span className="ml-auto h-2 w-2 rounded-full bg-red-500" />
                  ) : null}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>
    </div>
  );
}

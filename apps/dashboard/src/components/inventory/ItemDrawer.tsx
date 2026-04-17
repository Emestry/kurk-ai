"use client";

import { format } from "date-fns";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useItemMovementsQuery } from "@/hooks/useInventoryQuery";
import { useRequestsQuery } from "@/hooks/useRequestsQuery";
import type { InventoryItemDTO, InventoryMovementType } from "@/lib/types";

const TYPE_TONE: Record<InventoryMovementType, string> = {
  reserve: "text-amber-300",
  release: "text-muted-foreground",
  deliver: "text-emerald-300",
  restock: "text-sky-300",
  adjustment: "text-violet-300",
  stocktake: "text-rose-300",
};

const PHYSICAL_TYPES = new Set<InventoryMovementType>([
  "restock",
  "adjustment",
  "deliver",
  "stocktake",
]);

export function ItemDrawer({
  item,
  onClose,
}: {
  item: InventoryItemDTO;
  onClose: () => void;
}) {
  const { data, isLoading } = useItemMovementsQuery(item.id);
  const { data: requests } = useRequestsQuery();
  const visible = (data ?? []).filter(
    (m) => PHYSICAL_TYPES.has(m.type) && m.quantityDelta !== 0,
  );

  const reservations = (requests ?? [])
    .flatMap((r) =>
      r.items
        .filter((i) => i.inventoryItemId === item.id && i.reservedQuantity > 0)
        .map((i) => ({
          requestId: r.id,
          roomNumber: r.roomNumber,
          status: r.status,
          createdAt: r.createdAt,
          reservedQuantity: i.reservedQuantity,
          requestedQuantity: i.requestedQuantity,
        })),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader className="p-6 pb-4 space-y-2">
          <SheetTitle>{item.name}</SheetTitle>
          <p className="text-xs text-muted-foreground">
            Physical {item.quantityInStock} · Reserved {item.quantityReserved} ·
            Available {item.quantityAvailable}
          </p>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          <section className="space-y-2">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold">Currently reserved</h3>
              <span className="text-xs text-muted-foreground">
                {item.quantityReserved} total
              </span>
            </div>
            {reservations.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No active reservations.
              </p>
            ) : (
              <ul className="space-y-2">
                {reservations.map((r) => (
                  <li
                    key={r.requestId}
                    className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold">Room {r.roomNumber}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {format(new Date(r.createdAt), "p")} ·{" "}
                        {r.status === "received" ? "Received" : "In progress"}
                      </span>
                    </div>
                    <span className="font-mono text-sm shrink-0">
                      {r.reservedQuantity}
                      {r.reservedQuantity !== r.requestedQuantity
                        ? ` / ${r.requestedQuantity}`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <h3 className="text-sm font-semibold">Movements</h3>
          {isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : null}
          <ul className="space-y-2">
            {visible.map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-3 rounded-md border border-border p-3"
              >
                <div className="min-w-0 flex-1">
                  <span
                    className={`text-xs font-semibold uppercase ${TYPE_TONE[m.type]}`}
                  >
                    {m.type}
                  </span>
                  {m.reason ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({m.reason})
                    </span>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {format(new Date(m.createdAt), "PP p")}
                  </p>
                  {m.note ? (
                    <p className="mt-1 break-words text-sm">{m.note}</p>
                  ) : null}
                </div>
                <span className="font-mono text-sm shrink-0">
                  {m.quantityDelta > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                </span>
              </li>
            ))}
            {!isLoading && visible.length === 0 ? (
              <li className="text-xs text-muted-foreground">
                No stock changes yet.
              </li>
            ) : null}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  );
}

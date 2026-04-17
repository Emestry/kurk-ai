"use client";

import { useMemo, useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AlertTriangle, MoreVertical, Plus } from "lucide-react";
import { useInventoryQuery, useUpdateItemMutation } from "@/hooks/useInventoryQuery";
import { useRequestsQuery } from "@/hooks/useRequestsQuery";
import { RestockModal } from "./RestockModal";
import { AdjustModal } from "./AdjustModal";
import { ItemFormModal } from "./ItemFormModal";
import { ItemDrawer } from "./ItemDrawer";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import type { InventoryItemDTO, RequestCategory } from "@/lib/types";

const CATS: { label: string; value: RequestCategory | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Room Service", value: "room_service" },
  { label: "Housekeeping", value: "housekeeping" },
  { label: "Maintenance", value: "maintenance" },
  { label: "Reception", value: "reception" },
];

type Modal =
  | { kind: "none" }
  | { kind: "restock"; item: InventoryItemDTO }
  | { kind: "adjust"; item: InventoryItemDTO }
  | { kind: "edit"; item: InventoryItemDTO }
  | { kind: "add" }
  | { kind: "drawer"; item: InventoryItemDTO };

export function InventoryTable() {
  const { data } = useInventoryQuery();
  const { data: requests } = useRequestsQuery();
  const update = useUpdateItemMutation();
  const [cat, setCat] = useState<RequestCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [hideRemoved, setHideRemoved] = useState(false);
  const [modal, setModal] = useState<Modal>({ kind: "none" });

  // Compute the authoritative reserved count per inventory item from the
  // requests cache. The backend's `inventoryItem.quantityReserved` field is
  // a denormalized sum that can drift; the requests query is the source of
  // truth for what is actually reserved right now.
  const reservedByItem = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of requests ?? []) {
      for (const it of r.items) {
        if (it.reservedQuantity > 0) {
          map.set(
            it.inventoryItemId,
            (map.get(it.inventoryItemId) ?? 0) + it.reservedQuantity,
          );
        }
      }
    }
    return map;
  }, [requests]);

  const rows = useMemo(() => {
    return (data ?? [])
      .map((i) => {
        const reserved = reservedByItem.get(i.id) ?? i.quantityReserved;
        return {
          ...i,
          quantityReserved: reserved,
          quantityAvailable: i.quantityInStock - reserved,
        };
      })
      .filter((i) => (hideRemoved ? i.isActive : true))
      .filter((i) => (cat === "all" ? true : i.category === cat))
      .filter((i) =>
        !search ? true : i.name.toLowerCase().includes(search.toLowerCase()),
      )
      .filter((i) =>
        !lowOnly ? true : i.quantityAvailable <= i.lowStockThreshold,
      );
  }, [data, reservedByItem, cat, search, lowOnly, hideRemoved]);

  async function remove(item: InventoryItemDTO) {
    if (
      !confirm(
        `Remove ${item.name}? It will be hidden from the active list but kept for history. You can restore it later.`,
      )
    ) {
      return;
    }
    try {
      await update.mutateAsync({ itemId: item.id, isActive: false });
      toast.success(`${item.name} removed`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Remove failed");
    }
  }

  async function restore(item: InventoryItemDTO) {
    try {
      await update.mutateAsync({ itemId: item.id, isActive: true });
      toast.success(`${item.name} restored`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Restore failed");
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        {CATS.map((c) => (
          <Button
            key={c.value}
            size="sm"
            variant={cat === c.value ? "default" : "outline"}
            onClick={() => setCat(c.value)}
          >
            {c.label}
          </Button>
        ))}
        <Input
          placeholder="Search…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-8 w-56"
        />
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={lowOnly}
            onChange={(e) => setLowOnly(e.target.checked)}
          />
          Low stock only
        </label>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={hideRemoved}
            onChange={(e) => setHideRemoved(e.target.checked)}
          />
          Hide removed
        </label>
        <div className="ml-auto">
          <Button onClick={() => setModal({ kind: "add" })}>
            <Plus className="mr-2 h-4 w-4" /> Add item
          </Button>
        </div>
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Physical</TableHead>
            <TableHead className="text-right">Reserved</TableHead>
            <TableHead className="text-right font-semibold">Available</TableHead>
            <TableHead className="text-right">Threshold</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((item) => {
            const low = item.quantityAvailable <= item.lowStockThreshold;
            const empty = item.quantityAvailable <= 0;
            return (
              <TableRow
                key={item.id}
                className={
                  empty
                    ? "border-l-2 border-l-red-500/60"
                    : low
                      ? "border-l-2 border-l-amber-500/60"
                      : ""
                }
              >
                <TableCell
                  className="cursor-pointer"
                  onClick={() => setModal({ kind: "drawer", item })}
                >
                  {item.name}
                  {!item.isActive ? (
                    <span className="ml-2 text-xs text-muted-foreground">(removed)</span>
                  ) : null}
                </TableCell>
                <TableCell className="capitalize text-muted-foreground">
                  {item.category.replace("_", " ")}
                </TableCell>
                <TableCell className="text-right font-mono">{item.quantityInStock}</TableCell>
                <TableCell className="text-right font-mono text-muted-foreground">
                  {item.quantityReserved}
                </TableCell>
                <TableCell className="text-right font-mono font-semibold">
                  {item.quantityAvailable}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {item.lowStockThreshold}
                </TableCell>
                <TableCell>
                  {low ? (
                    <span className="flex items-center gap-1 text-amber-400">
                      <AlertTriangle className="h-4 w-4" /> Low
                    </span>
                  ) : (
                    <span className="text-muted-foreground">OK</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      disabled={!item.isActive}
                      onClick={() => setModal({ kind: "restock", item })}
                    >
                      Restock
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-input bg-background text-sm shadow-xs hover:bg-accent hover:text-accent-foreground">
                        <MoreVertical className="h-4 w-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setModal({ kind: "edit", item })}>
                          Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setModal({ kind: "adjust", item })}>
                          Adjust…
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setModal({ kind: "drawer", item })}>
                          View history
                        </DropdownMenuItem>
                        {item.isActive ? (
                          <DropdownMenuItem
                            onClick={() => void remove(item)}
                            className="text-destructive"
                          >
                            Remove
                          </DropdownMenuItem>
                        ) : (
                          <DropdownMenuItem onClick={() => void restore(item)}>
                            Restore
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {modal.kind === "restock" ? (
        <RestockModal item={modal.item} onClose={() => setModal({ kind: "none" })} />
      ) : null}
      {modal.kind === "adjust" ? (
        <AdjustModal item={modal.item} onClose={() => setModal({ kind: "none" })} />
      ) : null}
      {modal.kind === "add" ? (
        <ItemFormModal onClose={() => setModal({ kind: "none" })} />
      ) : null}
      {modal.kind === "edit" ? (
        <ItemFormModal item={modal.item} onClose={() => setModal({ kind: "none" })} />
      ) : null}
      {modal.kind === "drawer" ? (
        <ItemDrawer item={modal.item} onClose={() => setModal({ kind: "none" })} />
      ) : null}
    </div>
  );
}

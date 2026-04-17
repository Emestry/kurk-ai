"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useCreateItemMutation,
  useUpdateItemMutation,
} from "@/hooks/useInventoryQuery";
import {
  combine,
  validateNonNegativeInt,
  validateRequired,
} from "@/lib/validation";
import type { InventoryItemDTO, RequestCategory } from "@/lib/types";

const CATEGORIES: RequestCategory[] = [
  "room_service",
  "housekeeping",
  "maintenance",
  "reception",
];

interface Props {
  item?: InventoryItemDTO;
  onClose: () => void;
}

/**
 * Creates a new inventory item or edits metadata for an existing one.
 *
 * @param item - Existing item when editing, otherwise omitted for create mode.
 * @param onClose - Callback used to dismiss the modal.
 * @returns An item create/edit dialog.
 */
export function ItemFormModal({ item, onClose }: Props) {
  const isEdit = Boolean(item);
  const [sku, setSku] = useState(() => item?.sku ?? `INV-${Date.now().toString().slice(-4)}`);
  const [name, setName] = useState(item?.name ?? "");
  const [category, setCategory] = useState<RequestCategory>(
    item?.category ?? "housekeeping",
  );
  const [unit, setUnit] = useState(item?.unit ?? "piece");
  const [qty, setQty] = useState(String(item?.quantityInStock ?? 0));
  const [threshold, setThreshold] = useState(String(item?.lowStockThreshold ?? 0));
  const [error, setError] = useState<string | null>(null);

  const create = useCreateItemMutation();
  const update = useUpdateItemMutation();

  async function onSubmit() {
    const validation = combine(
      validateRequired(sku, "SKU"),
      validateRequired(name, "Name"),
      validateRequired(unit, "Unit"),
      validateNonNegativeInt(qty, "Quantity"),
      validateNonNegativeInt(threshold, "Threshold"),
    );
    if (!validation.ok) return setError(validation.error);

    try {
      if (isEdit && item) {
        await update.mutateAsync({
          itemId: item.id,
          name: name.trim(),
          category,
          unit: unit.trim(),
          lowStockThreshold: Number(threshold),
        });
      } else {
        await create.mutateAsync({
          sku: sku.trim(),
          name: name.trim(),
          category,
          unit: unit.trim(),
          quantityInStock: Number(qty),
          lowStockThreshold: Number(threshold),
        });
      }
      toast.success(isEdit ? "Item updated" : "Item added");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Save failed");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit item" : "Add item"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Label htmlFor="sku">SKU</Label>
          <Input
            id="sku"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            disabled={isEdit}
          />
          <Label htmlFor="name">Name</Label>
          <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          <Label htmlFor="category">Category</Label>
          <Select value={category} onValueChange={(v) => setCategory(v as RequestCategory)}>
            <SelectTrigger id="category">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c} className="capitalize">
                  {c.replace("_", " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Label htmlFor="unit">Unit</Label>
          <Input id="unit" value={unit} onChange={(e) => setUnit(e.target.value)} />
          {!isEdit ? (
            <>
              <Label htmlFor="qty">Initial stock</Label>
              <Input
                id="qty"
                type="number"
                min={0}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </>
          ) : null}
          <Label htmlFor="threshold">Low-stock threshold</Label>
          <Input
            id="threshold"
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={onSubmit}
            disabled={create.isPending || update.isPending}
          >
            {create.isPending || update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
import { Textarea } from "@/components/ui/textarea";
import { useRestockMutation } from "@/hooks/useInventoryQuery";
import { combine, validateMaxLength, validatePositiveInt } from "@/lib/validation";
import type { InventoryItemDTO } from "@/lib/types";

export function RestockModal({
  item,
  onClose,
}: {
  item: InventoryItemDTO;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const restock = useRestockMutation();

  async function onSubmit() {
    const validation = combine(
      validatePositiveInt(quantity, "Quantity"),
      validateMaxLength(note, 500, "Note"),
    );
    if (!validation.ok) return setError(validation.error);
    try {
      await restock.mutateAsync({
        itemId: item.id,
        quantity: Number(quantity),
        note: note.trim() || undefined,
      });
      toast.success("Restocked");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Restock failed");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Restock — {item.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="qty">Quantity to add</Label>
          <Input
            id="qty"
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
          />
          <Label htmlFor="note">Note (optional)</Label>
          <Textarea
            id="note"
            rows={2}
            maxLength={500}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={restock.isPending}>
            {restock.isPending ? "Saving…" : "Restock"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

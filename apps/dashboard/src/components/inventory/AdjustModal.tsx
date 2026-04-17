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
import { Textarea } from "@/components/ui/textarea";
import { useAdjustMutation } from "@/hooks/useInventoryQuery";
import { combine, validateMaxLength } from "@/lib/validation";
import type { InventoryAdjustmentReason, InventoryItemDTO } from "@/lib/types";

const REASONS: { label: string; value: InventoryAdjustmentReason }[] = [
  { label: "Manual adjustment", value: "manual_adjustment" },
  { label: "Damaged", value: "damaged" },
  { label: "Theft", value: "theft" },
  { label: "Miscounted", value: "miscounted" },
  { label: "Supplier error", value: "supplier_error" },
];

/**
 * Captures a signed stock adjustment and audit reason for one inventory item.
 *
 * @param item - Inventory item being adjusted.
 * @param onClose - Callback used to dismiss the modal.
 * @returns An adjustment dialog.
 */
export function AdjustModal({
  item,
  onClose,
}: {
  item: InventoryItemDTO;
  onClose: () => void;
}) {
  const [delta, setDelta] = useState("");
  const [reason, setReason] = useState<InventoryAdjustmentReason>("manual_adjustment");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const adjust = useAdjustMutation();

  async function onSubmit() {
    const n = Number(delta);
    if (!Number.isInteger(n) || n === 0) {
      return setError("Delta must be a non-zero integer");
    }
    const validation = combine(validateMaxLength(note, 500, "Note"));
    if (!validation.ok) return setError(validation.error);
    try {
      await adjust.mutateAsync({
        itemId: item.id,
        quantityDelta: n,
        reason,
        note: note.trim() || undefined,
      });
      toast.success("Adjusted");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Adjust failed");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust — {item.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Label htmlFor="delta">Delta (positive or negative)</Label>
          <Input
            id="delta"
            type="number"
            step={1}
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
          />
          <Label htmlFor="reason">Reason</Label>
          <Select
            value={reason}
            onValueChange={(v) => setReason(v as InventoryAdjustmentReason)}
          >
            <SelectTrigger id="reason">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {REASONS.map((r) => (
                <SelectItem key={r.value} value={r.value}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          <Button onClick={onSubmit} disabled={adjust.isPending}>
            {adjust.isPending ? "Saving…" : "Save adjustment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

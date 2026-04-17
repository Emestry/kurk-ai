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
import { useUpdateRequestMutation } from "@/hooks/useRequestsQuery";
import { combine, validatePositiveInt, validateRequired } from "@/lib/validation";
import type { GuestRequestDTO } from "@/lib/types";

interface Props {
  request: GuestRequestDTO;
  onClose: () => void;
}

/**
 * Modal shown when staff acknowledges a new request. ETA is required so
 * the guest sees a realistic wait estimate the moment the ticket moves
 * to "In progress".
 */
export function AcknowledgeModal({ request, onClose }: Props) {
  const [eta, setEta] = useState("");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateRequestMutation();

  async function onSubmit() {
    const validation = combine(
      validateRequired(eta, "ETA"),
      validatePositiveInt(eta, "ETA (minutes)"),
    );
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    try {
      await update.mutateAsync({
        requestId: request.id,
        status: "in_progress",
        etaMinutes: Number(eta),
      });
      toast.success("Acknowledged");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Acknowledge failed");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Acknowledge — Room {request.roomNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ack-eta">ETA (minutes)</Label>
            <Input
              id="ack-eta"
              type="number"
              min={1}
              value={eta}
              onChange={(e) => setEta(e.target.value)}
              placeholder="e.g. 10"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Tells the guest roughly how long this will take. Required.
            </p>
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={update.isPending}>
            {update.isPending ? "Acknowledging…" : "Acknowledge"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

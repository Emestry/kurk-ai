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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateRequestMutation } from "@/hooks/useRequestsQuery";
import { combine, validateMaxLength, validateRequired } from "@/lib/validation";
import type { GuestRequestDTO } from "@/lib/types";

export function RejectModal({
  request,
  onClose,
}: {
  request: GuestRequestDTO;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateRequestMutation();

  async function onSubmit() {
    const trimmed = reason.trim();
    const validation = combine(
      validateRequired(trimmed, "Explanation"),
      validateMaxLength(trimmed, 500, "Explanation"),
    );
    if (!validation.ok) {
      setError(validation.error);
      return;
    }
    try {
      await update.mutateAsync({
        requestId: request.id,
        status: "rejected",
        rejectionReason: trimmed,
      });
      toast.success("Request rejected");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Reject failed");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject — Room {request.roomNumber}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">
              Explanation (visible to the guest)
            </Label>
            <Textarea
              id="reject-reason"
              rows={4}
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this request can't be fulfilled…"
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              {reason.length}/500 characters
            </p>
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={onSubmit}
            disabled={update.isPending || reason.trim().length === 0}
          >
            {update.isPending ? "Rejecting…" : "Reject request"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

"use client";
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
import { useRevokeSessionMutation } from "@/hooks/useRoomsQuery";
import type { RoomDeviceSessionDTO } from "@/lib/types";

/**
 * Confirms disconnecting a paired guest tablet from its room.
 *
 * @param session - Active device session being revoked.
 * @param roomNumber - Human-readable room number for the dialog copy.
 * @param onClose - Callback used to dismiss the dialog.
 * @returns A destructive confirmation dialog.
 */
export function RevokeSessionDialog({
  session,
  roomNumber,
  onClose,
}: {
  session: RoomDeviceSessionDTO;
  roomNumber: string;
  onClose: () => void;
}) {
  const revoke = useRevokeSessionMutation();
  async function onConfirm() {
    try {
      await revoke.mutateAsync({ sessionId: session.id });
      toast.success("Session revoked");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Revoke failed");
    }
  }
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revoke session — Room {roomNumber}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The tablet in Room {roomNumber} will be disconnected immediately and
          will require re-pairing. This cannot be undone.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={revoke.isPending}>
            {revoke.isPending ? "Revoking…" : "Revoke"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

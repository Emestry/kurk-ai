"use client";

import { format } from "date-fns";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useEtaCountdown } from "@/hooks/useEtaCountdown";
import { useExtendRequestEtaMutation } from "@/hooks/useRequestsQuery";
import type { GuestRequestDTO } from "@/lib/types";

interface Props {
  request: GuestRequestDTO;
  onClose: () => void;
  onOpenAcknowledge: () => void;
  onOpenDeliver: () => void;
  onOpenReject: () => void;
}

export function RequestDrawer({
  request,
  onClose,
  onOpenAcknowledge,
  onOpenDeliver,
  onOpenReject,
}: Props) {
  const canAcknowledge = request.status === "received";
  const canDeliver = request.status === "in_progress";
  const canReject =
    request.status === "received" || request.status === "in_progress";
  const eta = useEtaCountdown(request.etaAt, request.status);
  const extend = useExtendRequestEtaMutation();

  async function onExtend() {
    try {
      await extend.mutateAsync({ requestId: request.id, minutes: 5 });
      toast.success("ETA extended by 5 min");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Extend failed");
    }
  }

  return (
    <Sheet open onOpenChange={onClose}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader className="p-6 pb-4 space-y-2">
          <SheetTitle>Room {request.roomNumber}</SheetTitle>
          <div className="flex items-center gap-2">
            <StatusBadge status={request.status} />
            <span className="text-xs text-muted-foreground">
              Created {format(new Date(request.createdAt), "PPpp")}
            </span>
          </div>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6">
          <section>
            <h3 className="mb-2 text-sm font-semibold">Request</h3>
            <p className="text-sm text-foreground/80">{request.rawText}</p>
          </section>

          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Line items</h3>
            <ul className="space-y-2">
              {request.items.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm"
                >
                  <span>
                    {item.requestedQuantity}× {item.name}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    delivered {item.deliveredQuantity}/{item.requestedQuantity}
                  </span>
                </li>
              ))}
            </ul>
            {canAcknowledge || canDeliver || canReject ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {canAcknowledge ? (
                  <Button onClick={onOpenAcknowledge}>Acknowledge…</Button>
                ) : null}
                {canDeliver ? (
                  <Button variant="outline" onClick={onOpenDeliver}>
                    Partial delivery…
                  </Button>
                ) : null}
                {canReject ? (
                  <Button variant="destructive" onClick={onOpenReject}>
                    Reject…
                  </Button>
                ) : null}
              </div>
            ) : null}
          </section>

          {eta.label ? (
            <section>
              <h3 className="mb-1 text-sm font-semibold">ETA</h3>
              <div className="flex items-center gap-3">
                <p className="text-sm text-foreground/80">{eta.label}</p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onExtend}
                  disabled={extend.isPending}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  {extend.isPending ? "Adding…" : "5 min"}
                </Button>
              </div>
            </section>
          ) : null}

          {request.staffNote ? (
            <section>
              <h3 className="mb-1 text-sm font-semibold">Staff note</h3>
              <p className="text-sm italic text-foreground/80">
                &ldquo;{request.staffNote}&rdquo;
              </p>
            </section>
          ) : null}

          {request.rejectionReason ? (
            <section>
              <h3 className="mb-2 text-sm font-semibold text-destructive">
                Rejection reason
              </h3>
              <p className="text-sm">{request.rejectionReason}</p>
            </section>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

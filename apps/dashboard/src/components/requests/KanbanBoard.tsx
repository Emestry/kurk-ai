"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useRequestsQuery, useUpdateRequestMutation } from "@/hooks/useRequestsQuery";
import { KanbanColumn } from "./KanbanColumn";
import { RequestCard } from "./RequestCard";
import { AcknowledgeModal } from "./AcknowledgeModal";
import { DeliverModal } from "./DeliverModal";
import { RejectModal } from "./RejectModal";
import { RequestDrawer } from "./RequestDrawer";
import type { GuestRequestDTO } from "@/lib/types";

type ModalState =
  | { kind: "none" }
  | { kind: "acknowledge"; request: GuestRequestDTO }
  | { kind: "deliver"; request: GuestRequestDTO }
  | { kind: "reject"; request: GuestRequestDTO }
  | { kind: "drawer"; request: GuestRequestDTO };

export function KanbanBoard() {
  const { data, isLoading, error } = useRequestsQuery();
  const updateMutation = useUpdateRequestMutation();
  const [modal, setModal] = useState<ModalState>({ kind: "none" });

  const grouped = useMemo(() => {
    const received: GuestRequestDTO[] = [];
    const inProgress: GuestRequestDTO[] = [];
    const done: GuestRequestDTO[] = [];
    for (const r of data ?? []) {
      if (r.status === "received") received.push(r);
      else if (r.status === "in_progress") inProgress.push(r);
      else done.push(r);
    }
    const sort = (arr: GuestRequestDTO[]) =>
      arr.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      received: sort(received),
      inProgress: sort(inProgress),
      done: sort(done),
    };
  }, [data]);

  async function markDelivered(request: GuestRequestDTO) {
    try {
      await updateMutation.mutateAsync({
        requestId: request.id,
        status: "delivered",
        items: request.items.map((item) => ({
          requestItemId: item.id,
          deliveredQuantity: item.requestedQuantity,
        })),
      });
      toast.success("Delivered");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  if (error) return <p className="text-destructive">Failed to load requests.</p>;
  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      <KanbanColumn title="Received" count={grouped.received.length}>
        {grouped.received.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            onAcknowledge={() => setModal({ kind: "acknowledge", request: r })}
            onMarkDelivered={() => markDelivered(r)}
            onOpenDrawer={() => setModal({ kind: "drawer", request: r })}
          />
        ))}
      </KanbanColumn>
      <KanbanColumn title="In progress" count={grouped.inProgress.length}>
        {grouped.inProgress.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            onAcknowledge={() => setModal({ kind: "acknowledge", request: r })}
            onMarkDelivered={() => markDelivered(r)}
            onOpenDrawer={() => setModal({ kind: "drawer", request: r })}
          />
        ))}
      </KanbanColumn>
      <KanbanColumn title="Delivered / rejected" count={grouped.done.length}>
        {grouped.done.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            onAcknowledge={() => setModal({ kind: "acknowledge", request: r })}
            onMarkDelivered={() => markDelivered(r)}
            onOpenDrawer={() => setModal({ kind: "drawer", request: r })}
          />
        ))}
      </KanbanColumn>

      {modal.kind === "acknowledge" ? (
        <AcknowledgeModal
          request={modal.request}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "deliver" ? (
        <DeliverModal
          request={modal.request}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "reject" ? (
        <RejectModal
          request={modal.request}
          onClose={() => setModal({ kind: "none" })}
        />
      ) : null}
      {modal.kind === "drawer" ? (
        <RequestDrawer
          request={modal.request}
          onClose={() => setModal({ kind: "none" })}
          onOpenAcknowledge={() =>
            setModal({ kind: "acknowledge", request: modal.request })
          }
          onOpenDeliver={() =>
            setModal({ kind: "deliver", request: modal.request })
          }
          onOpenReject={() =>
            setModal({ kind: "reject", request: modal.request })
          }
        />
      ) : null}
    </div>
  );
}

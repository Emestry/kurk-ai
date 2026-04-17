"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { useRequestsQuery, useUpdateRequestMutation } from "@/hooks/useRequestsQuery";
import { Button } from "@/components/ui/button";
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
  const [donePage, setDonePage] = useState(0);
  const doneColumnRef = useRef<HTMLDivElement | null>(null);
  const DONE_PAGE_SIZE = 25;

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
  const donePageCount = Math.max(1, Math.ceil(grouped.done.length / DONE_PAGE_SIZE));
  const pagedDone = grouped.done.slice(
    donePage * DONE_PAGE_SIZE,
    (donePage + 1) * DONE_PAGE_SIZE,
  );

  useEffect(() => {
    if (!doneColumnRef.current) {
      return;
    }

    doneColumnRef.current.scrollTop = 0;
  }, [donePage]);

  function handleDonePageChange(nextPage: number) {
    setDonePage(nextPage);
  }

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
      <KanbanColumn
        title="Completed"
        count={grouped.done.length}
        className="max-w-[24rem] flex-[0.9]"
        description="Resolved requests are paged and kept quieter so active work stays front-and-center."
        contentRef={doneColumnRef}
      >
        {pagedDone.map((r) => (
          <RequestCard
            key={r.id}
            request={r}
            onAcknowledge={() => setModal({ kind: "acknowledge", request: r })}
            onMarkDelivered={() => markDelivered(r)}
            onOpenDrawer={() => setModal({ kind: "drawer", request: r })}
            subdued
          />
        ))}
        {grouped.done.length > DONE_PAGE_SIZE ? (
          <div className="sticky bottom-0 flex items-center justify-between rounded-lg border border-border/60 bg-background/95 px-3 py-2 text-xs text-muted-foreground backdrop-blur">
            <span>
              Page {donePage + 1} of {donePageCount}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={donePage === 0}
                onClick={() => handleDonePageChange(donePage - 1)}
              >
                Previous
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={donePage + 1 >= donePageCount}
                onClick={() => handleDonePageChange(donePage + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
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

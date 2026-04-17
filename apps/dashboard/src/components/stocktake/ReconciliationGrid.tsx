"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useFinalizeStocktakeMutation,
  useStocktakeDetailQuery,
  useUpsertLinesMutation,
} from "@/hooks/useStocktakeQuery";
import type {
  StocktakeDiscrepancyReason,
  StocktakeLineDTO,
} from "@/lib/types";

const REASONS: { value: StocktakeDiscrepancyReason; label: string }[] = [
  { value: "damaged", label: "Damaged" },
  { value: "theft", label: "Theft" },
  { value: "miscounted", label: "Miscounted" },
  { value: "supplier_error", label: "Supplier error" },
];

interface DraftState {
  physical: string;
  reason: StocktakeDiscrepancyReason | null;
}

/**
 * Lets staff count inventory, resolve discrepancies, and finalize a stocktake.
 *
 * @param sessionId - Stocktake session being reconciled.
 * @returns The reconciliation grid for that session.
 */
export function ReconciliationGrid({ sessionId }: { sessionId: string }) {
  const { data: session } = useStocktakeDetailQuery(sessionId);
  const upsert = useUpsertLinesMutation();
  const finalize = useFinalizeStocktakeMutation();
  const router = useRouter();

  /**
   * Stores only user-typed overrides keyed by inventoryItemId.
   * Server-provided values are used as defaults in the derived `drafts` memo.
   * This avoids calling setState inside a useEffect body.
   */
  const [userEdits, setUserEdits] = useState<Record<string, DraftState>>({});
  const saveTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const drafts = useMemo<Record<string, DraftState>>(() => {
    if (!session) return {};
    const merged: Record<string, DraftState> = {};
    for (const line of session.lines) {
      merged[line.inventoryItemId] = userEdits[line.inventoryItemId] ?? {
        physical: line.physicalCount == null ? "" : String(line.physicalCount),
        reason: line.reason,
      };
    }
    return merged;
  }, [session, userEdits]);

  function updateDraft(inventoryItemId: string, next: DraftState) {
    setUserEdits((prev) => ({ ...prev, [inventoryItemId]: next }));
  }

  const readOnly = session?.status === "finalized";

  function scheduleSave(line: StocktakeLineDTO, next: DraftState) {
    if (readOnly) return;
    const existing = saveTimers.current.get(line.inventoryItemId);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      void upsert
        .mutateAsync({
          sessionId,
          lines: [
            {
              inventoryItemId: line.inventoryItemId,
              physicalCount: Number(next.physical),
              reason: next.reason ?? undefined,
            },
          ],
        })
        .catch((err) => {
          toast.error(err instanceof ApiError ? err.message : "Save failed");
        });
    }, 600);
    saveTimers.current.set(line.inventoryItemId, timer);
  }

  const sortedLines = useMemo(() => {
    if (!session) return [];
    return session.lines.slice().sort((a, b) => {
      const da = Math.abs(a.discrepancyQuantity ?? 0);
      const db = Math.abs(b.discrepancyQuantity ?? 0);
      if (db !== da) return db - da;
      return a.itemName.localeCompare(b.itemName);
    });
  }, [session]);

  if (!session) return <p>Loading…</p>;

  const allFilled = session.lines.every((l) => l.physicalCount != null);
  const allReasoned = session.lines.every(
    (l) => (l.discrepancyQuantity ?? 0) === 0 || l.reason != null,
  );
  const canFinalize = !readOnly && allFilled && allReasoned;

  async function onFinalize() {
    if (!confirm(
      "This will adjust stock levels and create an audit trail. Proceed?",
    ))
      return;
    try {
      await finalize.mutateAsync({ sessionId });
      toast.success("Stocktake finalized");
      router.push("/stocktake");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Finalize failed");
    }
  }

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Stocktake · {session.status}
          </h1>
          <p className="text-xs text-muted-foreground">
            Session {session.id.slice(0, 8)}
          </p>
        </div>
        {readOnly ? null : (
          <Button onClick={onFinalize} disabled={!canFinalize || finalize.isPending}>
            {finalize.isPending ? "Finalizing…" : "Finalize"}
          </Button>
        )}
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Item</TableHead>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Expected</TableHead>
            <TableHead className="text-right">Physical</TableHead>
            <TableHead className="text-right">Discrepancy</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>✓</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedLines.map((line) => {
            const draft = drafts[line.inventoryItemId] ?? {
              physical: "",
              reason: null,
            };
            const physical = draft.physical === "" ? null : Number(draft.physical);
            const discrepancy =
              physical == null ? null : physical - line.expectedQuantity;
            const reasonRequired = discrepancy != null && discrepancy !== 0;
            const valid =
              physical != null && (!reasonRequired || draft.reason != null);
            return (
              <TableRow
                key={line.id}
                className={
                  !valid && physical != null
                    ? "border-l-2 border-l-red-500/60"
                    : ""
                }
              >
                <TableCell>{line.itemName}</TableCell>
                <TableCell className="capitalize text-muted-foreground">
                  {line.itemCategory.replace("_", " ")}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {line.expectedQuantity}
                </TableCell>
                <TableCell className="text-right">
                  <Input
                    type="number"
                    min={0}
                    disabled={readOnly}
                    value={draft.physical}
                    onChange={(e) => {
                      const next = { ...draft, physical: e.target.value };
                      updateDraft(line.inventoryItemId, next);
                    }}
                    onBlur={() =>
                      scheduleSave(line, drafts[line.inventoryItemId] ?? draft)
                    }
                    className="ml-auto w-24"
                  />
                </TableCell>
                <TableCell
                  className={`text-right font-mono ${
                    discrepancy === 0 || discrepancy == null
                      ? "text-muted-foreground"
                      : "text-amber-400"
                  }`}
                >
                  {discrepancy == null
                    ? "—"
                    : discrepancy > 0
                      ? `+${discrepancy}`
                      : String(discrepancy)}
                </TableCell>
                <TableCell>
                  <Select
                    value={draft.reason ?? undefined}
                    onValueChange={(v) => {
                      const next = {
                        ...draft,
                        reason: v as StocktakeDiscrepancyReason,
                      };
                      updateDraft(line.inventoryItemId, next);
                      scheduleSave(line, next);
                    }}
                    disabled={
                      readOnly || discrepancy == null || discrepancy === 0
                    }
                  >
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="—" />
                    </SelectTrigger>
                    <SelectContent>
                      {REASONS.map((r) => (
                        <SelectItem key={r.value} value={r.value}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell>
                  {valid ? (
                    <span className="text-emerald-400">✓</span>
                  ) : (
                    <span className="text-muted-foreground">·</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

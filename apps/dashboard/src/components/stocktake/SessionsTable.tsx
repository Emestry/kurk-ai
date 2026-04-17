"use client";

import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useStartStocktakeMutation,
  useStocktakeListQuery,
} from "@/hooks/useStocktakeQuery";

export function SessionsTable() {
  const router = useRouter();
  const { data, isLoading } = useStocktakeListQuery();
  const start = useStartStocktakeMutation();

  const openSession = (data ?? []).find((s) => s.status === "open");

  async function onStart() {
    try {
      const s = await start.mutateAsync();
      router.push(`/stocktake/${s.id}`);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to start session");
    }
  }

  if (isLoading) return <p>Loading…</p>;

  return (
    <div className="space-y-4">
      {openSession ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          An open stocktake is already in progress.{" "}
          <Link
            className="underline"
            href={`/stocktake/${openSession.id}`}
          >
            Continue
          </Link>
          .
        </div>
      ) : (
        <Button onClick={onStart} disabled={start.isPending}>
          {start.isPending ? "Starting…" : "Start new stocktake"}
        </Button>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Status</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Finalized</TableHead>
            <TableHead>Lines</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data ?? []).map((s) => (
            <TableRow key={s.id}>
              <TableCell className="capitalize">{s.status}</TableCell>
              <TableCell>{format(new Date(s.createdAt), "PP p")}</TableCell>
              <TableCell>
                {s.finalizedAt ? format(new Date(s.finalizedAt), "PP p") : "—"}
              </TableCell>
              <TableCell>{s.lines.length}</TableCell>
              <TableCell className="text-right">
                <Link
                  className="text-sm underline"
                  href={`/stocktake/${s.id}`}
                >
                  Open
                </Link>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

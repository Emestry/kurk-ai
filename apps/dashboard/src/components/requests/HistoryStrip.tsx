"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { useRequestsQuery } from "@/hooks/useRequestsQuery";

const PAGE_SIZE = 50;

export function HistoryStrip() {
  const { data } = useRequestsQuery();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState(false);

  const rows = useMemo(() => {
    const all = (data ?? [])
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((r) =>
      `${r.roomNumber} ${r.rawText} ${r.category ?? ""}`.toLowerCase().includes(q),
    );
  }, [data, search]);

  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <section className={expanded ? "h-[70vh] overflow-auto" : "max-h-40 overflow-hidden"}>
      <header className="mb-2 flex items-center justify-between gap-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </h3>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search room, text, category"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 w-64"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => setExpanded((e) => !e)}
          >
            {expanded ? "Collapse" : "Expand"}
          </Button>
        </div>
      </header>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Room</TableHead>
            <TableHead>Request</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pageRows.map((r) => (
            <TableRow key={r.id}>
              <TableCell>{r.roomNumber}</TableCell>
              <TableCell className="max-w-md truncate">{r.rawText}</TableCell>
              <TableCell>
                <StatusBadge status={r.status} />
              </TableCell>
              <TableCell className="text-muted-foreground">
                {format(new Date(r.createdAt), "PP p")}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {rows.length > PAGE_SIZE ? (
        <footer className="mt-2 flex items-center justify-end gap-2 text-xs">
          <Button
            size="sm"
            variant="outline"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page + 1} of {Math.ceil(rows.length / PAGE_SIZE)}
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={(page + 1) * PAGE_SIZE >= rows.length}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </footer>
      ) : null}
    </section>
  );
}

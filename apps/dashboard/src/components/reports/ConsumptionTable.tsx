"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { MonthlyReportDTO } from "@/lib/types";

type SortKey = keyof MonthlyReportDTO["consumption"][number];

/**
 * Displays sortable item-consumption totals for the selected month.
 *
 * @param data - Consumption rows from the monthly report.
 * @returns A sortable report table.
 */
export function ConsumptionTable({
  data,
}: {
  data: MonthlyReportDTO["consumption"];
}) {
  const [sort, setSort] = useState<SortKey>("unitsDelivered");
  const [desc, setDesc] = useState(true);
  const rows = data.slice().sort((a, b) => {
    const av = a[sort], bv = b[sort];
    const cmp = typeof av === "number" && typeof bv === "number"
      ? av - bv
      : String(av).localeCompare(String(bv));
    return desc ? -cmp : cmp;
  });

  function toggle(k: SortKey) {
    if (k === sort) setDesc((d) => !d);
    else { setSort(k); setDesc(true); }
  }

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold">Consumption</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer" onClick={() => toggle("itemName")}>Item</TableHead>
            <TableHead className="cursor-pointer" onClick={() => toggle("category")}>Category</TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => toggle("unitsRequested")}>
              Units requested
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => toggle("unitsDelivered")}>
              Units delivered
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => toggle("unitsUnfulfilled")}>
              Unfulfilled
            </TableHead>
            <TableHead className="cursor-pointer text-right" onClick={() => toggle("requests")}>
              Requests
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={r.inventoryItemId}>
              <TableCell>{r.itemName}</TableCell>
              <TableCell className="capitalize text-muted-foreground">
                {r.category.replace("_", " ")}
              </TableCell>
              <TableCell className="text-right font-mono">{r.unitsRequested}</TableCell>
              <TableCell className="text-right font-mono">{r.unitsDelivered}</TableCell>
              <TableCell className="text-right font-mono">{r.unitsUnfulfilled}</TableCell>
              <TableCell className="text-right font-mono">{r.requests}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}

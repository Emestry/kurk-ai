"use client";
import Link from "next/link";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyReportDTO } from "@/lib/types";

/**
 * Summarizes stocktake reconciliation outcomes for the selected month.
 *
 * @param data - Reconciliation sessions included in the report.
 * @returns Aggregate reconciliation metrics plus per-session links.
 */
export function ReconciliationSummary({
  data,
}: {
  data: MonthlyReportDTO["reconciliations"];
}) {
  const totals = data.reduce(
    (acc, r) => {
      acc.itemCount += r.itemCount;
      acc.discrepant += r.discrepantItemCount;
      acc.net += r.netAdjustment;
      for (const [k, v] of Object.entries(r.reasons)) {
        acc.reasons[k] = (acc.reasons[k] ?? 0) + (v as number);
      }
      return acc;
    },
    { itemCount: 0, discrepant: 0, net: 0, reasons: {} as Record<string, number> },
  );

  const reasonsData = Object.entries(totals.reasons).map(([k, v]) => ({
    name: k,
    count: v,
  }));

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-semibold">Reconciliation summary</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">
            Reconciliations
          </p>
          <p className="mt-2 text-2xl font-semibold">{data.length}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">
            Discrepant items
          </p>
          <p className="mt-2 text-2xl font-semibold">{totals.discrepant}</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs uppercase text-muted-foreground">
            Net adjustment
          </p>
          <p className="mt-2 text-2xl font-semibold">
            {totals.net > 0 ? `+${totals.net}` : totals.net}
          </p>
        </div>
      </div>
      {reasonsData.length > 0 ? (
        <div className="h-52 rounded-lg border border-border bg-card p-4">
          <ResponsiveContainer>
            <BarChart data={reasonsData}>
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#f43f5e" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <ul className="space-y-1 text-sm">
        {data.map((r) => (
          <li key={r.sessionId} className="flex justify-between">
            <Link className="underline" href={`/stocktake/${r.sessionId}`}>
              Session {r.sessionId.slice(0, 8)}
            </Link>
            <span className="text-muted-foreground">
              {r.itemCount} lines · {r.discrepantItemCount} discrepant ·
              net {r.netAdjustment}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

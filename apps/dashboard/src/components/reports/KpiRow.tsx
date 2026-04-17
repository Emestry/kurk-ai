"use client";
import type { MonthlyReportDTO } from "@/lib/types";

function fmtSecs(s: number | null) {
  if (s == null) return "—";
  if (s < 60) return `${s.toFixed(0)}s`;
  return `${(s / 60).toFixed(1)}m`;
}

/**
 * Renders the headline KPI cards for the monthly report.
 *
 * @param data - Monthly report aggregate metrics.
 * @returns A responsive KPI grid.
 */
export function KpiRow({ data }: { data: MonthlyReportDTO }) {
  return (
    <div className="grid gap-3 sm:grid-cols-4">
      <Kpi label="Total requests" value={data.totalRequests} />
      <Kpi
        label="Outcomes"
        value={`${data.outcomes.delivered} delivered`}
        sub={`${data.outcomes.partiallyDelivered} partial · ${data.outcomes.rejected} rejected`}
      />
      <Kpi label="Units delivered" value={data.totalUnitsDelivered} />
      <Kpi
        label="Avg response time"
        value={fmtSecs(data.averageResponseTimeSeconds)}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

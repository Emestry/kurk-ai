"use client";

import { useState } from "react";
import { format, startOfMonth } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMonthlyReportQuery } from "@/hooks/useMonthlyReportQuery";
import { KpiRow } from "@/components/reports/KpiRow";
import { RequestsByDayChart } from "@/components/reports/RequestsByDayChart";
import { BusiestHoursChart } from "@/components/reports/BusiestHoursChart";
import { CategoryDonut } from "@/components/reports/CategoryDonut";
import { TopItemsBar } from "@/components/reports/TopItemsBar";
import { ConsumptionTable } from "@/components/reports/ConsumptionTable";
import { ReconciliationSummary } from "@/components/reports/ReconciliationSummary";

/**
 * Renders the monthly reporting screen for staff analytics.
 *
 * @returns The report picker, KPI summary, charts, and tables.
 */
export default function ReportsPage() {
  const [month, setMonth] = useState(format(startOfMonth(new Date()), "yyyy-MM"));
  const { data, isLoading } = useMonthlyReportQuery(month);

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-3">
        <h1 className="text-xl font-semibold">Monthly report</h1>
        <Input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="w-48"
        />
        <Button
          variant="outline"
          disabled={!data}
          onClick={() => data && exportCsv(data)}
        >
          Export CSV
        </Button>
      </header>
      {isLoading || !data ? (
        <p>Loading…</p>
      ) : (
        <>
          <KpiRow data={data} />
          <div className="grid gap-4 lg:grid-cols-2">
            <RequestsByDayChart data={data.requestsByDay} />
            <BusiestHoursChart data={data.requestsByHour} />
            <CategoryDonut data={data.requestsByCategory} />
            <TopItemsBar data={data.consumption} />
          </div>
          <ConsumptionTable data={data.consumption} />
          <ReconciliationSummary data={data.reconciliations} />
        </>
      )}
    </div>
  );
}

/**
 * Serializes the currently loaded report into CSV and triggers a browser download.
 *
 * @param data - Monthly report data to export.
 * @returns Nothing.
 */
function exportCsv(data: import("@/lib/types").MonthlyReportDTO) {
  const rows = [
    ["item", "category", "unitsRequested", "unitsDelivered", "unitsUnfulfilled", "requests"],
    ...data.consumption.map((c) => [
      c.itemName,
      c.category,
      c.unitsRequested,
      c.unitsDelivered,
      c.unitsUnfulfilled,
      c.requests,
    ]),
  ];
  const csv = rows.map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `staff-report-${data.month}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

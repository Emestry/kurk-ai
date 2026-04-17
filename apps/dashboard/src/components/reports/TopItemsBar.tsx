"use client";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyReportDTO } from "@/lib/types";

/**
 * Highlights the most delivered inventory items in the selected month.
 *
 * @param data - Consumption rows used to derive the top items.
 * @returns A horizontal bar chart card.
 */
export function TopItemsBar({
  data,
}: {
  data: MonthlyReportDTO["consumption"];
}) {
  const top = data
    .slice()
    .sort((a, b) => b.unitsDelivered - a.unitsDelivered)
    .slice(0, 10);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">Top items consumed</h3>
      <div className="h-60">
        <ResponsiveContainer>
          <BarChart data={top} layout="vertical">
            <CartesianGrid strokeOpacity={0.1} />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis
              type="category"
              dataKey="itemName"
              tick={{ fontSize: 10 }}
              width={120}
            />
            <Tooltip />
            <Bar dataKey="unitsDelivered" fill="#14b8a6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

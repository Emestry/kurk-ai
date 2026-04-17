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
 * Visualizes which hours saw the highest room-service request volume.
 *
 * @param data - Hourly request counts for the selected month.
 * @returns A bar chart card.
 */
export function BusiestHoursChart({
  data,
}: {
  data: MonthlyReportDTO["requestsByHour"];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">Busiest hours</h3>
      <div className="h-60">
        <ResponsiveContainer>
          <BarChart data={data}>
            <CartesianGrid strokeOpacity={0.1} />
            <XAxis dataKey="hour" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Bar dataKey="count" fill="#14b8a6" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

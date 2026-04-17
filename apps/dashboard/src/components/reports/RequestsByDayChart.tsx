"use client";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyReportDTO } from "@/lib/types";

export function RequestsByDayChart({
  data,
}: {
  data: MonthlyReportDTO["requestsByDay"];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">Requests by day</h3>
      <div className="h-60">
        <ResponsiveContainer>
          <AreaChart data={data}>
            <CartesianGrid strokeOpacity={0.1} />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Area
              dataKey="received"
              stackId="1"
              stroke="#f59e0b"
              fill="#f59e0b33"
            />
            <Area
              dataKey="inProgress"
              stackId="1"
              stroke="#0ea5e9"
              fill="#0ea5e933"
            />
            <Area
              dataKey="delivered"
              stackId="1"
              stroke="#10b981"
              fill="#10b98133"
            />
            <Area
              dataKey="partiallyDelivered"
              stackId="1"
              stroke="#8b5cf6"
              fill="#8b5cf633"
            />
            <Area
              dataKey="rejected"
              stackId="1"
              stroke="#ef4444"
              fill="#ef444433"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

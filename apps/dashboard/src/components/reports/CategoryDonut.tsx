"use client";
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import type { MonthlyReportDTO } from "@/lib/types";

const COLORS = ["#14b8a6", "#f59e0b", "#8b5cf6", "#ef4444"];

export function CategoryDonut({
  data,
}: {
  data: MonthlyReportDTO["requestsByCategory"];
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">Category breakdown</h3>
      <div className="h-60">
        <ResponsiveContainer>
          <PieChart>
            <Pie
              dataKey="count"
              data={data}
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";
import type { MonthlyReportDTO } from "@/lib/types";

/**
 * Normalize the raw monthly report into the client DTO. Adjust to match
 * apps/api/src/services/report-service.ts output shape.
 */
export function mapMonthlyReport(raw: unknown): MonthlyReportDTO {
  return raw as MonthlyReportDTO;
}

/**
 * Fetches the aggregated monthly reporting payload for the selected month.
 *
 * @param month - Month in YYYY-MM format.
 * @returns A React Query result containing the normalized monthly report DTO.
 */
export function useMonthlyReportQuery(month: string) {
  return useQuery<MonthlyReportDTO>({
    queryKey: queryKeys.reports.monthly(month),
    queryFn: async () => {
      const raw = await apiFetch<unknown>(`/staff/reports/monthly?month=${month}`);
      return mapMonthlyReport(raw);
    },
    staleTime: 5 * 60 * 1000,
  });
}

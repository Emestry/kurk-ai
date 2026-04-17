import { QueryClient } from "@tanstack/react-query";

/**
 * Factory for the TanStack QueryClient used across the dashboard.
 * Kept as a factory so the App shell can create a single instance
 * in a React state ref and not reinstantiate on re-renders.
 *
 * @returns A configured QueryClient with 30s stale time for live data.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: 1,
        refetchOnWindowFocus: false,
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

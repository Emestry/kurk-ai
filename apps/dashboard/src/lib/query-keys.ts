/**
 * Centralized query-key factory for TanStack Query. All cache reads
 * and invalidations must go through these factories so key shapes
 * stay consistent between hooks, mutations, and the WS dispatcher.
 */
export const queryKeys = {
  session: () => ["session"] as const,
  requests: {
    all: () => ["requests"] as const,
    list: () => ["requests", "list"] as const,
    detail: (id: string) => ["requests", "detail", id] as const,
    history: (params: { month?: string; status?: string }) =>
      ["requests", "history", params] as const,
  },
  inventory: {
    all: () => ["inventory"] as const,
    list: () => ["inventory", "list"] as const,
    movements: (itemId: string) =>
      ["inventory", "movements", itemId] as const,
  },
  rooms: {
    all: () => ["rooms"] as const,
    list: () => ["rooms", "list"] as const,
  },
  stocktake: {
    all: () => ["stocktake"] as const,
    list: () => ["stocktake", "list"] as const,
    detail: (id: string) => ["stocktake", "detail", id] as const,
  },
  reports: {
    all: () => ["reports"] as const,
    monthly: (month: string) => ["reports", "monthly", month] as const,
  },
};

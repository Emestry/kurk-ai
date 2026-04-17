import { ReconciliationGrid } from "@/components/stocktake/ReconciliationGrid";

/**
 * Renders one stocktake reconciliation session from the route parameter.
 *
 * @param params - Promise resolving to the dynamic route params.
 * @returns The reconciliation grid for the requested session.
 */
export default async function StocktakeSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ReconciliationGrid sessionId={sessionId} />;
}

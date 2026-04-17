import { ReconciliationGrid } from "@/components/stocktake/ReconciliationGrid";

export default async function StocktakeSessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  return <ReconciliationGrid sessionId={sessionId} />;
}

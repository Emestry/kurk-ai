import { KanbanBoard } from "@/components/requests/KanbanBoard";
import { HistoryStrip } from "@/components/requests/HistoryStrip";

export default function RequestsHome() {
  return (
    <div className="space-y-6">
      <KanbanBoard />
      <HistoryStrip />
    </div>
  );
}

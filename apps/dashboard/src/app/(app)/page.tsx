import { KanbanBoard } from "@/components/requests/KanbanBoard";
import { HistoryStrip } from "@/components/requests/HistoryStrip";

/**
 * Renders the main staff requests workspace.
 *
 * @returns The kanban board and request history strip.
 */
export default function RequestsHome() {
  return (
    <div className="space-y-6">
      <KanbanBoard />
      <HistoryStrip />
    </div>
  );
}

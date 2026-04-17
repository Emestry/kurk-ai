import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/lib/types";

const LABEL: Record<RequestStatus, string> = {
  received: "New",
  in_progress: "In progress",
  partially_delivered: "Partial",
  delivered: "Delivered",
  rejected: "Rejected",
};

const TONE: Record<RequestStatus, string> = {
  received: "bg-amber-500/20 text-amber-300 border-amber-500/40",
  in_progress: "bg-sky-500/20 text-sky-300 border-sky-500/40",
  partially_delivered:
    "bg-violet-500/20 text-violet-300 border-violet-500/40",
  delivered: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40",
  rejected: "bg-red-500/20 text-red-300 border-red-500/40",
};

export function StatusBadge({ status }: { status: RequestStatus }) {
  return (
    <Badge variant="outline" className={TONE[status]}>
      {LABEL[status]}
    </Badge>
  );
}

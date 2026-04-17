import { ReactNode } from "react";

interface Props {
  title: string;
  count: number;
  children: ReactNode;
}

export function KanbanColumn({ title, count, children }: Props) {
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-baseline justify-between px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
        <span className="text-xs text-muted-foreground">· {count}</span>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto pr-1">{children}</div>
    </section>
  );
}

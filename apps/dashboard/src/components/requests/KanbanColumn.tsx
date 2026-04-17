import type { ReactNode, RefObject } from "react";

interface Props {
  title: string;
  count: number;
  children: ReactNode;
  className?: string;
  description?: string;
  contentRef?: RefObject<HTMLDivElement | null>;
}

/**
 * Provides the shared shell for one request-board column.
 *
 * @param title - Column heading.
 * @param count - Number displayed beside the heading.
 * @param children - Column card content.
 * @param className - Optional width or layout overrides.
 * @param description - Optional helper copy shown under the title.
 * @param contentRef - Optional ref to the scrollable content container.
 * @returns A titled kanban column.
 */
export function KanbanColumn({
  title,
  count,
  children,
  className,
  description,
  contentRef,
}: Props) {
  return (
    <section className={`flex min-h-0 flex-1 flex-col gap-3 ${className ?? ""}`}>
      <header className="flex items-baseline justify-between px-1">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            {title}
          </h2>
          {description ? (
            <p className="mt-1 text-xs text-muted-foreground/75">{description}</p>
          ) : null}
        </div>
        <span className="text-xs text-muted-foreground">· {count}</span>
      </header>
      <div ref={contentRef} className="flex-1 space-y-3 overflow-y-auto pr-1">
        {children}
      </div>
    </section>
  );
}

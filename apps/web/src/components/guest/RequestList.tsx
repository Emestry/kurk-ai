"use client";

import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";
import { getGuestLocale, useGuestLanguage } from "@/lib/guest-language";
import { useTranslatedTexts } from "@/hooks/useTranslatedTexts";
import { cn } from "@/lib/utils";
import type { GuestRequest, RequestStatus } from "@/lib/types";
import { RequestCard } from "./RequestCard";

interface RequestListProps {
  requests: GuestRequest[];
}

function splitRequests(requests: GuestRequest[]) {
  const active: GuestRequest[] = [];
  const past: GuestRequest[] = [];

  for (const request of requests) {
    if (
      request.status === "delivered" ||
      request.status === "partially_delivered" ||
      request.status === "rejected"
    ) {
      past.push(request);
    } else {
      active.push(request);
    }
  }

  const byNewest = (a: GuestRequest, b: GuestRequest) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

  active.sort(byNewest);
  past.sort(byNewest);

  return { active, past };
}

function formatTime(dateString: string, locale: string) {
  const date = new Date(dateString);
  return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

function PastIcon({ status }: { status: RequestStatus }) {
  if (status === "rejected") {
    return (
      <X
        className="h-3.5 w-3.5 text-[var(--guest-status-rejected)]"
        strokeWidth={2.5}
      />
    );
  }

  return (
    <Check
      className="h-3.5 w-3.5 text-[var(--guest-status-delivered)]"
      strokeWidth={2.5}
    />
  );
}

function statusBorderColor(status: RequestStatus): string {
  const map: Record<RequestStatus, string> = {
    received: "var(--guest-status-received)",
    in_progress: "var(--guest-status-in-progress)",
    delivered: "var(--guest-status-delivered)",
    partially_delivered: "var(--guest-status-delivered)",
    rejected: "var(--guest-status-rejected)",
  };
  return map[status];
}

function translateRequest(
  request: GuestRequest,
  translations: Record<string, string>,
) {
  return {
    ...request,
    text: translations[request.text] ?? request.text,
    notes: request.notes ? (translations[request.notes] ?? request.notes) : null,
    items: request.items.map((item) => ({
      ...item,
      name: translations[item.name] ?? item.name,
    })),
  };
}

export function RequestList({ requests }: RequestListProps) {
  const { language, t } = useGuestLanguage();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { active, past } = splitRequests(requests);
  const locale = getGuestLocale(language);

  const textsToTranslate = useMemo(
    () =>
      requests.flatMap((request) => [
        request.text,
        ...(request.notes ? [request.notes] : []),
        ...request.items.map((item) => item.name),
      ]),
    [requests],
  );
  const translations = useTranslatedTexts(textsToTranslate, language);

  if (active.length === 0 && past.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="text-sm text-[var(--guest-text-dim)]">
          {t("requests.empty")}
        </p>
      </div>
    );
  }

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto px-6 pb-24 pt-4">
      <div className="flex flex-col gap-3">
        {active.map((request) => (
          <RequestCard
            key={request.id}
            request={translateRequest(request, translations)}
            isExpanded={expandedId === request.id}
            onToggle={() => handleToggle(request.id)}
          />
        ))}
      </div>

      {past.length > 0 && (
        <div className={cn(active.length > 0 && "mt-8")}>
          <div className="mb-4 flex items-center gap-4">
            <div className="h-px flex-1 bg-[var(--guest-border-dim)]" />
            <span className="text-[0.6rem] uppercase tracking-widest text-[var(--guest-text-dim)]">
              {t("requests.pastOrders")}
            </span>
            <div className="h-px flex-1 bg-[var(--guest-border-dim)]" />
          </div>

          <div className="flex flex-col gap-1.5">
            {past.map((request) => {
              const isExpanded = expandedId === request.id;
              const translated = translateRequest(request, translations);

              if (isExpanded) {
                return (
                  <div key={request.id} className="opacity-80">
                    <RequestCard
                      request={translated}
                      isExpanded
                      onToggle={() => handleToggle(request.id)}
                    />
                  </div>
                );
              }

              return (
                <button
                  key={request.id}
                  type="button"
                  onClick={() => handleToggle(request.id)}
                  className="flex items-center gap-3 rounded-xl border border-[var(--guest-border-dim)] px-4 py-2.5 text-left opacity-70 transition-all duration-200 hover:border-[var(--guest-border)] hover:opacity-85"
                  style={{
                    borderColor: isExpanded ? statusBorderColor(request.status) : undefined,
                  }}
                >
                  <PastIcon status={request.status} />
                  <p className="flex-1 truncate text-xs text-[var(--guest-text-muted)]">
                    {translated.text}
                  </p>
                  <span className="shrink-0 text-[0.6rem] text-[var(--guest-text-dim)]">
                    {formatTime(request.createdAt, locale)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

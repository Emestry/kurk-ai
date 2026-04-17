"use client";

import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateRequestMutation } from "@/hooks/useRequestsQuery";
import { validateNonNegativeInt, combine } from "@/lib/validation";
import type { GuestRequestDTO } from "@/lib/types";

interface Props {
  request: GuestRequestDTO;
  onClose: () => void;
}

const AUTO = "__auto";
const OTHER = "__other";

/**
 * Builds an auto-generated reason string from the short line items, e.g.
 * "Only 3 of 4 Bath Towel available" — or "No Bath Towel available" when
 * none are being delivered.
 */
function buildAutoReason(
  items: GuestRequestDTO["items"],
  values: Record<string, number>,
): string {
  const short = items.filter(
    (item) => (values[item.id] ?? 0) < item.requestedQuantity,
  );
  if (short.length === 0) return "";
  const phrases = short.map((item) => {
    const got = values[item.id] ?? 0;
    if (got === 0) return `no ${item.name} available`;
    return `only ${got} of ${item.requestedQuantity} ${item.name} available`;
  });
  const joined = phrases.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/**
 * Modal for marking a request delivered with per-line-item quantities.
 * When any item is short, staff must provide a reason (auto-generated,
 * preset, or custom).
 */
export function DeliverModal({ request, onClose }: Props) {
  const [values, setValues] = useState<Record<string, number>>(() => {
    const seed: Record<string, number> = {};
    for (const item of request.items) seed[item.id] = item.requestedQuantity;
    return seed;
  });
  const [preset, setPreset] = useState<string>(AUTO);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateRequestMutation();

  const autoReason = buildAutoReason(request.items, values);
  const isAnyShort = autoReason.length > 0;
  const isOther = preset === OTHER;

  async function onSubmit() {
    const validation = combine(
      ...request.items.map((item) =>
        validateNonNegativeInt(values[item.id], item.name),
      ),
    );
    if (!validation.ok) {
      setError(validation.error);
      return;
    }

    const totalDelivered = Object.values(values).reduce((a, b) => a + b, 0);
    if (totalDelivered === 0) {
      setError("Deliver at least one unit, or reject the request instead.");
      return;
    }

    let finalReason: string | undefined;
    if (isAnyShort) {
      if (!preset) {
        setError("Pick a reason for the shortfall");
        return;
      }
      if (preset === AUTO) finalReason = autoReason;
      else if (preset === OTHER) finalReason = custom.trim();
      else finalReason = preset;

      if (!finalReason) {
        setError("Reason is required");
        return;
      }
      if (finalReason.length > 500) {
        setError("Reason must be 500 characters or fewer");
        return;
      }
    }

    try {
      await update.mutateAsync({
        requestId: request.id,
        status: "delivered",
        items: request.items.map((item) => ({
          requestItemId: item.id,
          deliveredQuantity: values[item.id],
        })),
        ...(finalReason ? { staffNote: finalReason } : {}),
      });
      toast.success("Delivery recorded");
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Delivery failed");
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record delivery — Room {request.roomNumber}</DialogTitle>
        </DialogHeader>
        <div className="min-w-0 space-y-4">
          <div className="space-y-2">
            {request.items.map((item) => (
              <div key={item.id} className="flex items-center justify-between gap-3">
                <Label htmlFor={`qty-${item.id}`} className="flex-1">
                  {item.name}
                  <span className="ml-2 text-xs text-muted-foreground">
                    requested {item.requestedQuantity}
                  </span>
                </Label>
                <Input
                  id={`qty-${item.id}`}
                  type="number"
                  min={0}
                  max={item.requestedQuantity}
                  value={values[item.id]}
                  onChange={(e) =>
                    setValues((v) => ({
                      ...v,
                      [item.id]: Math.max(
                        0,
                        Math.min(item.requestedQuantity, Number(e.target.value) || 0),
                      ),
                    }))
                  }
                  className="w-24"
                />
              </div>
            ))}
          </div>

          {isAnyShort ? (
            <div className="min-w-0 space-y-2 rounded-md border border-border p-3">
              <Label htmlFor="partial-reason">
                Reason (visible to guest) — required
              </Label>
              <Select
                value={preset}
                onValueChange={(value) => setPreset(value ?? AUTO)}
              >
                <SelectTrigger
                  id="partial-reason"
                  className="w-full min-w-0 overflow-hidden"
                >
                  <SelectValue
                    className="min-w-0"
                    placeholder="Choose a reason…"
                  >
                    {(value: string) => {
                      if (!value) return null;
                      const label =
                        value === AUTO
                          ? `Suggested: ${autoReason}`
                          : value === OTHER
                            ? "Write my own…"
                            : value;
                      return (
                        <span className="block truncate">{label}</span>
                      );
                    }}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>Suggested: {autoReason}</SelectItem>
                  <SelectItem value={OTHER}>Write my own…</SelectItem>
                </SelectContent>
              </Select>
              {isOther ? (
                <div className="space-y-1.5">
                  <Textarea
                    id="partial-custom"
                    rows={3}
                    maxLength={500}
                    value={custom}
                    onChange={(e) => setCustom(e.target.value)}
                    placeholder="Explain in your own words…"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground">
                    {custom.length}/500 characters
                  </p>
                </div>
              ) : null}
            </div>
          ) : null}

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save delivery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

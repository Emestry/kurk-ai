import {
  RequestActorType,
  RequestCategory,
  RequestEventType,
  RequestSource,
  RequestStatus,
} from "@/generated/prisma/enums.js";
import { withDbTransaction } from "@/lib/db.js";
import { ApiError } from "@/lib/errors.js";
import { publishRealtimeEvent } from "@/lib/realtime.js";
import {
  finalizeReservations,
  releaseReservations,
  reserveInventory,
} from "@/services/inventory-service.js";
import { parseGuestRequestText } from "@/services/request-parser-service.js";
import {
  findActiveRoomByCredentials,
  getActiveRoomDeviceSession,
} from "@/services/room-service.js";

export interface CreateGuestRequestInput {
  roomAccessToken?: string;
  roomCode?: string;
  roomSessionToken?: string;
  source: "text" | "voice";
  rawText: string;
  items?: Array<{
    inventoryItemId: string;
    quantity: number;
  }>;
}

export interface GuestRequestItemSummary {
  requestItemId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  requestedQuantity: number;
  reservedQuantity: number;
  deliveredQuantity: number;
  unavailableQuantity: number;
  activeReservationId?: string;
  activeReservedQuantity?: number;
}

export interface RequestSummary {
  requestId: string;
  roomId: string;
  roomNumber: string;
  roomDeviceSessionId: string | null;
  status: RequestStatus;
  source: RequestSource;
  category: RequestCategory | null;
  rawText: string;
  normalizedText: string | null;
  guestMessage: string | null;
  staffNote: string | null;
  etaMinutes: number | null;
  etaAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: GuestRequestItemSummary[];
}

export interface UpdateStaffRequestInput {
  requestId: string;
  status?: "received" | "in_progress" | "delivered" | "rejected";
  rejectionReason?: string;
  staffNote?: string;
  etaMinutes?: number | null;
  items?: Array<{
    requestItemId: string;
    deliveredQuantity: number;
  }>;
}

function mapRequestSummary(request: {
  id: string;
  roomId: string;
  room: { number: string };
  roomDeviceSessionId: string | null;
  status: RequestStatus;
  source: RequestSource;
  category: RequestCategory | null;
  rawText: string;
  normalizedText: string | null;
  guestMessage: string | null;
  staffNote: string | null;
  etaMinutes: number | null;
  etaAt: Date | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  items: Array<{
    id: string;
    inventoryItemId: string;
    requestedQuantity: number;
    reservedQuantity: number;
    deliveredQuantity: number;
    unavailableQuantity: number;
    inventoryItem: { name: string };
    reservations?: Array<{ id: string; quantity: number }>;
  }>;
}): RequestSummary {
  return {
    requestId: request.id,
    roomId: request.roomId,
    roomNumber: request.room.number,
    roomDeviceSessionId: request.roomDeviceSessionId,
    status: request.status,
    source: request.source,
    category: request.category,
    rawText: request.rawText,
    normalizedText: request.normalizedText,
    guestMessage: request.guestMessage,
    staffNote: request.staffNote,
    etaMinutes: request.etaMinutes,
    etaAt: request.etaAt,
    rejectionReason: request.rejectionReason,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    items: request.items.map((item) => ({
      requestItemId: item.id,
      inventoryItemId: item.inventoryItemId,
      inventoryItemName: item.inventoryItem.name,
      requestedQuantity: item.requestedQuantity,
      reservedQuantity: item.reservedQuantity,
      deliveredQuantity: item.deliveredQuantity,
      unavailableQuantity: item.unavailableQuantity,
      activeReservationId: item.reservations?.[0]?.id,
      activeReservedQuantity: item.reservations?.[0]?.quantity,
    })),
  };
}

function toRequestSource(source: CreateGuestRequestInput["source"]) {
  return source === "voice" ? RequestSource.voice : RequestSource.text;
}

function validateExplicitItems(items: CreateGuestRequestInput["items"]) {
  if (!items || items.length === 0) {
    throw new ApiError(400, "Guest request must include at least one item");
  }

  const aggregated = new Map<string, number>();

  for (const item of items) {
    if (!item.inventoryItemId) {
      throw new ApiError(400, "Guest request items must reference unique inventory items");
    }

    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ApiError(400, "Guest request item quantity must be a positive integer");
    }

    aggregated.set(
      item.inventoryItemId,
      (aggregated.get(item.inventoryItemId) ?? 0) + item.quantity,
    );
  }

  return [...aggregated.entries()].map(([inventoryItemId, quantity]) => ({
    inventoryItemId,
    quantity,
  }));
}

async function resolveGuestRoom(input: CreateGuestRequestInput) {
  if (input.roomSessionToken) {
    const session = await getActiveRoomDeviceSession(input.roomSessionToken);

    if (!session) {
      throw new ApiError(401, "Unauthorized");
    }

    return {
      room: session.room,
      roomDeviceSessionId: session.id,
    };
  }

  const room = await findActiveRoomByCredentials({
    roomAccessToken: input.roomAccessToken,
    roomCode: input.roomCode,
  });

  if (!room) {
    throw new ApiError(401, "Room not found");
  }

  return {
    room,
    roomDeviceSessionId: null,
  };
}

function toRealtimeType(status: RequestStatus) {
  if (status === RequestStatus.rejected) {
    return "request.rejected" as const;
  }

  if (
    status === RequestStatus.delivered ||
    status === RequestStatus.partially_delivered
  ) {
    return "request.delivered" as const;
  }

  return "request.updated" as const;
}

/**
 * Creates a guest request, parses inventory items when needed, and reserves stock atomically.
 */
export async function createGuestRequest(input: CreateGuestRequestInput) {
  const resolved = await resolveGuestRoom(input);
  const parsed =
    input.items && input.items.length > 0
      ? {
          normalizedText: input.rawText.trim(),
          category: null,
          items: validateExplicitItems(input.items),
        }
      : await parseGuestRequestText(input.rawText);

  const result = await withDbTransaction(async (db) => {
    const request = await db.guestRequest.create({
      data: {
        roomId: resolved.room.id,
        roomDeviceSessionId: resolved.roomDeviceSessionId,
        source: toRequestSource(input.source),
        rawText: input.rawText.trim(),
        normalizedText: parsed.normalizedText,
        category: parsed.category ?? undefined,
        guestMessage: "Done. We've let the front desk know.",
        items: {
          create: parsed.items.map((item) => ({
            inventoryItemId: item.inventoryItemId,
            requestedQuantity: item.quantity,
          })),
        },
      },
      include: {
        room: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
          },
        },
      },
    });

    try {
      await reserveInventory(
        db,
        request.items.map((item) => ({
          inventoryItemId: item.inventoryItemId,
          quantity: item.requestedQuantity,
          requestId: request.id,
          requestItemId: item.id,
        })),
      );
    } catch (error) {
      if (error instanceof ApiError && error.statusCode === 422) {
        const rejected = await db.guestRequest.update({
          where: { id: request.id },
          data: {
            status: RequestStatus.rejected,
            rejectionReason: error.message,
            guestMessage: error.message,
          },
          include: {
            room: true,
            items: {
              orderBy: { createdAt: "asc" },
              include: {
                inventoryItem: true,
                reservations: {
                  where: { status: "active" },
                  orderBy: { createdAt: "asc" },
                },
              },
            },
          },
        });

        await db.requestEvent.createMany({
          data: [
            {
              requestId: rejected.id,
              roomId: rejected.roomId,
              type: RequestEventType.created,
              actorType: RequestActorType.guest,
              payload: {
                source: input.source,
              },
            },
            {
              requestId: rejected.id,
              roomId: rejected.roomId,
              type: RequestEventType.rejected,
              actorType: RequestActorType.system,
              payload: {
                reason: error.message,
              },
            },
          ],
        });

        return mapRequestSummary(rejected);
      }

      throw error;
    }

    const created = await db.guestRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: {
        room: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reservations: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    await db.requestEvent.create({
      data: {
        requestId: created.id,
        roomId: created.roomId,
        type: RequestEventType.created,
        actorType: RequestActorType.guest,
        payload: {
          source: input.source,
          category: created.category,
        },
      },
    });

    return mapRequestSummary(created);
  });

  publishRealtimeEvent({
    type: result.status === RequestStatus.rejected ? "request.rejected" : "request.created",
    requestId: result.requestId,
    roomId: result.roomId,
    status: result.status,
    occurredAt: new Date().toISOString(),
    data: {
      roomNumber: result.roomNumber,
      category: result.category,
      guestMessage: result.guestMessage,
      rejectionReason: result.rejectionReason,
    },
  });

  if (result.status === RequestStatus.rejected) {
    throw new ApiError(422, result.rejectionReason ?? "Request cannot be fulfilled");
  }

  return result;
}

/**
 * Lists staff-visible requests including active reservations.
 */
export async function listStaffRequests() {
  const requests = await withDbTransaction((db) =>
    db.guestRequest.findMany({
      orderBy: [{ createdAt: "desc" }],
      include: {
        room: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reservations: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    }),
  );

  return requests.map((request) => mapRequestSummary(request));
}

/**
 * Returns the latest active request for a room.
 */
export async function getCurrentGuestRequest(input: {
  roomAccessToken?: string;
  roomCode?: string;
  roomSessionToken?: string;
}) {
  const resolved = input.roomSessionToken
    ? await getActiveRoomDeviceSession(input.roomSessionToken)
    : null;

  const room =
    resolved?.room ??
    await findActiveRoomByCredentials({
      roomAccessToken: input.roomAccessToken,
      roomCode: input.roomCode,
    });

  if (!room) {
    throw new ApiError(401, "Room not found");
  }

  const request = await withDbTransaction((db) =>
    db.guestRequest.findFirst({
      where: {
        roomId: room.id,
        status: {
          in: [
            RequestStatus.received,
            RequestStatus.in_progress,
            RequestStatus.partially_delivered,
          ],
        },
      },
      orderBy: [{ createdAt: "desc" }],
      include: {
        room: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
          },
        },
      },
    }),
  );

  return {
    roomId: room.id,
    roomNumber: room.number,
    request: request ? mapRequestSummary(request) : null,
  };
}

/**
 * Lists room-scoped request history for reconnecting guest tablets.
 */
export async function listGuestRequestHistory(input: {
  roomAccessToken?: string;
  roomCode?: string;
  roomSessionToken?: string;
  limit?: number;
}) {
  const resolved = input.roomSessionToken
    ? await getActiveRoomDeviceSession(input.roomSessionToken)
    : null;

  const room =
    resolved?.room ??
    await findActiveRoomByCredentials({
      roomAccessToken: input.roomAccessToken,
      roomCode: input.roomCode,
    });

  if (!room) {
    throw new ApiError(401, "Room not found");
  }

  const limit =
    input.limit && Number.isInteger(input.limit) && input.limit > 0
      ? Math.min(input.limit, 20)
      : 10;

  const requests = await withDbTransaction((db) =>
    db.guestRequest.findMany({
      where: { roomId: room.id },
      orderBy: [{ createdAt: "desc" }],
      take: limit,
      include: {
        room: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
          },
        },
      },
    }),
  );

  return {
    roomId: room.id,
    roomNumber: room.number,
    requests: requests.map((request) => mapRequestSummary(request)),
  };
}

/**
 * Updates staff-controlled request state, notes, ETA, and final delivery quantities.
 */
export async function updateStaffRequest(input: UpdateStaffRequestInput) {
  const result = await withDbTransaction(async (db) => {
    const request = await db.guestRequest.findUnique({
      where: { id: input.requestId },
      include: {
        room: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reservations: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    if (!request) {
      throw new ApiError(404, "Request not found");
    }

    if (input.etaMinutes !== undefined) {
      if (input.etaMinutes !== null && (!Number.isInteger(input.etaMinutes) || input.etaMinutes < 0)) {
        throw new ApiError(400, "ETA must be a non-negative integer");
      }

      const etaAt =
        input.etaMinutes === null
          ? null
          : new Date(Date.now() + input.etaMinutes * 60_000);

      await db.guestRequest.update({
        where: { id: request.id },
        data: {
          etaMinutes: input.etaMinutes,
          etaAt,
        },
      });

      await db.requestEvent.create({
        data: {
          requestId: request.id,
          roomId: request.roomId,
          type: RequestEventType.eta_set,
          actorType: RequestActorType.staff,
          payload: {
            etaMinutes: input.etaMinutes,
            etaAt: etaAt?.toISOString() ?? null,
          },
        },
      });
    }

    if (input.staffNote !== undefined) {
      await db.guestRequest.update({
        where: { id: request.id },
        data: {
          staffNote: input.staffNote?.trim() || null,
        },
      });

      await db.requestEvent.create({
        data: {
          requestId: request.id,
          roomId: request.roomId,
          type: RequestEventType.note_added,
          actorType: RequestActorType.staff,
          payload: {
            staffNote: input.staffNote?.trim() || null,
          },
        },
      });
    }

    if (!input.status) {
      const unchanged = await db.guestRequest.findUniqueOrThrow({
        where: { id: request.id },
        include: {
          room: true,
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              inventoryItem: true,
              reservations: {
                where: { status: "active" },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      });

      return mapRequestSummary(unchanged);
    }

    if (input.status === "received" || input.status === "in_progress") {
      if (
        (input.status === "received" && request.status !== RequestStatus.in_progress) ||
        (input.status === "in_progress" && request.status !== RequestStatus.received)
      ) {
        throw new ApiError(409, "Invalid request status transition");
      }

      const updated = await db.guestRequest.update({
        where: { id: request.id },
        data: { status: input.status },
        include: {
          room: true,
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              inventoryItem: true,
              reservations: {
                where: { status: "active" },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      });

      await db.requestEvent.create({
        data: {
          requestId: request.id,
          roomId: request.roomId,
          type: RequestEventType.status_changed,
          actorType: RequestActorType.staff,
          payload: { status: updated.status },
        },
      });

      return mapRequestSummary(updated);
    }

    if (input.status === "rejected") {
      if (
        request.status !== RequestStatus.received &&
        request.status !== RequestStatus.in_progress
      ) {
        throw new ApiError(409, "Invalid request status transition");
      }

      if (!input.rejectionReason?.trim()) {
        throw new ApiError(400, "Rejected status requires a rejection reason");
      }

      const reservationIds = request.items.flatMap((item) =>
        item.reservations.map((reservation) => reservation.id),
      );

      if (reservationIds.length > 0) {
        await releaseReservations(db, reservationIds, input.rejectionReason.trim());
      }

      const updated = await db.guestRequest.update({
        where: { id: request.id },
        data: {
          status: RequestStatus.rejected,
          rejectionReason: input.rejectionReason.trim(),
          guestMessage: input.rejectionReason.trim(),
        },
        include: {
          room: true,
          items: {
            orderBy: { createdAt: "asc" },
            include: {
              inventoryItem: true,
              reservations: {
                where: { status: "active" },
                orderBy: { createdAt: "asc" },
              },
            },
          },
        },
      });

      await db.requestEvent.create({
        data: {
          requestId: request.id,
          roomId: request.roomId,
          type: RequestEventType.rejected,
          actorType: RequestActorType.staff,
          payload: {
            reason: input.rejectionReason.trim(),
          },
        },
      });

      return mapRequestSummary(updated);
    }

    if (request.status !== RequestStatus.in_progress) {
      throw new ApiError(409, "Invalid request status transition");
    }

    if (!input.items || input.items.length === 0) {
      throw new ApiError(400, "Delivered status requires at least one delivered item");
    }

    const itemMap = new Map(request.items.map((item) => [item.id, item]));
    const finalizeInputs: Array<{ reservationId: string; deliveredQuantity?: number }> = [];

    for (const itemInput of input.items) {
      const requestItem = itemMap.get(itemInput.requestItemId);

      if (!requestItem) {
        throw new ApiError(400, "Invalid request status transition");
      }

      const reservation = requestItem.reservations[0];

      if (!reservation) {
        throw new ApiError(400, "Invalid request status transition");
      }

      if (itemInput.deliveredQuantity > requestItem.requestedQuantity) {
        throw new ApiError(422, "Delivered quantity cannot exceed requested quantity");
      }

      finalizeInputs.push({
        reservationId: reservation.id,
        deliveredQuantity: itemInput.deliveredQuantity,
      });
    }

    await finalizeReservations(db, finalizeInputs, "Staff delivery update");

    const refreshed = await db.guestRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: {
        room: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reservations: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    const totalDelivered = refreshed.items.reduce(
      (sum, item) => sum + item.deliveredQuantity,
      0,
    );
    const isPartial = refreshed.items.some(
      (item) => item.deliveredQuantity < item.requestedQuantity,
    );
    const nextStatus =
      totalDelivered === 0
        ? RequestStatus.rejected
        : isPartial
          ? RequestStatus.partially_delivered
          : RequestStatus.delivered;

    const updated = await db.guestRequest.update({
      where: { id: request.id },
      data: {
        status: nextStatus,
        guestMessage:
          nextStatus === RequestStatus.delivered
            ? "Done! Enjoy the rest of your stay."
            : nextStatus === RequestStatus.partially_delivered
              ? "Part of your request has been delivered."
              : request.guestMessage,
      },
      include: {
        room: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reservations: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    await db.requestEvent.create({
      data: {
        requestId: request.id,
        roomId: request.roomId,
        type:
          nextStatus === RequestStatus.partially_delivered
            ? RequestEventType.partially_delivered
            : RequestEventType.delivered,
        actorType: RequestActorType.staff,
        payload: {
          status: nextStatus,
        },
      },
    });

    return mapRequestSummary(updated);
  });

  publishRealtimeEvent({
    type: toRealtimeType(result.status),
    requestId: result.requestId,
    roomId: result.roomId,
    status: result.status,
    occurredAt: new Date().toISOString(),
    data: {
      roomNumber: result.roomNumber,
      guestMessage: result.guestMessage,
      staffNote: result.staffNote,
      etaMinutes: result.etaMinutes,
      rejectionReason: result.rejectionReason,
      category: result.category,
    },
  });

  return result;
}

/**
 * Pushes the ETA deadline out by `minutes` from whichever is later: the
 * current deadline or now. Used for the staff "+5 min" button.
 */
export async function extendStaffRequestEta(input: {
  requestId: string;
  minutes: number;
}) {
  if (!Number.isInteger(input.minutes) || input.minutes <= 0) {
    throw new ApiError(400, "Minutes must be a positive integer");
  }

  const result = await withDbTransaction(async (db) => {
    const request = await db.guestRequest.findUnique({
      where: { id: input.requestId },
    });

    if (!request) {
      throw new ApiError(404, "Request not found");
    }

    const now = new Date();
    const base = request.etaAt && request.etaAt > now ? request.etaAt : now;
    const etaAt = new Date(base.getTime() + input.minutes * 60_000);
    const etaMinutes = Math.max(
      0,
      Math.ceil((etaAt.getTime() - now.getTime()) / 60_000),
    );

    await db.guestRequest.update({
      where: { id: request.id },
      data: { etaAt, etaMinutes },
    });

    await db.requestEvent.create({
      data: {
        requestId: request.id,
        roomId: request.roomId,
        type: RequestEventType.eta_set,
        actorType: RequestActorType.staff,
        payload: {
          etaMinutes,
          etaAt: etaAt.toISOString(),
          extendedBy: input.minutes,
        },
      },
    });

    const updated = await db.guestRequest.findUniqueOrThrow({
      where: { id: request.id },
      include: {
        room: true,
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            inventoryItem: true,
            reservations: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
    });

    return mapRequestSummary(updated);
  });

  publishRealtimeEvent({
    type: toRealtimeType(result.status),
    requestId: result.requestId,
    roomId: result.roomId,
    status: result.status,
    occurredAt: new Date().toISOString(),
    data: {
      roomNumber: result.roomNumber,
      guestMessage: result.guestMessage,
      staffNote: result.staffNote,
      etaMinutes: result.etaMinutes,
      rejectionReason: result.rejectionReason,
      category: result.category,
    },
  });

  return result;
}

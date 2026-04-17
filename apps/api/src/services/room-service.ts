import { randomUUID } from "node:crypto";
import {
  RequestActorType,
  RequestEventType,
  RequestStatus,
} from "@/generated/prisma/enums.js";
import type { DbClient } from "@/lib/db.js";
import { withDbTransaction } from "@/lib/db.js";
import { ApiError } from "@/lib/errors.js";
import { requireStoredText } from "@/lib/input.js";
import { publishRealtimeEvent } from "@/lib/realtime.js";
import { releaseReservations } from "@/services/inventory-service.js";

export interface ActiveRoomLookup {
  db?: DbClient;
  roomAccessToken?: string;
  roomCode?: string;
}

/**
 * Finds an active room by its bootstrap credentials.
 */
export async function findActiveRoomByCredentials(input: ActiveRoomLookup) {
  const roomLookup: Array<{ accessToken: string } | { code: string }> = [];

  if (input.roomAccessToken) {
    roomLookup.push({ accessToken: input.roomAccessToken });
  }

  if (input.roomCode) {
    roomLookup.push({ code: input.roomCode });
  }

  if (roomLookup.length === 0) {
    return null;
  }

  const query = (db: DbClient) =>
    db.room.findFirst({
      where: {
        isActive: true,
        OR: roomLookup,
      },
    });

  if (input.db) {
    return query(input.db);
  }

  return withDbTransaction(query);
}

/**
 * Creates or refreshes a revocable room tablet session for a configured device.
 */
export async function createRoomDeviceSession(input: {
  roomCode: string;
  pairingCode: string;
  deviceFingerprint: string;
  deviceName?: string;
  ttlHours?: number;
}) {
  const roomCode = requireStoredText(input.roomCode, "Room code");
  const pairingCode = requireStoredText(input.pairingCode, "Pairing code");
  const now = new Date();

  const { session, revokedSessions } = await withDbTransaction(async (db) => {
    const room = await db.room.findUnique({
      where: { code: roomCode },
      include: {
        devices: {
          where: { isActive: true },
        },
        deviceSessions: {
          where: {
            revokedAt: null,
            expiresAt: { gt: now },
          },
        },
      },
    });

    if (!room || !room.isActive) {
      throw new ApiError(401, "Room not found");
    }

    // Pairing-code gate: staff must issue a short-lived code from the dashboard
    // before a new tablet can claim the room. Without a valid code the real
    // tablet's existing session stays untouched.
    const submittedCode = pairingCode;
    if (
      !room.pairingCode ||
      !room.pairingCodeExpiresAt ||
      room.pairingCodeExpiresAt <= now ||
      room.pairingCode !== submittedCode
    ) {
      throw new ApiError(401, "Invalid or expired pairing code");
    }

    const deviceName = input.deviceName
      ? requireStoredText(input.deviceName, "Device name")
      : `Room ${room.number} Tablet`;

    let device = room.devices.find(
      (entry) => entry.deviceFingerprint === input.deviceFingerprint,
    );

    // If this fingerprint already exists on a different room, the tablet is
    // being physically moved. Reassign it to this room and mark its prior
    // active sessions for revoke (so the old room's SSE stream drops).
    const crossRoomActiveSessions: { id: string; roomId: string; roomDeviceId: string }[] = [];
    if (!device) {
      const globalExisting = await db.roomDevice.findUnique({
        where: { deviceFingerprint: input.deviceFingerprint },
      });

      if (globalExisting && globalExisting.roomId !== room.id) {
        const oldSessions = await db.roomDeviceSession.findMany({
          where: { roomDeviceId: globalExisting.id, revokedAt: null },
          select: { id: true, roomId: true, roomDeviceId: true },
        });
        crossRoomActiveSessions.push(...oldSessions);

        if (oldSessions.length > 0) {
          await db.roomDeviceSession.updateMany({
            where: { id: { in: oldSessions.map((s) => s.id) } },
            data: { revokedAt: now },
          });
        }

        device = await db.roomDevice.update({
          where: { id: globalExisting.id },
          data: {
            roomId: room.id,
            name: deviceName,
            isActive: true,
            lastSeenAt: now,
          },
        });
      }
    }

    // If still no match, try to promote an unused legacy placeholder; otherwise
    // create a brand-new device row.
    if (!device) {
      const placeholderFingerprint = `tablet-${room.number}`;
      const placeholder = room.devices.find(
        (entry) => entry.deviceFingerprint === placeholderFingerprint,
      );
      const placeholderSessionCount = placeholder
        ? await db.roomDeviceSession.count({
            where: { roomDeviceId: placeholder.id },
          })
        : 0;

      if (placeholder && placeholderSessionCount === 0) {
        device = await db.roomDevice.update({
          where: { id: placeholder.id },
          data: {
            name: deviceName,
            deviceFingerprint: input.deviceFingerprint,
            isActive: true,
            lastSeenAt: now,
          },
        });
      } else {
        device = await db.roomDevice.create({
          data: {
            roomId: room.id,
            name: deviceName,
            deviceFingerprint: input.deviceFingerprint,
            lastSeenAt: now,
          },
        });
      }
    }

    if (!device.isActive) {
      throw new ApiError(403, "Room device is inactive");
    }

    await db.roomDevice.update({
      where: { id: device.id },
      data: {
        name: deviceName,
        lastSeenAt: new Date(),
      },
    });

    // Enforce a single live session per room: any other active session on this
    // room gets revoked in the same transaction so exactly one tablet is
    // connected at a time.
    const toRevoke = room.deviceSessions.filter(
      (s) => s.roomDeviceId !== device.id || s.revokedAt !== null,
    );
    if (toRevoke.length > 0) {
      await db.roomDeviceSession.updateMany({
        where: { id: { in: toRevoke.map((s) => s.id) } },
        data: { revokedAt: now },
      });
    }

    // Consume the pairing code so it cannot be reused.
    await db.room.update({
      where: { id: room.id },
      data: {
        pairingCode: null,
        pairingCodeExpiresAt: null,
      },
    });

    const token = randomUUID();
    const ttlHours = input.ttlHours ?? 24 * 30;
    const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000);

    const created = await db.roomDeviceSession.create({
      data: {
        roomId: room.id,
        roomDeviceId: device.id,
        token,
        expiresAt,
      },
      include: {
        room: true,
        roomDevice: true,
      },
    });

    return {
      session: created,
      revokedSessions: [...toRevoke, ...crossRoomActiveSessions],
    };
  });

  // Publish revoke events for every previously-active session we just killed,
  // so the old tablets drop their SSE streams (same mechanism as the dashboard
  // Revoke button).
  for (const revoked of revokedSessions) {
    publishRealtimeEvent({
      type: "room.session.revoked",
      requestId: "",
      roomId: revoked.roomId,
      occurredAt: new Date().toISOString(),
      data: {
        sessionId: revoked.id,
        roomDeviceId: revoked.roomDeviceId,
        roomId: revoked.roomId,
      },
    });
  }

  // Announce the new pairing so the dashboard can flip the room card to
  // Connected without waiting for a manual refresh.
  publishRealtimeEvent({
    type: "room.session.created",
    requestId: "",
    roomId: session.room.id,
    occurredAt: new Date().toISOString(),
    data: {
      sessionId: session.id,
      roomId: session.room.id,
      roomDeviceId: session.roomDeviceId,
    },
  });

  return {
    sessionId: session.id,
    token: session.token,
    expiresAt: session.expiresAt,
    roomId: session.room.id,
    roomNumber: session.room.number,
    deviceId: session.roomDeviceId,
    deviceName: session.roomDevice.name,
  };
}

/**
 * Issues a one-time 6-digit pairing code for a room. The code is stored on
 * the room itself and consumed atomically when the next tablet pairs.
 */
export async function issueRoomPairingCode(
  roomId: string,
  options: { ttlSeconds?: number } = {},
) {
  const ttlSeconds = options.ttlSeconds ?? 600;
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  const room = await withDbTransaction(async (db) => {
    const existing = await db.room.findUnique({ where: { id: roomId } });

    if (!existing || !existing.isActive) {
      throw new ApiError(404, "Room not found");
    }

    return db.room.update({
      where: { id: roomId },
      data: {
        pairingCode: code,
        pairingCodeExpiresAt: expiresAt,
      },
    });
  });

  return {
    roomId: room.id,
    pairingCode: code,
    expiresAt,
  };
}

/**
 * Clears an active room pairing code so an accidentally-issued tablet code
 * cannot be redeemed.
 */
export async function revokeRoomPairingCode(roomId: string) {
  const room = await withDbTransaction(async (db) => {
    const existing = await db.room.findUnique({ where: { id: roomId } });

    if (!existing || !existing.isActive) {
      throw new ApiError(404, "Room not found");
    }

    return db.room.update({
      where: { id: roomId },
      data: {
        pairingCode: null,
        pairingCodeExpiresAt: null,
      },
    });
  });

  return {
    roomId: room.id,
    pairingCode: room.pairingCode,
    expiresAt: room.pairingCodeExpiresAt,
  };
}

/**
 * Resolves an active room device session token into a usable guest tablet session.
 */
export async function getActiveRoomDeviceSession(token?: string) {
  if (!token?.trim()) {
    return null;
  }

  return withDbTransaction((db) =>
    db.roomDeviceSession.findFirst({
      where: {
        token: token.trim(),
        revokedAt: null,
        expiresAt: {
          gt: new Date(),
        },
        room: {
          isActive: true,
        },
        roomDevice: {
          isActive: true,
        },
      },
      include: {
        room: true,
        roomDevice: true,
      },
    }),
  );
}

/**
 * Revokes a room device session so future guest requests from that tablet are rejected.
 */
export async function revokeRoomDeviceSession(sessionId: string) {
  const result = await withDbTransaction(async (db) => {
    const session = await db.roomDeviceSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new ApiError(404, "Room device session not found");
    }

    const revoked = await db.roomDeviceSession.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
      },
      include: {
        room: true,
        roomDevice: true,
      },
    });

    const activeRequests = await db.guestRequest.findMany({
      where: {
        roomId: revoked.roomId,
        status: {
          in: [RequestStatus.received, RequestStatus.in_progress],
        },
      },
      include: {
        items: {
          orderBy: { createdAt: "asc" },
          include: {
            reservations: {
              where: { status: "active" },
              orderBy: { createdAt: "asc" },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const rejectionReason = "Room session was revoked before the request was completed.";

    for (const request of activeRequests) {
      const reservationIds = request.items.flatMap((item) =>
        item.reservations.map((reservation) => reservation.id),
      );

      if (reservationIds.length > 0) {
        await releaseReservations(db, reservationIds, rejectionReason);
      }

      await db.guestRequest.update({
        where: { id: request.id },
        data: {
          status: RequestStatus.rejected,
          rejectionReason,
          guestMessage: rejectionReason,
          etaMinutes: null,
          etaAt: null,
        },
      });

      await db.requestEvent.create({
        data: {
          requestId: request.id,
          roomId: request.roomId,
          type: RequestEventType.rejected,
          actorType: RequestActorType.system,
          payload: {
            reason: rejectionReason,
            source: "room_session_revoked",
          },
        },
      });
    }

    return {
      revoked,
      rejectedRequests: activeRequests.map((request) => ({
        requestId: request.id,
        roomId: request.roomId,
        roomNumber: revoked.room.number,
        rejectionReason,
      })),
    };
  });

  // Push a live event so any open SSE stream tied to this session can close
  // immediately instead of waiting for the client to reconnect and be rejected.
  publishRealtimeEvent({
    type: "room.session.revoked",
    requestId: "",
    roomId: result.revoked.roomId,
    occurredAt: new Date().toISOString(),
    data: {
      sessionId: result.revoked.id,
      roomDeviceId: result.revoked.roomDeviceId,
      roomId: result.revoked.roomId,
    },
  });

  for (const request of result.rejectedRequests) {
    publishRealtimeEvent({
      type: "request.rejected",
      requestId: request.requestId,
      roomId: request.roomId,
      status: RequestStatus.rejected,
      occurredAt: new Date().toISOString(),
      data: {
        roomNumber: request.roomNumber,
        rejectionReason: request.rejectionReason,
        guestMessage: request.rejectionReason,
        source: "room_session_revoked",
      },
    });
  }

  return result.revoked;
}

/**
 * Lists rooms together with their currently-connected devices. A device is
 * considered connected when at least one of its sessions is still active
 * (`revokedAt: null` and `expiresAt` in the future). Devices whose sessions
 * have all been revoked or expired are hidden from the admin view so the
 * counter reflects what staff actually cares about.
 */
export async function listRoomsWithDevices() {
  const now = new Date();

  return withDbTransaction((db) =>
    db.room.findMany({
      orderBy: { number: "asc" },
      include: {
        devices: {
          where: {
            isActive: true,
            sessions: {
              some: {
                revokedAt: null,
                expiresAt: { gt: now },
              },
            },
          },
          orderBy: { createdAt: "asc" },
          include: {
            sessions: {
              where: {
                revokedAt: null,
                expiresAt: { gt: now },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    }),
  );
}

export async function updateRoom(
  roomId: string,
  input: {
    number?: string;
    code?: string;
    accessToken?: string;
    isActive?: boolean;
  },
) {
  return withDbTransaction(async (db) => {
    const room = await db.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new ApiError(404, "Room not found");
    }

    return db.room.update({
      where: { id: roomId },
      data: {
        ...(input.number !== undefined
          ? { number: requireStoredText(input.number, "Room number") }
          : {}),
        ...(input.code !== undefined
          ? { code: requireStoredText(input.code, "Room code") }
          : {}),
        ...(input.accessToken !== undefined
          ? { accessToken: requireStoredText(input.accessToken, "Room access token") }
          : {}),
        isActive: input.isActive,
      },
      include: {
        devices: {
          orderBy: { createdAt: "asc" },
          include: {
            sessions: {
              where: {
                revokedAt: null,
                expiresAt: {
                  gt: new Date(),
                },
              },
              orderBy: { createdAt: "desc" },
            },
          },
        },
      },
    });
  });
}

export async function createRoomDevice(
  roomId: string,
  input: {
    name: string;
    deviceFingerprint: string;
    isActive?: boolean;
  },
) {
  return withDbTransaction(async (db) => {
    const room = await db.room.findUnique({
      where: { id: roomId },
    });

    if (!room) {
      throw new ApiError(404, "Room not found");
    }

    return db.roomDevice.create({
      data: {
        roomId,
        name: requireStoredText(input.name, "Device name"),
        deviceFingerprint: requireStoredText(input.deviceFingerprint, "Device fingerprint"),
        isActive: input.isActive ?? true,
        lastSeenAt: null,
      },
    });
  });
}

export async function updateRoomDevice(
  roomId: string,
  deviceId: string,
  input: {
    name?: string;
    isActive?: boolean;
  },
) {
  return withDbTransaction(async (db) => {
    const device = await db.roomDevice.findFirst({
      where: {
        id: deviceId,
        roomId,
      },
    });

    if (!device) {
      throw new ApiError(404, "Room device not found");
    }

    return db.roomDevice.update({
      where: { id: device.id },
      data: {
        ...(input.name !== undefined
          ? { name: requireStoredText(input.name, "Device name") }
          : {}),
        isActive: input.isActive,
      },
    });
  });
}

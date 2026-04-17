import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { jsonError } from "@/lib/http.js";
import { requireCuid, requireStoredText } from "@/lib/input.js";
import { subscribeToRealtimeEvents } from "@/lib/realtime.js";
import { roomDeviceAuthMiddleware } from "@/middlewares/room-device-auth.js";
import {
  checkInventoryAvailability,
  listInventoryItems,
} from "@/services/inventory-service.js";
import {
  createGuestRequest,
  getCurrentGuestRequest,
  listGuestRequestHistory,
  type CreateGuestRequestInput,
} from "@/services/request-service.js";
import { understandGuestRequest } from "@/services/request-understanding-service.js";
import {
  createRoomDeviceSession,
  findActiveRoomByCredentials,
  getActiveRoomDeviceSession,
  revokeRoomDeviceSession,
} from "@/services/room-service.js";
import { transcribeGuestAudio } from "@/services/transcription-service.js";
import { createRealtimeTranscriptionSession } from "@/services/realtime-transcription-service.js";
import {
  translateGuestTexts,
  type TranslationLanguageCode,
} from "@/services/translation-service.js";

interface CreateGuestRequestBody {
  roomCode?: string;
  source?: string;
  rawText?: string;
  items?: Array<{
    inventoryItemId?: string;
    quantity?: number;
  }>;
  allowPartial?: boolean;
}

interface PreviewGuestRequestBody {
  items?: Array<{
    inventoryItemId?: string;
    quantity?: number;
  }>;
}

interface CreateRoomDeviceSessionBody {
  roomCode?: string;
  pairingCode?: string;
  deviceFingerprint?: string;
  deviceName?: string;
}

interface ParseGuestRequestBody {
  rawText?: string;
}

interface TranslateGuestTextsBody {
  texts?: string[];
  language?: string;
}

function isRequestSource(value: string): value is CreateGuestRequestInput["source"] {
  return value === "text" || value === "voice";
}

function parseRequestBody(body: CreateGuestRequestBody): CreateGuestRequestInput | null {
  if (!body.rawText || typeof body.rawText !== "string") {
    return null;
  }

  if (!body.source || typeof body.source !== "string" || !isRequestSource(body.source)) {
    return null;
  }

  const items = Array.isArray(body.items)
    ? body.items.map((item) => ({
        inventoryItemId: item.inventoryItemId?.trim() ?? "",
        quantity: item.quantity ?? 0,
      }))
    : undefined;

  if (
    items &&
    items.some(
      (item) =>
        !item.inventoryItemId || !Number.isInteger(item.quantity) || item.quantity <= 0,
    )
  ) {
    return null;
  }

  return {
    roomCode: body.roomCode?.trim(),
    source: body.source,
    rawText: body.rawText.trim(),
    items,
    allowPartial: body.allowPartial === true,
  };
}

export const guest = new Hono();

guest.post("/device-sessions", async (c) => {
  const body = await c.req.json<CreateRoomDeviceSessionBody>();

  if (!body.roomCode?.trim() || !body.deviceFingerprint?.trim()) {
    return jsonError(c, 400, "Room code and device fingerprint are required");
  }

  if (!body.pairingCode?.trim()) {
    return jsonError(c, 400, "Pairing code is required");
  }

  const session = await createRoomDeviceSession({
    roomCode: requireStoredText(body.roomCode, "Room code"),
    pairingCode: requireStoredText(body.pairingCode, "Pairing code"),
    deviceFingerprint: requireStoredText(body.deviceFingerprint, "Device fingerprint"),
    deviceName: body.deviceName ? requireStoredText(body.deviceName, "Device name") : undefined,
  });

  return c.json(session, 201);
});

guest.post("/transcribe", async (c) => {
  const formData = await c.req.formData();
  const audio = formData.get("audio");

  if (!(audio instanceof File)) {
    return jsonError(c, 400, "Audio file is required");
  }

  const result = await transcribeGuestAudio(audio);
  return c.json(result, 201);
});

guest.post("/realtime-transcription-session", async (c) => {
  const offerSdp = await c.req.text();

  if (!offerSdp.trim()) {
    return jsonError(c, 400, "SDP offer is required");
  }

  const answerSdp = await createRealtimeTranscriptionSession(offerSdp);
  c.header("Content-Type", "application/sdp");
  return c.body(answerSdp);
});

guest.post("/parse-request", async (c) => {
  const body = await c.req.json<ParseGuestRequestBody>();

  if (!body.rawText?.trim()) {
    return jsonError(c, 400, "Request text is required");
  }

  const parsed = await understandGuestRequest(body.rawText);
  return c.json({
    items: parsed.items.map((item) => ({
      inventory_item_id: item.inventoryItemId,
      name: item.inventoryItemName,
      quantity: item.quantity,
    })),
    category: parsed.category,
    clarification: parsed.clarification
      ? {
          prompt: parsed.clarification.prompt,
          options: parsed.clarification.options.map((item) => ({
            inventory_item_id: item.inventoryItemId,
            name: item.inventoryItemName,
            quantity: item.quantity,
          })),
        }
      : undefined,
  });
});

guest.post("/translate", async (c) => {
  const body = await c.req.json<TranslateGuestTextsBody>();

  if (
    !Array.isArray(body.texts) ||
    body.texts.some((text) => typeof text !== "string" || !text.trim())
  ) {
    return jsonError(c, 400, "Texts are required");
  }

  if (
    body.language !== "en" &&
    body.language !== "et" &&
    body.language !== "es" &&
    body.language !== "fr" &&
    body.language !== "ru" &&
    body.language !== "de"
  ) {
    return jsonError(c, 400, "Supported language is required");
  }

  const translations = await translateGuestTexts(
    body.texts,
    body.language as TranslationLanguageCode,
  );

  return c.json({ translations });
});

guest.get("/inventory/catalog", async (c) => {
  const items = await listInventoryItems();
  return c.json({ items });
});

guest.get("/requests/current", async (c) => {
  const roomSessionToken = c.req.header("x-room-session-token")?.trim();
  const roomToken = c.req.header("x-room-token")?.trim();
  const roomCode = c.req.query("roomCode")?.trim();

  if (!roomSessionToken && !roomToken && !roomCode) {
    return jsonError(c, 401, "Room credentials are required");
  }

  const payload = await getCurrentGuestRequest({
    roomSessionToken,
    roomAccessToken: roomToken,
    roomCode,
  });

  return c.json(payload);
});

guest.get("/requests/history", async (c) => {
  const roomSessionToken = c.req.header("x-room-session-token")?.trim();
  const roomToken = c.req.header("x-room-token")?.trim();
  const roomCode = c.req.query("roomCode")?.trim();

  if (!roomSessionToken && !roomToken && !roomCode) {
    return jsonError(c, 401, "Room credentials are required");
  }

  const rawLimit = c.req.query("limit");
  const limit = rawLimit ? Number(rawLimit) : undefined;
  const payload = await listGuestRequestHistory({
    roomSessionToken,
    roomAccessToken: roomToken,
    roomCode,
    limit,
  });

  return c.json(payload);
});

guest.get("/events", async (c) => {
  const roomSessionToken =
    c.req.header("x-room-session-token")?.trim() ??
    c.req.query("roomSessionToken")?.trim();
  const roomToken = c.req.header("x-room-token")?.trim();
  const roomCode = c.req.query("roomCode")?.trim();

  const roomSession = roomSessionToken
    ? await getActiveRoomDeviceSession(roomSessionToken)
    : null;
  const room =
    roomSession?.room ??
    await findActiveRoomByCredentials({
      roomAccessToken: roomToken,
      roomCode,
    });

  if (!room) {
    return jsonError(c, 401, "Room not found");
  }

  return streamSSE(c, async (stream) => {
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ roomId: room.id, roomNumber: room.number }),
    });

    await new Promise<void>((resolve) => {
      const unsubscribe = subscribeToRealtimeEvents(
        (event) => event.roomId === room.id,
        (event) => {
          void stream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });

          // If staff revokes this specific session from /rooms, close the
          // stream immediately so the tablet drops its connection instead of
          // silently lingering until the next reconnect.
          if (
            event.type === "room.session.revoked" &&
            roomSession &&
            event.data?.sessionId === roomSession.id
          ) {
            unsubscribe();
            resolve();
          }
        },
      );

      const abort = () => {
        unsubscribe();
        resolve();
      };

      c.req.raw.signal.addEventListener("abort", abort, { once: true });
    });
  });
});

guest.post("/requests/preview", async (c) => {
  const body = await c.req.json<PreviewGuestRequestBody>();
  const rawItems = Array.isArray(body?.items) ? body.items : [];
  const inputs = rawItems
    .map((item) => ({
      inventoryItemId: item.inventoryItemId
        ? requireCuid(item.inventoryItemId.trim(), "Inventory item id")
        : "",
      quantity: item.quantity ?? 0,
    }))
    .filter(
      (item) =>
        item.inventoryItemId &&
        Number.isInteger(item.quantity) &&
        item.quantity > 0,
    );

  if (inputs.length === 0) {
    return jsonError(c, 400, "At least one inventory item is required");
  }

  const lines = await checkInventoryAvailability(inputs);
  const fullyAvailable = lines.every(
    (line) => line.availableQuantity >= line.requestedQuantity,
  );
  const anyAvailable = lines.some((line) => line.availableQuantity > 0);

  return c.json({
    lines,
    fullyAvailable,
    anyAvailable,
  });
});

guest.post("/requests", async (c) => {
  const roomSessionToken = c.req.header("x-room-session-token")?.trim();
  const roomToken = c.req.header("x-room-token")?.trim();
  const body = parseRequestBody(await c.req.json<CreateGuestRequestBody>());

  if (!body) {
    return jsonError(c, 400, "Invalid guest request payload");
  }

  if (!roomSessionToken && !roomToken && !body.roomCode) {
    return jsonError(c, 401, "Room credentials are required");
  }

  const request = await createGuestRequest({
    ...body,
    roomSessionToken,
    roomAccessToken: roomToken,
  });

  return c.json(request, 201);
});

guest.delete("/device-sessions/current", roomDeviceAuthMiddleware, async (c) => {
  const session = await revokeRoomDeviceSession(c.get("roomDeviceSession").id);
  return c.json({
    revoked: true,
    sessionId: session.id,
  });
});

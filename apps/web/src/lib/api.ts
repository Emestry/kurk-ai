export interface InventoryItemSummary {
  id: string;
  sku: string;
  name: string;
  category: string;
  unit: string;
  quantityInStock: number;
  quantityReserved: number;
  quantityAvailable: number;
  lowStockThreshold: number;
  isLowStock: boolean;
  isActive: boolean;
}

export interface RequestSummary {
  requestId: string;
  roomId: string;
  roomNumber: string;
  roomDeviceSessionId: string | null;
  status: "received" | "in_progress" | "partially_delivered" | "delivered" | "rejected";
  source: "text" | "voice";
  category: "room_service" | "housekeeping" | "maintenance" | "reception" | null;
  rawText: string;
  normalizedText: string | null;
  guestMessage: string | null;
  staffNote: string | null;
  etaMinutes: number | null;
  etaAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: Array<{
    requestItemId: string;
    inventoryItemId: string;
    inventoryItemName: string;
    requestedQuantity: number;
    reservedQuantity: number;
    deliveredQuantity: number;
    unavailableQuantity: number;
  }>;
}

export interface GuestRealtimeEvent {
  type:
    | "request.created"
    | "request.updated"
    | "request.rejected"
    | "request.delivered"
    | "inventory.updated"
    | "alert.low_stock"
    | "stocktake.finalized";
  requestId?: string;
  roomId?: string;
  status?: RequestSummary["status"];
  occurredAt: string;
  data: Record<string, unknown>;
}

export interface DeviceSessionResponse {
  sessionId: string;
  token: string;
  expiresAt: string;
  roomId: string;
  roomNumber: string;
  deviceId: string;
  deviceName: string;
}

const DEFAULT_API_BASE_URL = "http://localhost:3001";

/**
 * Resolves the guest app API base URL from environment configuration.
 *
 * @returns The normalized base URL used for guest-facing API requests.
 */
export function getApiBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_API_BASE_URL?.trim().replace(/\/+$/, "") ||
    DEFAULT_API_BASE_URL
  );
}

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => null)) as
    | { error?: string }
    | T
    | null;

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? payload.error
        : "Request failed";
    throw new ApiError(message || "Request failed", response.status);
  }

  return payload as T;
}

export async function createDeviceSession(input: {
  roomCode: string;
  pairingCode: string;
  deviceFingerprint: string;
  deviceName: string;
}) {
  const response = await fetch(`${getApiBaseUrl()}/guest/device-sessions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  return parseJson<DeviceSessionResponse>(response);
}

/**
 * Fetches the public inventory catalog for guest-side request previews.
 *
 * @returns Inventory items that guests may request.
 * @throws ApiError when the API returns a non-2xx response.
 */
export async function getInventoryCatalog() {
  const response = await fetch(`${getApiBaseUrl()}/guest/inventory/catalog`, {
    cache: "no-store",
  });

  return parseJson<{ items: InventoryItemSummary[] }>(response);
}

/**
 * Fetches the currently active request for the paired guest tablet.
 *
 * @param roomSessionToken - Auth token for the current room device session.
 * @returns The room context and current request summary, if one exists.
 * @throws ApiError when the API rejects the request.
 */
export async function getCurrentRequest(roomSessionToken: string) {
  const response = await fetch(`${getApiBaseUrl()}/guest/requests/current`, {
    headers: {
      "x-room-session-token": roomSessionToken,
    },
    cache: "no-store",
  });

  return parseJson<{ roomId: string; roomNumber: string; request: RequestSummary | null }>(
    response,
  );
}

/**
 * Fetches recent request history for the paired guest tablet.
 *
 * @param roomSessionToken - Auth token for the current room device session.
 * @returns Room context plus recent request history entries.
 * @throws ApiError when the API rejects the request.
 */
export async function getRequestHistory(roomSessionToken: string) {
  const response = await fetch(`${getApiBaseUrl()}/guest/requests/history?limit=10`, {
    headers: {
      "x-room-session-token": roomSessionToken,
    },
    cache: "no-store",
  });

  return parseJson<{ roomId: string; roomNumber: string; requests: RequestSummary[] }>(
    response,
  );
}

/**
 * Creates a guest request directly against the guest API.
 *
 * @param input - Room session token plus raw request text and optional item ids.
 * @returns The created request summary.
 * @throws ApiError when the API rejects the request.
 */
export async function submitGuestRequest(input: {
  roomSessionToken: string;
  source: "text" | "voice";
  rawText: string;
  items?: Array<{ inventoryItemId: string; quantity: number }>;
  allowPartial?: boolean;
}) {
  const response = await fetch(`${getApiBaseUrl()}/guest/requests`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-room-session-token": input.roomSessionToken,
    },
    body: JSON.stringify({
      source: input.source,
      rawText: input.rawText,
      items: input.items,
      allowPartial: input.allowPartial === true,
    }),
  });

  return parseJson<RequestSummary>(response);
}

export interface AvailabilityLine {
  inventoryItemId: string;
  name: string;
  requestedQuantity: number;
  availableQuantity: number;
}

export interface AvailabilityPreview {
  lines: AvailabilityLine[];
  fullyAvailable: boolean;
  anyAvailable: boolean;
}

/**
 * Checks whether the requested inventory items are fully or partially available.
 *
 * @param input - Inventory item ids and requested quantities.
 * @returns Per-line availability plus convenience booleans for the UI.
 * @throws ApiError when the API rejects the preview request.
 */
export async function previewGuestRequest(input: {
  items: Array<{ inventoryItemId: string; quantity: number }>;
}): Promise<AvailabilityPreview> {
  const response = await fetch(`${getApiBaseUrl()}/guest/requests/preview`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items: input.items }),
  });

  return parseJson<AvailabilityPreview>(response);
}

/**
 * Uploads recorded guest audio for server-side transcription.
 *
 * @param input - Audio blob and optional filename metadata.
 * @returns The transcribed text returned by the API.
 * @throws ApiError when the API rejects the transcription request.
 */
export async function transcribeGuestAudio(input: {
  audio: Blob;
  fileName?: string;
}) {
  const formData = new FormData();
  formData.append(
    "audio",
    new File([input.audio], input.fileName ?? "guest-request.webm", {
      type: input.audio.type || "audio/webm",
    }),
  );

  const response = await fetch(`${getApiBaseUrl()}/guest/transcribe`, {
    method: "POST",
    body: formData,
  });

  return parseJson<{ transcript: string }>(response);
}

import type { GuestRequest, ParseRequestResponse } from "./types";
import type { GuestLanguageCode } from "./guest-language";

export async function translateGuestTexts(input: {
  texts: string[];
  language: GuestLanguageCode;
}) {
  const response = await fetch(`${getApiBaseUrl()}/guest/translate`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
  });

  const payload = await parseJson<{ translations: string[] }>(response);
  return payload.translations;
}

const LEGACY_SESSION_KEY = "kurkai-legacy-room-session";
const SESSION_STORAGE_KEY = "kurkai-room-session";
const HISTORY_HIDDEN_BEFORE_KEY = "kurkai-room-history-hidden-before";

export function getHistoryHiddenBefore(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(HISTORY_HIDDEN_BEFORE_KEY);
}

/**
 * Persists the history reset timestamp used to hide older guest requests.
 *
 * @param iso - ISO timestamp representing the start of visible history.
 * @returns Nothing.
 */
export function setHistoryHiddenBefore(iso: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(HISTORY_HIDDEN_BEFORE_KEY, iso);
}

/**
 * Clears the guest history reset marker from local storage.
 *
 * @returns Nothing.
 */
export function clearHistoryHiddenBefore() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HISTORY_HIDDEN_BEFORE_KEY);
}

interface LegacyRoomSession {
  roomNumber: string;
  token: string;
}

function loadLegacySessions() {
  if (typeof window === "undefined") {
    return [] as LegacyRoomSession[];
  }

  try {
    return JSON.parse(window.localStorage.getItem(LEGACY_SESSION_KEY) ?? "[]") as LegacyRoomSession[];
  } catch {
    return [] as LegacyRoomSession[];
  }
}

export function storeSession(session: DeviceSessionResponse) {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function getStoredSession(): DeviceSessionResponse | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as DeviceSessionResponse;
  } catch {
    return null;
  }
}

/**
 * Removes the stored guest device session from local storage.
 *
 * @returns Nothing.
 */
export function clearSession() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

/**
 * Resolves the room session token used by legacy guest request helpers.
 *
 * @param roomNumber - Room number expected to match the stored device session.
 * @returns The active room session token for the room.
 * @throws Error when the tablet is not paired for the given room.
 */
export async function ensureLegacyRoomSession(roomNumber: string) {
  // Prefer the session created by SetupScreen (paired with a staff-issued code).
  const stored = getStoredSession();
  if (stored?.token && stored.roomNumber === roomNumber) {
    return stored.token;
  }

  // Fall back to a previously-cached legacy token for backward compat with
  // older Orb builds. New auto-creation is no longer permitted — staff must
  // issue a pairing code on the dashboard for the tablet to re-pair.
  const existing = loadLegacySessions().find((entry) => entry.roomNumber === roomNumber);
  if (existing?.token) {
    return existing.token;
  }

  throw new Error("This tablet is not paired. Ask staff to issue a pairing code.");
}

function mapSummaryToLegacyRequest(request: RequestSummary): GuestRequest {
  return {
    id: request.requestId,
    room: request.roomNumber,
    text: request.rawText,
    category: request.category ?? "reception",
    status: request.status,
    notes: request.staffNote ?? request.rejectionReason,
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    etaAt: request.etaAt,
    items: request.items.map((item) => ({
      inventory_item_id: item.inventoryItemId,
      name: item.inventoryItemName,
      quantity_requested: item.requestedQuantity,
      quantity_fulfilled: item.deliveredQuantity,
    })),
  };
}

export async function parseRequest(
  _room: string,
  text: string,
): Promise<ParseRequestResponse> {
  const response = await fetch(`${getApiBaseUrl()}/guest/parse-request`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      rawText: text,
    }),
  });

  return parseJson<ParseRequestResponse>(response);
}

export async function createRequest(
  room: string,
  text: string,
  items: Array<{ inventory_item_id: string; name: string; quantity: number }>,
  category: string,
  options: { allowPartial?: boolean } = {},
): Promise<GuestRequest> {
  void category;
  const roomSessionToken = await ensureLegacyRoomSession(room);
  const created = await submitGuestRequest({
    roomSessionToken,
    source: "voice",
    rawText: text,
    items: items.map((item) => ({
      inventoryItemId: item.inventory_item_id,
      quantity: item.quantity,
    })),
    allowPartial: options.allowPartial,
  });

  return mapSummaryToLegacyRequest(created);
}

/**
 * Fetches recent room requests and maps them into the guest UI model.
 *
 * @param room - Room number whose history should be fetched.
 * @returns Guest request cards for the room.
 * @throws ApiError when the API rejects the request.
 */
export async function fetchRoomRequests(room: string): Promise<GuestRequest[]> {
  const roomSessionToken = await ensureLegacyRoomSession(room);
  const history = await getRequestHistory(roomSessionToken);
  return history.requests.map(mapSummaryToLegacyRequest);
}

/**
 * Shared DTO types for the staff dashboard. Mirrors the shape
 * of responses from apps/api. Keep in sync with the backend
 * service return types in apps/api/src/services.
 */

export type RequestStatus =
  | "received"
  | "in_progress"
  | "partially_delivered"
  | "delivered"
  | "rejected";

export type RequestCategory =
  | "room_service"
  | "housekeeping"
  | "maintenance"
  | "reception";

export type RequestSource = "text" | "voice";

export type RequestActorType = "guest" | "staff" | "system";

export type RequestEventType =
  | "created"
  | "status_changed"
  | "rejected"
  | "partially_delivered"
  | "delivered"
  | "note_added"
  | "eta_set";

export type InventoryAdjustmentReason =
  | "restock"
  | "manual_adjustment"
  | "damaged"
  | "theft"
  | "miscounted"
  | "supplier_error";

export type InventoryMovementType =
  | "reserve"
  | "release"
  | "deliver"
  | "restock"
  | "adjustment"
  | "stocktake";

export type StocktakeDiscrepancyReason =
  | "damaged"
  | "theft"
  | "miscounted"
  | "supplier_error";

export type StocktakeStatus = "open" | "finalized";

export interface InventoryItemDTO {
  id: string;
  sku: string;
  name: string;
  category: RequestCategory;
  unit: string;
  quantityInStock: number;
  quantityReserved: number;
  quantityAvailable: number;
  lowStockThreshold: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GuestRequestItemDTO {
  id: string;
  inventoryItemId: string;
  name: string;
  category: RequestCategory;
  unit: string;
  requestedQuantity: number;
  reservedQuantity: number;
  deliveredQuantity: number;
  unavailableQuantity: number;
}

export interface GuestRequestDTO {
  id: string;
  roomId: string;
  roomNumber: string;
  source: RequestSource;
  rawText: string;
  normalizedText: string | null;
  category: RequestCategory | null;
  guestMessage: string | null;
  staffNote: string | null;
  etaMinutes: number | null;
  etaAt: string | null;
  status: RequestStatus;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  items: GuestRequestItemDTO[];
}

export interface RequestEventDTO {
  id: string;
  requestId: string;
  type: RequestEventType;
  actorType: RequestActorType;
  payload: Record<string, unknown> | null;
  createdAt: string;
}

export interface InventoryMovementDTO {
  id: string;
  inventoryItemId: string;
  requestId: string | null;
  type: InventoryMovementType;
  reason: InventoryAdjustmentReason | null;
  quantityDelta: number;
  note: string | null;
  createdAt: string;
}

export interface RoomDeviceSessionDTO {
  id: string;
  roomId: string;
  roomDeviceId: string;
  token: string;
  expiresAt: string;
  revokedAt: string | null;
  createdAt: string;
}

export interface RoomDTO {
  id: string;
  number: string;
  code: string;
  isActive: boolean;
  pairingCode: string | null;
  pairingCodeExpiresAt: string | null;
  devices: Array<{
    id: string;
    name: string;
    isActive: boolean;
    lastSeenAt: string | null;
  }>;
  activeSessions: RoomDeviceSessionDTO[];
}

export interface StocktakeLineDTO {
  id: string;
  sessionId: string;
  inventoryItemId: string;
  itemName: string;
  itemCategory: RequestCategory;
  expectedQuantity: number;
  physicalCount: number | null;
  discrepancyQuantity: number | null;
  reason: StocktakeDiscrepancyReason | null;
}

export interface StocktakeSessionDTO {
  id: string;
  status: StocktakeStatus;
  note: string | null;
  startedByUserId: string | null;
  finalizedByUserId: string | null;
  createdAt: string;
  finalizedAt: string | null;
  lines: StocktakeLineDTO[];
}

export interface MonthlyReportDTO {
  month: string;
  totalRequests: number;
  outcomes: {
    delivered: number;
    partiallyDelivered: number;
    rejected: number;
  };
  totalUnitsDelivered: number;
  averageResponseTimeSeconds: number | null;
  requestsByDay: Array<{
    date: string;
    delivered: number;
    partiallyDelivered: number;
    rejected: number;
    inProgress: number;
    received: number;
  }>;
  requestsByHour: Array<{ hour: number; count: number }>;
  requestsByCategory: Array<{ category: RequestCategory; count: number }>;
  consumption: Array<{
    inventoryItemId: string;
    itemName: string;
    category: RequestCategory;
    unitsRequested: number;
    unitsDelivered: number;
    unitsUnfulfilled: number;
    requests: number;
  }>;
  reconciliations: Array<{
    sessionId: string;
    itemCount: number;
    discrepantItemCount: number;
    netAdjustment: number;
    reasons: Record<StocktakeDiscrepancyReason, number>;
    finalizedAt: string;
  }>;
}

export type LiveEventType =
  | "request.created"
  | "request.updated"
  | "request.rejected"
  | "request.delivered"
  | "inventory.updated"
  | "stocktake.finalized"
  | "alert.low_stock"
  | "room.session.created"
  | "room.session.revoked";

export interface LiveEvent {
  type: LiveEventType;
  requestId?: string;
  roomId?: string;
  status?: RequestStatus;
  occurredAt: string;
  data: Record<string, unknown>;
}

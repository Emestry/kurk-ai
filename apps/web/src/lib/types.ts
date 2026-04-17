export type GuestState = "setup" | "idle" | "listening" | "processing" | "confirming";

export type ConnectionStatus = "connected" | "disconnected" | "reconnecting";

export type RequestStatus =
  | "received"
  | "in_progress"
  | "delivered"
  | "partially_delivered"
  | "rejected";

export interface RequestItem {
  inventory_item_id: string;
  name: string;
  quantity_requested: number;
  quantity_fulfilled: number;
}

export interface GuestRequest {
  id: string;
  room: string;
  text: string;
  category: string;
  status: RequestStatus;
  notes: string | null;
  items: RequestItem[];
  createdAt: string;
  updatedAt: string;
}

export interface ParseRequestResponse {
  items: Array<{
    inventory_item_id: string;
    name: string;
    quantity: number;
  }>;
  category: string;
}

export interface ParseRequestError {
  error: string;
  statusCode: number;
}

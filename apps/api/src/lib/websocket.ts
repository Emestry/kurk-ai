export interface RealtimeMessage {
  type: string;
  requestId?: string;
  roomId?: string;
  status?: string;
  occurredAt: string;
  data: Record<string, unknown>;
}

interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

type Scope = "staff" | "room";

interface Connection {
  id: string;
  scope: Scope;
  roomId?: string;
  socket: SocketLike;
}

const connections = new Map<string, Connection>();

function serialize(message: RealtimeMessage) {
  return JSON.stringify(message);
}

/**
 * Registers a staff WebSocket connection for global staff-side realtime events.
 *
 * @param id - Internal connection identifier.
 * @param socket - Open WebSocket-like connection object.
 * @returns Nothing.
 */
export function registerStaffSocket(id: string, socket: SocketLike) {
  connections.set(id, {
    id,
    scope: "staff",
    socket,
  });
}

/**
 * Registers a guest-room WebSocket connection scoped to a single room.
 *
 * @param id - Internal connection identifier.
 * @param roomId - Room id used to filter outbound messages.
 * @param socket - Open WebSocket-like connection object.
 * @returns Nothing.
 */
export function registerRoomSocket(id: string, roomId: string, socket: SocketLike) {
  connections.set(id, {
    id,
    scope: "room",
    roomId,
    socket,
  });
}

/**
 * Removes a tracked WebSocket connection after it closes.
 *
 * @param id - Internal connection identifier to remove.
 * @returns Nothing.
 */
export function unregisterSocket(id: string) {
  connections.delete(id);
}

/**
 * Pushes a serialized realtime message to every matching WebSocket subscriber.
 *
 * @param message - Message to publish to staff and room-specific sockets.
 * @returns Nothing.
 */
export function publishWebsocketMessage(message: RealtimeMessage) {
  const payload = serialize(message);

  for (const connection of connections.values()) {
    if (connection.scope === "staff") {
      connection.socket.send(payload);
      continue;
    }

    if (message.roomId && connection.roomId === message.roomId) {
      connection.socket.send(payload);
    }
  }
}

/**
 * Closes every tracked WebSocket connection, typically during shutdown or tests.
 *
 * @returns Nothing.
 */
export function closeAllSockets() {
  for (const connection of connections.values()) {
    connection.socket.close();
  }

  connections.clear();
}

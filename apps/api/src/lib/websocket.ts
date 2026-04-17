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

export function registerStaffSocket(id: string, socket: SocketLike) {
  connections.set(id, {
    id,
    scope: "staff",
    socket,
  });
}

export function registerRoomSocket(id: string, roomId: string, socket: SocketLike) {
  connections.set(id, {
    id,
    scope: "room",
    roomId,
    socket,
  });
}

export function unregisterSocket(id: string) {
  connections.delete(id);
}

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

export function closeAllSockets() {
  for (const connection of connections.values()) {
    connection.socket.close();
  }

  connections.clear();
}

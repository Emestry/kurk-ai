import "dotenv/config";

import { createAdaptorServer } from "@hono/node-server";
import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";
import type { Socket } from "node:net";
import { auth } from "@/lib/auth.js";
import { getEnv } from "@/lib/env.js";
import { logger } from "@/lib/logger.js";
import {
  registerRoomSocket,
  registerStaffSocket,
  unregisterSocket,
} from "@/lib/websocket.js";
import { createApp } from "@/app.js";
import { getActiveRoomDeviceSession } from "@/services/room-service.js";
import { WebSocketServer } from "ws";
import type WebSocket from "ws";

interface SocketClientContext {
  scope: "staff" | "room";
  roomId?: string;
}

const env = getEnv();
const app = createApp();

const server = createAdaptorServer({
  fetch: app.fetch,
});

const websocketServer = new WebSocketServer({ noServer: true });

websocketServer.on("connection", (socket: WebSocket, request: IncomingMessage, client: SocketClientContext) => {
  const connectionId = randomUUID();

  if (client.scope === "staff") {
    registerStaffSocket(connectionId, socket);
  } else {
    registerRoomSocket(connectionId, client.roomId!, socket);
  }

  socket.send(
    JSON.stringify({
      type: "connected",
      occurredAt: new Date().toISOString(),
      data: {
        scope: client.scope,
        roomId: client.scope === "room" ? client.roomId : undefined,
      },
    }),
  );

  socket.on("close", () => {
    unregisterSocket(connectionId);
  });
});

server.on("upgrade", async (request: IncomingMessage, socket: Socket, head) => {
  try {
    const url = new URL(request.url ?? "", `http://${request.headers.host}`);

    if (url.pathname !== "/ws") {
      socket.destroy();
      return;
    }

    const scope = url.searchParams.get("scope");

    if (scope === "guest") {
      const token =
        url.searchParams.get("roomSessionToken") ??
        request.headers["x-room-session-token"];
      const session = await getActiveRoomDeviceSession(
        Array.isArray(token) ? token[0] : token ?? undefined,
      );

      if (!session) {
        socket.destroy();
        return;
      }

      websocketServer.handleUpgrade(request, socket, head, (ws) => {
        websocketServer.emit("connection", ws, request, {
          scope: "room" as const,
          roomId: session.roomId,
        });
      });

      return;
    }

    if (scope === "staff") {
      const headers = new Headers();

      for (const [key, value] of Object.entries(request.headers)) {
        if (Array.isArray(value)) {
          for (const entry of value) {
            headers.append(key, entry);
          }
        } else if (value) {
          headers.set(key, value);
        }
      }

      const session = await auth.api.getSession({ headers });

      if (!session) {
        socket.destroy();
        return;
      }

      websocketServer.handleUpgrade(request, socket, head, (ws) => {
        websocketServer.emit("connection", ws, request, {
          scope: "staff" as const,
        });
      });

      return;
    }

    socket.destroy();
  } catch (error) {
    logger.error("WebSocket upgrade failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    socket.destroy();
  }
});

server.listen(env.port, () => {
  logger.info(`Server is running on http://localhost:${env.port}`);
});

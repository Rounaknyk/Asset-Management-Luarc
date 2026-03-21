import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { AuthPayload } from '../types/index.js';

let wss: WebSocketServer;

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws, req) => {
    const url = new URL(req.url || '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    try {
      const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
      (ws as any).userId = payload.userId;
      (ws as any).email = payload.email;

      ws.send(JSON.stringify({
        event: 'connected',
        data: { clients: wss.clients.size }
      }));
    } catch {
      ws.close(4002, 'Invalid token');
      return;
    }

    ws.on('error', () => {});
  });
}

export function broadcast(event: string, data: unknown): void {
  if (!wss) return;

  const message = JSON.stringify({ event, data });

  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

export function getClientCount(): number {
  return wss ? wss.clients.size : 0;
}

import { Response } from 'express';

type SSEClient = {
  id: number;
  res: Response;
};

let clients: SSEClient[] = [];
let clientId = 0;

export function addClient(res: Response): number {
  const id = ++clientId;
  clients.push({ id, res });
  return id;
}

export function removeClient(id: number): void {
  clients = clients.filter(c => c.id !== id);
}

export function broadcast(event: string, data: unknown): void {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    client.res.write(message);
  });
}

export function getClientCount(): number {
  return clients.length;
}

import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { addClient, removeClient, getClientCount } from '../services/sse.service.js';
import { AuthPayload } from '../types/index.js';

const router = Router();

router.get('/', (req: Request, res: Response) => {
  const token = req.query.token as string;

  if (!token) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  try {
    jwt.verify(token, process.env.JWT_SECRET!) as AuthPayload;
  } catch {
    res.status(401).json({ error: 'Invalid token' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  const clientId = addClient(res);

  res.write(`event: connected\ndata: {"clientId":${clientId},"clients":${getClientCount()}}\n\n`);

  const heartbeat = setInterval(() => {
    res.write(`: heartbeat\n\n`);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeat);
    removeClient(clientId);
  });
});

export default router;

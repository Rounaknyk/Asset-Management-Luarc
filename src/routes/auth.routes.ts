import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { createUser, authenticateUser } from '../services/auth.service.js';

const router = Router();

const AuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password } = AuthSchema.parse(req.body);
    const user = await createUser(email, password);
    res.status(201).json({ id: user.id, email: user.email });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    const message = err instanceof Error ? err.message : 'Registration failed';
    const status = message === 'Email already registered' ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = AuthSchema.parse(req.body);
    const token = await authenticateUser(email, password);
    res.json({ token });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

export default router;

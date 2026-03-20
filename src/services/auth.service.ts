import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, queryOne } from '../config/database.js';
import { User, AuthPayload } from '../types/index.js';

const SALT_ROUNDS = 12;

export async function createUser(email: string, password: string): Promise<User> {
  const existing = await queryOne<User>('SELECT id FROM users WHERE email = $1', [email]);

  if (existing) {
    throw new Error('Email already registered');
  }

  const hash = await bcrypt.hash(password, SALT_ROUNDS);

  const users = await query<User>(
    'INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING *',
    [email, hash]
  );

  return users[0];
}

export async function authenticateUser(email: string, password: string): Promise<string> {
  const user = await queryOne<User>(
    'SELECT * FROM users WHERE email = $1',
    [email]
  );

  if (!user) {
    throw new Error('Invalid credentials');
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    throw new Error('Invalid credentials');
  }

  const payload: AuthPayload = { userId: user.id, email: user.email };

  return jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: process.env.JWT_EXPIRES_IN || '24h'
  });
}

export async function getUserById(id: number): Promise<User | null> {
  return queryOne<User>('SELECT id, email, created_at FROM users WHERE id = $1', [id]);
}

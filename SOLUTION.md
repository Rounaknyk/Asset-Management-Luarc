# Asset Management API

## Problem

Build a coupon/voucher system where hundreds of users might claim the same asset simultaneously.

Core challenges:
1. Secure authentication
2. Preventing overselling through race conditions
3. Efficient relational queries

## Solution

### Authentication
- JWT-based stateless auth with bcrypt password hashing
- Middleware validates tokens on protected routes

### Concurrency Control

**Claims (Pessimistic Locking):**
- `SELECT FOR UPDATE` locks the row during transaction
- Only one user can claim at a time
- No overselling possible

**Updates (Optimistic Locking):**
- Version column tracks changes
- If two users edit simultaneously, second gets conflict error
- Must retry with fresh data

### Real-Time Updates
- WebSocket broadcasts changes to all connected clients
- UI updates instantly when anyone claims or modifies an asset

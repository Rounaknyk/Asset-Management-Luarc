# Asset Management API - Interview Reference

## Quick Start

```bash
# Use Node 20+ (project includes .nvmrc)
nvm use

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your PostgreSQL connection string

# Create database
createdb luarc_assets

# Run migrations
npm run migrate

# Start development server
npm run dev
```

## Architecture Overview

```
src/
├── app.ts              # Express application entry point
├── config/
│   └── database.ts     # PostgreSQL connection pool + transaction helper
├── db/
│   └── migrate.ts      # Database schema migrations
├── middleware/
│   └── auth.ts         # JWT authentication middleware
├── routes/
│   ├── auth.routes.ts  # /auth endpoints
│   └── asset.routes.ts # /assets endpoints
├── services/
│   ├── auth.service.ts # User registration + login logic
│   └── asset.service.ts# Asset CRUD + claim logic with concurrency
└── types/
    └── index.ts        # TypeScript interfaces
```

## Database Schema

### Tables

**users**
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| email | VARCHAR(255) | UNIQUE, NOT NULL |
| password_hash | VARCHAR(255) | NOT NULL |
| created_at | TIMESTAMP | DEFAULT NOW |

**assets**
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| code | VARCHAR(50) | UNIQUE, NOT NULL |
| description | TEXT | |
| value | DECIMAL(10,2) | NOT NULL, DEFAULT 0 |
| max_claims | INTEGER | NOT NULL, DEFAULT 1 |
| current_claims | INTEGER | NOT NULL, DEFAULT 0 |
| expires_at | TIMESTAMP | |
| created_at | TIMESTAMP | DEFAULT NOW |
| version | INTEGER | NOT NULL, DEFAULT 1 |

**claims**
| Column | Type | Constraints |
|--------|------|-------------|
| id | SERIAL | PRIMARY KEY |
| user_id | INTEGER | FK → users(id) ON DELETE CASCADE |
| asset_id | INTEGER | FK → assets(id) ON DELETE CASCADE |
| claimed_at | TIMESTAMP | DEFAULT NOW |
| | | UNIQUE(user_id, asset_id) |

### Indexes
- `idx_claims_user` - Fast lookup of user's claims
- `idx_claims_asset` - Fast lookup of asset's claimants
- `idx_assets_expires` - Partial index for expiring assets
- `idx_assets_available` - Partial index for available assets

## API Endpoints

### Authentication

#### POST /auth/register
Register a new user.
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```

#### POST /auth/login
Get JWT token.
```json
{
  "email": "user@example.com",
  "password": "securepassword"
}
```
Response: `{ "token": "eyJhbG..." }`

### Assets (All require `Authorization: Bearer <token>`)

#### POST /assets
Create a new asset/coupon.
```json
{
  "code": "SUMMER2026",
  "description": "Summer discount coupon",
  "value": 25.00,
  "maxClaims": 100,
  "expiresAt": "2026-08-31T23:59:59Z"
}
```

#### POST /assets/:id/claim
Claim an asset. Returns 409 if already claimed or exhausted.

#### PATCH /assets/:id
Update asset with optimistic locking.
```json
{
  "description": "Updated description",
  "version": 1
}
```
Returns 409 if version mismatch (concurrent modification).

#### GET /assets/pool
Get all assets with availability status.
Query params: `available=true|false`, `minValue=10`, `maxValue=100`

#### GET /assets/my-claims
Get current user's claim history with joined asset details.

#### GET /assets/:id
Get single asset details.

#### GET /assets/:id/history
Get asset with all claim records (who claimed it and when).

## Concurrency Control

### Problem: Race Conditions
When hundreds of users try to claim the same coupon simultaneously:
1. User A reads `current_claims = 99` (max is 100)
2. User B reads `current_claims = 99`
3. Both users see it's available
4. Both increment to 100
5. Both claims succeed → **overselling**

### Solution 1: Pessimistic Locking (Claims)
Used in `claimAsset()` for critical operations:

```sql
SELECT * FROM assets WHERE id = $1 FOR UPDATE
```

`FOR UPDATE` acquires a row-level exclusive lock:
- Other transactions block until lock is released
- Guarantees only one claim processes at a time for that asset
- Lock held only during transaction (milliseconds)

Flow:
1. Begin transaction
2. `SELECT ... FOR UPDATE` (acquire lock)
3. Check availability
4. Increment `current_claims`
5. Insert claim record
6. Commit (release lock)

### Solution 2: Optimistic Locking (Updates)
Used in `updateAsset()` for general modifications:

```sql
UPDATE assets
SET description = $1, version = version + 1
WHERE id = $2 AND version = $3
RETURNING *
```

If another transaction modified the row, version won't match → 0 rows updated → return 409 Conflict.

Client handles by:
1. Refetching current state
2. Resolving conflicts
3. Retrying with new version

### Why Both Approaches?

| Scenario | Approach | Reason |
|----------|----------|--------|
| Claiming assets | Pessimistic | Must never oversell; brief lock is acceptable |
| General updates | Optimistic | Allows concurrent reads; conflicts are rare |

## Relational Queries

### User's Claim History
```sql
SELECT c.*, a.code, a.description, a.value
FROM claims c
JOIN assets a ON c.asset_id = a.id
WHERE c.user_id = $1
ORDER BY c.claimed_at DESC
```
Returns claims with asset details in one query.

### Asset Pool with Availability
```sql
SELECT *,
  (current_claims < max_claims AND (expires_at IS NULL OR expires_at > NOW())) as is_available,
  (max_claims - current_claims) as remaining_claims
FROM assets
WHERE ...
```
Computes availability in the query for efficiency.

### Asset Claim History
```sql
SELECT c.user_id, u.email, c.claimed_at
FROM claims c
JOIN users u ON c.user_id = u.id
WHERE c.asset_id = $1
```
Shows who claimed an asset and when.

## Security

### Password Hashing
- bcrypt with 12 salt rounds
- Constant-time comparison prevents timing attacks

### JWT Configuration
- Tokens expire after 24h (configurable)
- Payload contains userId and email only
- Secret must be strong in production

### Input Validation
- Zod schemas validate all request bodies
- SQL parameterization prevents injection
- Type-safe throughout with TypeScript

## Why These Technology Choices

| Choice | Rationale |
|--------|-----------|
| PostgreSQL | ACID compliance, row-level locking, mature |
| Raw SQL (pg) | Shows database knowledge vs ORM abstraction |
| TypeScript | Type safety catches errors at compile time |
| Zod | Runtime validation matches TypeScript types |
| bcrypt | Industry standard, adaptive cost factor |
| JWT | Stateless auth, scales horizontally |

## Testing the Concurrency

To verify race condition handling:

```bash
# Terminal 1 - Rapid concurrent claims
for i in {1..50}; do
  curl -X POST http://localhost:3000/assets/1/claim \
    -H "Authorization: Bearer $TOKEN" &
done
wait

# Check final state
curl http://localhost:3000/assets/1 -H "Authorization: Bearer $TOKEN"
```

Expected: `current_claims` never exceeds `max_claims`.

## Interview Discussion Points

1. **Why FOR UPDATE vs FOR SHARE?**
   FOR UPDATE is exclusive (write lock), FOR SHARE allows concurrent reads but blocks writes. We need exclusive because we're modifying the row.

2. **What about deadlocks?**
   PostgreSQL detects deadlocks and aborts one transaction. Our single-table lock order prevents them. For multi-table operations, always lock in consistent order.

3. **Scaling considerations?**
   - Connection pooling (max 20 connections)
   - Partial indexes reduce scan overhead
   - Horizontal scaling: read replicas for GET endpoints

4. **Why not use an ORM?**
   For this assessment, raw SQL demonstrates understanding of:
   - Transaction isolation levels
   - Locking mechanisms
   - Query optimization
   - Index utilization

5. **Alternative concurrency approaches?**
   - Serializable isolation level (higher lock contention)
   - Advisory locks (application-level)
   - Queue-based processing (eventual consistency)

## Common Interview Questions

**Q: What happens if the server crashes mid-transaction?**
A: PostgreSQL automatically rolls back uncommitted transactions on restart. ACID durability ensures committed transactions are persisted.

**Q: How would you handle high traffic?**
A:
- Read replicas for GET endpoints
- Redis caching for asset pool
- Rate limiting per user
- Queue high-volume claims for async processing

**Q: What if max_claims is very high (millions)?**
A: Consider:
- Token bucket algorithm instead of counter
- Distributed counter with eventual consistency
- Separate hot-path from cold storage

# Developer Setup Guide

## Prerequisites

- Node.js 20+ (use nvm)
- PostgreSQL 14+
- Git

## Quick Setup

```bash
git clone <repository-url>
cd luarc

nvm use
npm install

cp .env.example .env
createdb luarc_assets
npm run migrate
npm run dev
```

Open http://localhost:3000

## Environment Variables

Create `.env` from `.env.example`:

| Variable | Description | Example |
|----------|-------------|---------|
| DATABASE_URL | PostgreSQL connection string | `postgresql://localhost:5432/luarc_assets` |
| JWT_SECRET | Secret for signing tokens | `your-secret-key-min-32-chars` |
| JWT_EXPIRES_IN | Token expiration | `24h` |
| PORT | Server port | `3000` |

## Database

### Create Database

```bash
createdb luarc_assets
```

### Run Migrations

```bash
npm run migrate
```

### Reset Database

```bash
dropdb luarc_assets
createdb luarc_assets
npm run migrate
```

### Connect via psql

```bash
psql luarc_assets
```

## Project Structure

```
luarc/
├── src/
│   ├── app.ts                 # Express entry point
│   ├── config/
│   │   └── database.ts        # PostgreSQL pool + transaction helper
│   ├── db/
│   │   └── migrate.ts         # Schema migrations
│   ├── middleware/
│   │   └── auth.ts            # JWT verification
│   ├── routes/
│   │   ├── auth.routes.ts     # POST /auth/register, /auth/login
│   │   └── asset.routes.ts    # Asset CRUD endpoints
│   ├── services/
│   │   ├── auth.service.ts    # User auth logic
│   │   └── asset.service.ts   # Asset + claim logic
│   └── types/
│       └── index.ts           # TypeScript interfaces
├── public/
│   └── index.html             # Frontend UI
├── package.json
├── tsconfig.json
├── .nvmrc                     # Node version
└── .env.example
```

## NPM Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server with hot reload |
| `npm run build` | Compile TypeScript to dist/ |
| `npm start` | Run compiled JS (production) |
| `npm run migrate` | Run database migrations |

## API Endpoints

### Auth

```bash
# Register
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@test.com","password":"password123"}'

# Login
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@test.com","password":"password123"}'
```

### Assets (require Authorization header)

```bash
TOKEN="your-jwt-token"

# Create asset
curl -X POST http://localhost:3000/assets \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code":"TEST01","description":"Test","value":10,"maxClaims":5}'

# Get pool
curl http://localhost:3000/assets/pool \
  -H "Authorization: Bearer $TOKEN"

# Get single asset
curl http://localhost:3000/assets/1 \
  -H "Authorization: Bearer $TOKEN"

# Claim asset
curl -X POST http://localhost:3000/assets/1/claim \
  -H "Authorization: Bearer $TOKEN"

# Update asset (requires version for optimistic locking)
curl -X PATCH http://localhost:3000/assets/1 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"description":"Updated","version":1}'

# Get user claims
curl http://localhost:3000/assets/my-claims \
  -H "Authorization: Bearer $TOKEN"

# Get asset history
curl http://localhost:3000/assets/1/history \
  -H "Authorization: Bearer $TOKEN"
```

## Database Schema

```sql
-- Users table
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Assets table
CREATE TABLE assets (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  description TEXT,
  value DECIMAL(10,2) NOT NULL DEFAULT 0,
  max_claims INTEGER NOT NULL DEFAULT 1,
  current_claims INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  version INTEGER NOT NULL DEFAULT 1
);

-- Claims table (join table)
CREATE TABLE claims (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  asset_id INTEGER REFERENCES assets(id) ON DELETE CASCADE,
  claimed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, asset_id)
);
```

## Key Concepts

### Pessimistic Locking (Claims)

Claims use `SELECT FOR UPDATE` to prevent race conditions:

```typescript
const asset = await client.query(
  'SELECT * FROM assets WHERE id = $1 FOR UPDATE',
  [assetId]
);
```

This locks the row until the transaction completes.

### Optimistic Locking (Updates)

Updates use a version column:

```typescript
const result = await client.query(
  'UPDATE assets SET ..., version = version + 1 WHERE id = $1 AND version = $2',
  [assetId, expectedVersion]
);
```

If version doesn't match, update fails with 409 Conflict.

## Troubleshooting

### Wrong Node Version

```
SyntaxError: Unexpected token {
```

Fix: Run `nvm use` to switch to Node 20.

### Database Connection Failed

```
Error: connect ECONNREFUSED
```

Fix: Ensure PostgreSQL is running:
```bash
brew services start postgresql  # macOS
sudo systemctl start postgresql # Linux
```

### Migration Failed

```
Error: relation "users" already exists
```

Fix: Reset the database:
```bash
dropdb luarc_assets && createdb luarc_assets && npm run migrate
```

### bcrypt Architecture Error

```
Error: dlopen(...bcrypt_lib.node...) incompatible architecture
```

Fix: Already resolved - project uses bcryptjs (pure JS).

## Testing Concurrency

Open multiple terminals and run simultaneous claims:

```bash
for i in {1..20}; do
  curl -X POST http://localhost:3000/assets/1/claim \
    -H "Authorization: Bearer $TOKEN" &
done
wait
```

Check that `current_claims` never exceeds `max_claims`.

## Frontend Development

The UI is a single HTML file at `public/index.html`. No build step required.

Features:
- Auth (login/register)
- Asset pool view
- Create/edit/claim assets
- View claim history
- Console logs curl commands for debugging

## Production Build

```bash
npm run build
NODE_ENV=production npm start
```

Ensure `JWT_SECRET` is a strong random string in production.

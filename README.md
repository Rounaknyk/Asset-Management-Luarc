# Asset Management API

A REST API for managing coupons/vouchers with authenticated claims and concurrency control.

## Setup

```bash
npm install
cp .env.example .env
createdb luarc_assets
npm run migrate
npm run dev
```

## Endpoints

- `POST /auth/register` - Create account
- `POST /auth/login` - Get JWT token
- `POST /assets` - Create asset
- `POST /assets/:id/claim` - Claim asset
- `PATCH /assets/:id` - Update asset (version required)
- `GET /assets/pool` - List all assets
- `GET /assets/my-claims` - User's claims
- `GET /assets/:id/history` - Asset claim history

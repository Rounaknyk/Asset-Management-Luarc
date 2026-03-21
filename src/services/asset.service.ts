import { PoolClient } from 'pg';
import { query, queryOne, transaction } from '../config/database.js';
import { Asset, Claim, ClaimWithAsset, AssetPoolItem } from '../types/index.js';
import { broadcast } from './ws.service.js';

export async function createAsset(
  code: string,
  description: string,
  value: number,
  maxClaims: number,
  expiresAt?: Date
): Promise<Asset> {
  const assets = await query<Asset>(
    `INSERT INTO assets (code, description, value, max_claims, expires_at)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [code, description, value, maxClaims, expiresAt || null]
  );
  broadcast('asset:created', assets[0]);
  return assets[0];
}

export async function claimAsset(userId: number, assetId: number): Promise<Claim> {
  return transaction(async (client: PoolClient) => {
    const assetResult = await client.query<Asset>(
      `SELECT * FROM assets WHERE id = $1 FOR UPDATE`,
      [assetId]
    );

    const asset = assetResult.rows[0];

    if (!asset) {
      throw new Error('Asset not found');
    }

    if (asset.expires_at && new Date(asset.expires_at) < new Date()) {
      throw new Error('Asset has expired');
    }

    if (asset.current_claims >= asset.max_claims) {
      throw new Error('No claims remaining');
    }

    const existingClaim = await client.query(
      'SELECT id FROM claims WHERE user_id = $1 AND asset_id = $2',
      [userId, assetId]
    );

    if (existingClaim.rows.length > 0) {
      throw new Error('Asset already claimed by user');
    }

    await client.query(
      `UPDATE assets SET current_claims = current_claims + 1, version = version + 1
       WHERE id = $1`,
      [assetId]
    );

    const claimResult = await client.query<Claim>(
      'INSERT INTO claims (user_id, asset_id) VALUES ($1, $2) RETURNING *',
      [userId, assetId]
    );

    const updatedAsset = await client.query<Asset>(
      'SELECT * FROM assets WHERE id = $1',
      [assetId]
    );
    broadcast('asset:claimed', { claim: claimResult.rows[0], asset: updatedAsset.rows[0] });

    return claimResult.rows[0];
  });
}

export async function updateAsset(
  assetId: number,
  updates: Partial<Pick<Asset, 'description' | 'value' | 'max_claims' | 'expires_at'>>,
  expectedVersion: number
): Promise<Asset> {
  return transaction(async (client: PoolClient) => {
    const result = await client.query<Asset>(
      `UPDATE assets
       SET description = COALESCE($1, description),
           value = COALESCE($2, value),
           max_claims = COALESCE($3, max_claims),
           expires_at = COALESCE($4, expires_at),
           version = version + 1
       WHERE id = $5 AND version = $6
       RETURNING *`,
      [
        updates.description ?? null,
        updates.value ?? null,
        updates.max_claims ?? null,
        updates.expires_at ?? null,
        assetId,
        expectedVersion
      ]
    );

    if (result.rows.length === 0) {
      const exists = await client.query('SELECT id FROM assets WHERE id = $1', [assetId]);
      if (exists.rows.length === 0) {
        throw new Error('Asset not found');
      }
      throw new Error('Concurrent modification detected');
    }

    broadcast('asset:updated', result.rows[0]);
    return result.rows[0];
  });
}

export async function getAssetById(id: number): Promise<Asset | null> {
  return queryOne<Asset>('SELECT * FROM assets WHERE id = $1', [id]);
}

export async function getUserClaims(userId: number): Promise<ClaimWithAsset[]> {
  return query<ClaimWithAsset>(
    `SELECT c.*, a.code as asset_code, a.description as asset_description, a.value as asset_value
     FROM claims c
     JOIN assets a ON c.asset_id = a.id
     WHERE c.user_id = $1
     ORDER BY c.claimed_at DESC`,
    [userId]
  );
}

export async function getAssetPool(
  filters?: { available?: boolean; minValue?: number; maxValue?: number }
): Promise<AssetPoolItem[]> {
  let sql = `
    SELECT *,
           (current_claims < max_claims AND (expires_at IS NULL OR expires_at > NOW())) as is_available,
           (max_claims - current_claims) as remaining_claims
    FROM assets
    WHERE 1=1
  `;
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters?.available === true) {
    sql += ` AND current_claims < max_claims AND (expires_at IS NULL OR expires_at > NOW())`;
  }

  if (filters?.minValue !== undefined) {
    sql += ` AND value >= $${paramIndex++}`;
    params.push(filters.minValue);
  }

  if (filters?.maxValue !== undefined) {
    sql += ` AND value <= $${paramIndex++}`;
    params.push(filters.maxValue);
  }

  sql += ' ORDER BY created_at DESC';

  return query<AssetPoolItem>(sql, params);
}

export async function getAssetClaimHistory(assetId: number): Promise<{
  asset: Asset;
  claims: Array<{ user_id: number; user_email: string; claimed_at: Date }>;
}> {
  const asset = await getAssetById(assetId);

  if (!asset) {
    throw new Error('Asset not found');
  }

  const claims = await query<{ user_id: number; user_email: string; claimed_at: Date }>(
    `SELECT c.user_id, u.email as user_email, c.claimed_at
     FROM claims c
     JOIN users u ON c.user_id = u.id
     WHERE c.asset_id = $1
     ORDER BY c.claimed_at DESC`,
    [assetId]
  );

  return { asset, claims };
}

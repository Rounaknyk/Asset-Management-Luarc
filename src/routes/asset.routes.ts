import { Router, Response } from 'express';
import { z } from 'zod';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import {
  createAsset,
  claimAsset,
  updateAsset,
  getAssetById,
  getUserClaims,
  getAssetPool,
  getAssetClaimHistory
} from '../services/asset.service.js';

const router = Router();

const CreateAssetSchema = z.object({
  code: z.string().min(1).max(50),
  description: z.string(),
  value: z.number().positive(),
  maxClaims: z.number().int().positive(),
  expiresAt: z.string().datetime().optional()
});

const UpdateAssetSchema = z.object({
  description: z.string().optional(),
  value: z.number().positive().optional(),
  maxClaims: z.number().int().positive().optional(),
  expiresAt: z.string().datetime().optional(),
  version: z.number().int().positive()
});

const PoolQuerySchema = z.object({
  available: z.enum(['true', 'false']).optional(),
  minValue: z.string().optional(),
  maxValue: z.string().optional()
});

router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const data = CreateAssetSchema.parse(req.body);
    const asset = await createAsset(
      data.code,
      data.description,
      data.value,
      data.maxClaims,
      data.expiresAt ? new Date(data.expiresAt) : undefined
    );
    res.status(201).json(asset);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    const message = err instanceof Error ? err.message : 'Failed to create asset';
    const status = message.includes('duplicate') ? 409 : 500;
    res.status(status).json({ error: message });
  }
});

router.post('/:id/claim', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const assetId = parseInt(req.params.id, 10);

    if (isNaN(assetId)) {
      res.status(400).json({ error: 'Invalid asset ID' });
      return;
    }

    const claim = await claimAsset(req.user!.userId, assetId);
    res.status(201).json(claim);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Claim failed';
    let status = 500;

    if (message === 'Asset not found') status = 404;
    else if (message === 'Asset has expired') status = 410;
    else if (message === 'No claims remaining') status = 409;
    else if (message === 'Asset already claimed by user') status = 409;

    res.status(status).json({ error: message });
  }
});

router.patch('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const assetId = parseInt(req.params.id, 10);

    if (isNaN(assetId)) {
      res.status(400).json({ error: 'Invalid asset ID' });
      return;
    }

    const data = UpdateAssetSchema.parse(req.body);
    const { version, ...updates } = data;

    const asset = await updateAsset(
      assetId,
      {
        ...updates,
        expires_at: updates.expiresAt ? new Date(updates.expiresAt) : undefined
      },
      version
    );
    res.json(asset);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: err.errors });
      return;
    }
    const message = err instanceof Error ? err.message : 'Update failed';
    let status = 500;

    if (message === 'Asset not found') status = 404;
    else if (message === 'Concurrent modification detected') status = 409;

    res.status(status).json({ error: message });
  }
});

router.get('/pool', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const query = PoolQuerySchema.parse(req.query);
    const assets = await getAssetPool({
      available: query.available === 'true' ? true : query.available === 'false' ? false : undefined,
      minValue: query.minValue ? parseFloat(query.minValue) : undefined,
      maxValue: query.maxValue ? parseFloat(query.maxValue) : undefined
    });
    res.json(assets);
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid query parameters', details: err.errors });
      return;
    }
    res.status(500).json({ error: 'Failed to fetch asset pool' });
  }
});

router.get('/my-claims', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const claims = await getUserClaims(req.user!.userId);
    res.json(claims);
  } catch {
    res.status(500).json({ error: 'Failed to fetch claims' });
  }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const assetId = parseInt(req.params.id, 10);

    if (isNaN(assetId)) {
      res.status(400).json({ error: 'Invalid asset ID' });
      return;
    }

    const asset = await getAssetById(assetId);

    if (!asset) {
      res.status(404).json({ error: 'Asset not found' });
      return;
    }

    res.json(asset);
  } catch {
    res.status(500).json({ error: 'Failed to fetch asset' });
  }
});

router.get('/:id/history', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const assetId = parseInt(req.params.id, 10);

    if (isNaN(assetId)) {
      res.status(400).json({ error: 'Invalid asset ID' });
      return;
    }

    const history = await getAssetClaimHistory(assetId);
    res.json(history);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch history';
    const status = message === 'Asset not found' ? 404 : 500;
    res.status(status).json({ error: message });
  }
});

export default router;

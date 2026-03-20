export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: Date;
}

export interface Asset {
  id: number;
  code: string;
  description: string;
  value: number;
  max_claims: number;
  current_claims: number;
  expires_at: Date | null;
  created_at: Date;
  version: number;
}

export interface Claim {
  id: number;
  user_id: number;
  asset_id: number;
  claimed_at: Date;
}

export interface ClaimWithAsset extends Claim {
  asset_code: string;
  asset_description: string;
  asset_value: number;
}

export interface AssetPoolItem extends Asset {
  is_available: boolean;
  remaining_claims: number;
}

export interface AuthPayload {
  userId: number;
  email: string;
}

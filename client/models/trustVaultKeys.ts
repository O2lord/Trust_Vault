export interface TrustVaultKey {
  id: string;
  keyId: string;
  encryptionKey: string | null;
  trustVaultPubkey: string | null;
  sellerPubkey: string | null; 
  status: 'pending' | 'active' | 'destroyed';
  iv: string;
  tag: string;
  createdAt: Date;
  associatedAt: Date | null;
  destroyedAt: Date | null;
  accessCount: number;
  lastAccessedAt: Date | null;
}

export interface CreateTrustVaultKeyInput {
  keyId: string;
  encryptionKey: string;
  iv: string;
  tag: string;
}

export interface AssociateKeyInput {
  keyId: string;
  trustVaultPubkey?: string; // Optional for direct seller association
  sellerPubkey?: string; // NEW: Optional seller public key
}

export interface DestroyKeyInput {
  trustVaultPubkey?: string; // Optional - can destroy by vault or seller
  sellerPubkey?: string; // NEW: Optional - can destroy by seller
  reason?: string;
}

export interface RetrieveKeyInput {
  trustVaultPubkey?: string; // Optional - for vault-specific lookup
  sellerPubkey?: string; // NEW: Optional - for seller-specific lookup
}

// Database operations interface
export interface TrustVaultKeyRepository {
  create(input: CreateTrustVaultKeyInput): Promise<TrustVaultKey>;
  findByKeyId(keyId: string): Promise<TrustVaultKey | null>;
  findByTrustVaultPubkey(pubkey: string): Promise<TrustVaultKey | null>;
  findBySellerPubkey(pubkey: string): Promise<TrustVaultKey[]>; // NEW: Find by seller
  findByVaultAndSeller(vaultPubkey: string, sellerPubkey: string): Promise<TrustVaultKey | null>; // NEW: Specific lookup
  findAllByTrustVaultPubkey(pubkey: string): Promise<TrustVaultKey[]>;
  associate(input: AssociateKeyInput): Promise<TrustVaultKey>;
  destroy(input: DestroyKeyInput): Promise<void>;
  incrementAccessCount(keyId: string): Promise<void>;
  findExpiredKeys(olderThanDays: number): Promise<TrustVaultKey[]>;
  hardDelete(keyId: string): Promise<void>;
}


export class MockTrustVaultKeyRepository implements TrustVaultKeyRepository {
  private keys: Map<string, TrustVaultKey> = new Map();

  async create(input: CreateTrustVaultKeyInput): Promise<TrustVaultKey> {
    const key: TrustVaultKey = {
      id: `id_${Date.now()}`,
      keyId: input.keyId,
      encryptionKey: input.encryptionKey,
      trustVaultPubkey: null,
      sellerPubkey: null, 
      status: 'pending',
      iv: input.iv,
      tag: input.tag,
      createdAt: new Date(),
      associatedAt: null,
      destroyedAt: null,
      accessCount: 0,
      lastAccessedAt: null,
    };
    
    this.keys.set(input.keyId, key);
    return key;
  }

  async findByKeyId(keyId: string): Promise<TrustVaultKey | null> {
    return this.keys.get(keyId) || null;
  }

  async findByTrustVaultPubkey(pubkey: string): Promise<TrustVaultKey | null> {
    for (const key of this.keys.values()) {
      // For sell orders: match vault pubkey with no seller pubkey
      if (key.trustVaultPubkey === pubkey && key.status === 'active' && !key.sellerPubkey) {
        return key;
      }
    }
    return null;
  }

  async findBySellerPubkey(pubkey: string): Promise<TrustVaultKey[]> {
    const result: TrustVaultKey[] = [];
    for (const key of this.keys.values()) {
      if (key.sellerPubkey === pubkey && key.status === 'active') {
        result.push(key);
      }
    }
    return result;
  }

  async findByVaultAndSeller(vaultPubkey: string, sellerPubkey: string): Promise<TrustVaultKey | null> {
    for (const key of this.keys.values()) {
      if (key.trustVaultPubkey === vaultPubkey && 
          key.sellerPubkey === sellerPubkey && 
          key.status === 'active') {
        return key;
      }
    }
    return null;
  }

  async findAllByTrustVaultPubkey(pubkey: string): Promise<TrustVaultKey[]> {
    const result: TrustVaultKey[] = [];
    for (const key of this.keys.values()) {
      if (key.trustVaultPubkey === pubkey) {
        result.push(key);
      }
    }
    return result;
  }

  async associate(input: AssociateKeyInput): Promise<TrustVaultKey> {
    const key = this.keys.get(input.keyId);
    if (!key) {
      throw new Error('Key not found');
    }
    
    key.trustVaultPubkey = input.trustVaultPubkey || null;
    key.sellerPubkey = input.sellerPubkey || null; // NEW
    key.status = 'active';
    key.associatedAt = new Date();
    
    return key;
  }

  async destroy(input: DestroyKeyInput): Promise<void> {
    for (const key of this.keys.values()) {
      let shouldDestroy = false;
      
      if (input.trustVaultPubkey && input.sellerPubkey) {
        // Destroy specific vault-seller combination
        shouldDestroy = key.trustVaultPubkey === input.trustVaultPubkey && 
                      key.sellerPubkey === input.sellerPubkey;
      } else if (input.trustVaultPubkey) {
        // Destroy by vault (sell orders)
        shouldDestroy = key.trustVaultPubkey === input.trustVaultPubkey && !key.sellerPubkey;
      } else if (input.sellerPubkey) {
        // Destroy all keys for a seller
        shouldDestroy = key.sellerPubkey === input.sellerPubkey;
      }
      
      if (shouldDestroy) {
        key.encryptionKey = null;
        key.status = 'destroyed';
        key.destroyedAt = new Date();
      }
    }
  }

  async incrementAccessCount(keyId: string): Promise<void> {
    const key = this.keys.get(keyId);
    if (key) {
      key.accessCount++;
      key.lastAccessedAt = new Date();
    }
  }

  async findExpiredKeys(olderThanDays: number): Promise<TrustVaultKey[]> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    return Array.from(this.keys.values()).filter(
      key => key.status === 'destroyed' && 
             key.destroyedAt && 
             key.destroyedAt < cutoffDate
    );
  }

  async hardDelete(keyId: string): Promise<void> {
    this.keys.delete(keyId);
  }
}

// Singleton instance for development
export const trustVaultKeyRepository = new MockTrustVaultKeyRepository();
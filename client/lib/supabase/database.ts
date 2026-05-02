import { supabaseAdmin } from './client'
import type { 
  TrustVaultKey, 
  CreateTrustVaultKeyInput, 
  AssociateKeyInput, 
  DestroyKeyInput,
  TrustVaultKeyRepository 
} from '../../models/trustVaultKeys'

// Interface for database row structure
interface TrustVaultKeyRow {
  id: string;
  key_id: string;
  encryption_key: string | null;
  trust_vault_pubkey: string | null;
  seller_pubkey: string | null;
  status: 'pending' | 'active' | 'destroyed';
  iv: string;
  tag: string;
  created_at: string;
  associated_at: string | null;
  destroyed_at: string | null;
  access_count: number | null;
  last_accessed_at: string | null;
}

// Interface for update data in associate method
interface UpdateKeyData {
  status: 'active';
  associated_at: string;
  trust_vault_pubkey?: string;
  seller_pubkey?: string;
}

/**
 * Supabase implementation of TrustVaultKeyRepository
 */
export class SupabaseTrustVaultKeyRepository implements TrustVaultKeyRepository {
  
  async create(input: CreateTrustVaultKeyInput): Promise<TrustVaultKey> {
    const { data, error } = await supabaseAdmin
      .from('trust_vault_keys')
      .insert({
        key_id: input.keyId,
        encryption_key: input.encryptionKey,
        iv: input.iv,
        tag: input.tag,
        status: 'pending'
      })
      .select()
      .single()

    if (error) {
      console.error('Database error creating key:', error)
      throw new Error(`Failed to create encryption key: ${error.message}`)
    }

    return this.mapToTrustVaultKey(data)
  }

  async findByKeyId(keyId: string): Promise<TrustVaultKey | null> {
    const { data, error } = await supabaseAdmin
      .from('trust_vault_keys')
      .select('*')
      .eq('key_id', keyId)
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      console.error('Database error finding key by ID:', error)
      throw new Error(`Failed to find key: ${error.message}`)
    }

    return this.mapToTrustVaultKey(data)
  }

  async findByTrustVaultPubkey(pubkey: string): Promise<TrustVaultKey | null> {
    // For sell orders: find keys with vault pubkey but NO seller pubkey
    const { data, error } = await supabaseAdmin
      .from('trust_vault_keys')
      .select('*')
      .eq('trust_vault_pubkey', pubkey)
      .is('seller_pubkey', null) // NEW: Ensure this is a sell order key
      .eq('status', 'active')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      console.error('Database error finding key by pubkey:', error)
      throw new Error(`Failed to find key: ${error.message}`)
    }

    return this.mapToTrustVaultKey(data)
  }

  async findBySellerPubkey(pubkey: string): Promise<TrustVaultKey[]> {
    const { data, error } = await supabaseAdmin
      .from('trust_vault_keys')
      .select('*')
      .eq('seller_pubkey', pubkey)
      .eq('status', 'active')

    if (error) {
      console.error('Database error finding keys by seller pubkey:', error)
      throw new Error(`Failed to find keys: ${error.message}`)
    }

    return data.map(this.mapToTrustVaultKey)
  }

  async findByVaultAndSeller(vaultPubkey: string, sellerPubkey: string): Promise<TrustVaultKey | null> {
    const { data, error } = await supabaseAdmin
      .from('trust_vault_keys')
      .select('*')
      .eq('trust_vault_pubkey', vaultPubkey)
      .eq('seller_pubkey', sellerPubkey)
      .eq('status', 'active')
      .single()

    if (error) {
      if (error.code === 'PGRST116') {
        return null // Not found
      }
      console.error('Database error finding key by vault and seller:', error)
      throw new Error(`Failed to find key: ${error.message}`)
    }

    return this.mapToTrustVaultKey(data)
  }

  async findAllByTrustVaultPubkey(pubkey: string): Promise<TrustVaultKey[]> {
    const { data, error } = await supabaseAdmin
      .from('trust_vault_keys')
      .select('*')
      .eq('trust_vault_pubkey', pubkey)

    if (error) {
      console.error('Database error finding all keys by pubkey:', error)
      throw new Error(`Failed to find keys: ${error.message}`)
    }

    return data.map(this.mapToTrustVaultKey)
  }

  async associate(input: AssociateKeyInput): Promise<TrustVaultKey> {
    const updateData: UpdateKeyData = {
      status: 'active',
      associated_at: new Date().toISOString()
    }

    // Set trust_vault_pubkey if provided
    if (input.trustVaultPubkey) {
      updateData.trust_vault_pubkey = input.trustVaultPubkey
    }

    // Set seller_pubkey if provided
    if (input.sellerPubkey) {
      updateData.seller_pubkey = input.sellerPubkey
    }

    const { data, error } = await supabaseAdmin
      .from('trust_vault_keys')
      .update(updateData)
      .eq('key_id', input.keyId)
      .eq('status', 'pending')
      .select()
      .single()

    if (error) {
      console.error('Database error associating key:', error)
      throw new Error(`Failed to associate key: ${error.message}`)
    }

    if (!data) {
      throw new Error('Key not found or not in pending status')
    }

    return this.mapToTrustVaultKey(data)
  }

  async destroy(input: DestroyKeyInput): Promise<void> {
    let query = supabaseAdmin
      .from('trust_vault_keys')
      .update({
        encryption_key: null,
        status: 'destroyed',
        destroyed_at: new Date().toISOString()
      })

    // Build the where clause based on input
    if (input.trustVaultPubkey && input.sellerPubkey) {
      // Destroy specific vault-seller combination
      query = query
        .eq('trust_vault_pubkey', input.trustVaultPubkey)
        .eq('seller_pubkey', input.sellerPubkey)
    } else if (input.trustVaultPubkey) {
      // Destroy by vault (sell orders - no seller pubkey)
      query = query
        .eq('trust_vault_pubkey', input.trustVaultPubkey)
        .is('seller_pubkey', null)
    } else if (input.sellerPubkey) {
      // Destroy all keys for a seller
      query = query.eq('seller_pubkey', input.sellerPubkey)
    } else {
      throw new Error('Must provide either trustVaultPubkey or sellerPubkey for destruction')
    }

    query = query.eq('status', 'active')

    const { data, error } = await query.select()

    if (error) {
      console.error('Database error destroying key:', error)
      throw new Error(`Failed to destroy key: ${error.message}`)
    }

    if (data && data.length > 0) {
      // Keys destroyed successfully
    }
  }

  async incrementAccessCount(keyId: string): Promise<void> {
    // First, get the current access count
    const { data: currentData, error: fetchError } = await supabaseAdmin
      .from('trust_vault_keys')
      .select('access_count')
      .eq('key_id', keyId)
      .single()

    if (fetchError) {
      console.error('Database error fetching current access count:', fetchError)
      // Don't throw error for access count updates
      return
    }

    // Increment the access count
    const newAccessCount = (currentData?.access_count || 0) + 1

    // Update with the new count
    const { error } = await supabaseAdmin
      .from('trust_vault_keys')
      .update({
        access_count: newAccessCount,
        last_accessed_at: new Date().toISOString()
      })
      .eq('key_id', keyId)

    if (error) {
      console.error('Database error incrementing access count:', error)
      // Don't throw error for access count updates
    }
  }

  async findExpiredKeys(olderThanDays: number): Promise<TrustVaultKey[]> {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    const { data, error } = await supabaseAdmin
      .from('trust_vault_keys')
      .select('*')
      .eq('status', 'destroyed')
      .not('destroyed_at', 'is', null)
      .lt('destroyed_at', cutoffDate.toISOString())

    if (error) {
      console.error('Database error finding expired keys:', error)
      throw new Error(`Failed to find expired keys: ${error.message}`)
    }

    return data.map(this.mapToTrustVaultKey)
  }

  async hardDelete(keyId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('trust_vault_keys')
      .delete()
      .eq('key_id', keyId)

    if (error) {
      console.error('Database error deleting key:', error)
      throw new Error(`Failed to delete key: ${error.message}`)
    }
  }

  private mapToTrustVaultKey(data: TrustVaultKeyRow): TrustVaultKey {
    return {
      id: data.id,
      keyId: data.key_id,
      encryptionKey: data.encryption_key,
      trustVaultPubkey: data.trust_vault_pubkey,
      sellerPubkey: data.seller_pubkey,
      status: data.status,
      iv: data.iv,
      tag: data.tag,
      createdAt: new Date(data.created_at),
      associatedAt: data.associated_at ? new Date(data.associated_at) : null,
      destroyedAt: data.destroyed_at ? new Date(data.destroyed_at) : null,
      accessCount: data.access_count || 0,
      lastAccessedAt: data.last_accessed_at ? new Date(data.last_accessed_at) : null
    }
  }
}

// Export singleton instance
export const trustVaultKeyRepository = new SupabaseTrustVaultKeyRepository()
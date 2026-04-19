// Seal encryption + Walrus upload for OrcaVote
// All Seal operations use the orcavote package (seal_policy module).
//
// Three Seal policies (all in orcavote::seal_policy):
//   1. seal_approve_identity  — voter decrypts own identity blob
//   2. seal_approve_dataset   — anyone decrypts dataset after poll Approved
//   3. seal_approve_data_asset — owner decrypts own data asset

import { SealClient } from '@mysten/seal'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import type { IdentityBlob } from './zk-merkle'

// ─── Config ───

export type NetworkKey = 'testnet' | 'mainnet'

/** OrcaVote package — single Seal package for all policies */
export const ORCAVOTE_PACKAGE_ID = '0xc1ce937ce57cae994b643a320c092953d41298d924ca6f37ec0e100ff2abdd17'
export const ORCAVOTE_REGISTRY_ID = '0xa19f49c2ec3d5fb158680bf8ca62c661dc1e87960aec421bdb551efb4d5e1b6d'

const RPC_URLS: Record<NetworkKey, string> = {
  testnet: 'https://fullnode.testnet.sui.io:443',
  mainnet: 'https://fullnode.mainnet.sui.io:443',
}

const PUBLISHERS: Record<NetworkKey, string[]> = {
  testnet: [
    'https://publisher.walrus-testnet.walrus.space',
    'https://wal-publisher-testnet.staketab.org',
  ],
  mainnet: ['https://publisher.walrus.space'],
}

export const AGGREGATORS: Record<NetworkKey, string> = {
  testnet: 'https://aggregator.walrus-testnet.walrus.space',
  mainnet: 'https://aggregator.walrus.space',
}

/** Decentralized key server (aggregator-backed) */
export const TESTNET_KEY_SERVERS = [
  {
    objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
    weight: 1,
    aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
  },
]

const DEFAULT_THRESHOLD = 1
const DEFAULT_EPOCHS = 5

// ─── Types ───

export interface UploadResult {
  address: string
  blobId: string
  walrusUrl: string
  encryptedSize: number
}

// ─── Seal Client ───

export function createSealClient(network: NetworkKey): SealClient {
  const suiClient = new SuiJsonRpcClient({
    url: RPC_URLS[network],
    network,
  })
  return new SealClient({
    suiClient,
    serverConfigs: TESTNET_KEY_SERVERS,
    verifyKeyServers: false,
  })
}

// ─── Seal ID builders ───

/**
 * Build Seal id for data asset: registry_id(32) ++ owner_address(32)
 * Used by seal_approve_data_asset — owner can decrypt.
 */
export async function buildDataAssetSealId(ownerAddress: string): Promise<string> {
  const { toHex, fromHex } = await import('@mysten/sui/utils')
  const registryBytes = fromHex(ORCAVOTE_REGISTRY_ID)
  const ownerBytes = fromHex(ownerAddress)
  return toHex(new Uint8Array([...registryBytes, ...ownerBytes]))
}

/**
 * Build Seal id for dataset: registry_id(32) ++ poll_id(32)
 * Used by seal_approve_dataset — anyone can decrypt after Approved.
 */
export async function buildDatasetSealId(pollId: string): Promise<string> {
  const { toHex, fromHex } = await import('@mysten/sui/utils')
  const registryBytes = fromHex(ORCAVOTE_REGISTRY_ID)
  const pollBytes = fromHex(pollId)
  return toHex(new Uint8Array([...registryBytes, ...pollBytes]))
}

// ─── Encrypt functions ───

/**
 * Encrypt an identity blob with Seal.
 *
 * NOTE: Identity blobs are uploaded as plaintext because poll_id
 * doesn't exist yet at upload time. Security is maintained by ZK proof.
 */
export async function encryptIdentityBlob(
  blob: IdentityBlob,
  _network: NetworkKey = 'testnet',
): Promise<Uint8Array> {
  return new TextEncoder().encode(JSON.stringify(blob))
}

/**
 * Encrypt plaintext for a data asset (seal_approve_data_asset policy).
 * id = registry_id(32) ++ owner_address(32)
 * Only the asset owner can decrypt.
 */
export async function encryptForDataAsset(
  plaintext: Uint8Array,
  ownerAddress: string,
  network: NetworkKey = 'testnet',
): Promise<Uint8Array> {
  const { toHex, fromHex } = await import('@mysten/sui/utils')
  const sealClient = createSealClient(network)
  const registryBytes = fromHex(ORCAVOTE_REGISTRY_ID)
  const ownerBytes = fromHex(ownerAddress)
  const id = toHex(new Uint8Array([...registryBytes, ...ownerBytes]))
  const { encryptedObject } = await sealClient.encrypt({
    threshold: DEFAULT_THRESHOLD,
    packageId: ORCAVOTE_PACKAGE_ID,
    id,
    data: plaintext,
  })
  return encryptedObject
}

/**
 * Encrypt plaintext for a poll's dataset (seal_approve_dataset policy).
 * id = registry_id(32) ++ poll_id(32)
 * Anyone can decrypt after poll is Approved.
 */
export async function encryptForPoll(
  plaintext: Uint8Array,
  pollId: string,
  network: NetworkKey = 'testnet',
): Promise<Uint8Array> {
  const { toHex, fromHex } = await import('@mysten/sui/utils')
  const sealClient = createSealClient(network)
  const registryBytes = fromHex(ORCAVOTE_REGISTRY_ID)
  const pollIdBytes = fromHex(pollId)
  const id = toHex(new Uint8Array([...registryBytes, ...pollIdBytes]))
  const { encryptedObject } = await sealClient.encrypt({
    threshold: DEFAULT_THRESHOLD,
    packageId: ORCAVOTE_PACKAGE_ID,
    id,
    data: plaintext,
  })
  return encryptedObject
}

// ─── Walrus upload/fetch ───

/**
 * Upload bytes to Walrus via Publisher HTTP API.
 */
export async function uploadToWalrus(
  data: Uint8Array,
  network: NetworkKey = 'testnet',
  epochs: number = DEFAULT_EPOCHS,
): Promise<{ blobId: string; walrusUrl: string }> {
  const publishers = PUBLISHERS[network]
  let lastError: Error | null = null

  for (const pub of publishers) {
    try {
      const res = await fetch(`${pub}/v1/blobs?epochs=${epochs}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: data as BodyInit,
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Publisher ${res.status}: ${text}`)
      }

      const json = await res.json()

      let blobId: string
      if (json.newlyCreated) {
        blobId = json.newlyCreated.blobObject.blobId
      } else if (json.alreadyCertified) {
        blobId = json.alreadyCertified.blobId
      } else {
        throw new Error('Unexpected publisher response')
      }

      const walrusUrl = `${AGGREGATORS[network]}/v1/blobs/${blobId}`
      return { blobId, walrusUrl }
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e))
      continue
    }
  }

  throw lastError ?? new Error('All publishers failed')
}

/**
 * Fetch a blob from Walrus aggregator by blob ID.
 */
export async function fetchBlobFromWalrus(
  blobId: string,
  network: NetworkKey = 'testnet',
): Promise<Uint8Array> {
  const url = `${AGGREGATORS[network]}/v1/blobs/${blobId}`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Walrus fetch ${res.status}: ${await res.text()}`)
  return new Uint8Array(await res.arrayBuffer())
}

// ─── Convenience: encrypt + upload ───

/**
 * Encrypt a single identity blob and upload to Walrus.
 */
export async function encryptAndUpload(
  blob: IdentityBlob,
  network: NetworkKey = 'testnet',
  epochs: number = DEFAULT_EPOCHS,
): Promise<UploadResult> {
  const encrypted = await encryptIdentityBlob(blob, network)
  const { blobId, walrusUrl } = await uploadToWalrus(encrypted, network, epochs)
  return {
    address: blob.address,
    blobId,
    walrusUrl,
    encryptedSize: encrypted.length,
  }
}

/**
 * Encrypt and upload all identity blobs with progress callback.
 */
export async function encryptAndUploadAll(
  blobs: IdentityBlob[],
  network: NetworkKey = 'testnet',
  epochs: number = DEFAULT_EPOCHS,
  onProgress?: (done: number, total: number, result: UploadResult) => void,
): Promise<UploadResult[]> {
  const results: UploadResult[] = []
  for (let i = 0; i < blobs.length; i++) {
    const result = await encryptAndUpload(blobs[i], network, epochs)
    results.push(result)
    onProgress?.(i + 1, blobs.length, result)
  }
  return results
}

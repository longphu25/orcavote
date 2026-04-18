// Seal encryption + Walrus upload for OrcaVote identity blobs
// Each identity blob is encrypted with Seal so only the target voter can decrypt it,
// then uploaded to Walrus via the Publisher HTTP API.

import { SealClient } from '@mysten/seal'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import type { IdentityBlob } from './zk-merkle'

// ─── Config ───

export type NetworkKey = 'testnet' | 'mainnet'

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

/** Seal demo package on testnet (allowlist-based policy) */
const SEAL_PACKAGE_ID = '0x2b5472a9002d97045c8448cda76284aa0de81df3ab902fdfc785feaa2c0b4cc0'

/** Decentralized key server (aggregator-backed) */
const TESTNET_KEY_SERVERS = [
  {
    objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
    weight: 1,
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

// ─── Core functions ───

function createSealClient(network: NetworkKey): SealClient {
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

/**
 * Encrypt an identity blob with Seal.
 * The identity is derived from the voter's address so only they can decrypt.
 */
export async function encryptIdentityBlob(
  blob: IdentityBlob,
  network: NetworkKey = 'testnet',
): Promise<Uint8Array> {
  const sealClient = createSealClient(network)
  const plaintext = new TextEncoder().encode(JSON.stringify(blob))

  // Use the voter address as the Seal identity — only this address can request decryption
  const id = blob.address

  const { encryptedObject } = await sealClient.encrypt({
    threshold: DEFAULT_THRESHOLD,
    packageId: SEAL_PACKAGE_ID,
    id,
    data: plaintext,
  })

  return encryptedObject
}

/**
 * Upload encrypted bytes to Walrus via Publisher HTTP API.
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

      // Response can be newlyCreated or alreadyCertified
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
      continue // try next publisher
    }
  }

  throw lastError ?? new Error('All publishers failed')
}

/**
 * Encrypt a single identity blob with Seal and upload to Walrus.
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
 * Encrypt and upload all identity blobs.
 * Calls onProgress for each completed upload.
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

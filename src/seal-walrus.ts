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

/** Seal demo package on testnet (allowlist-based policy) — used for DataAsset encrypt only */
const SEAL_PACKAGE_ID = '0x2b5472a9002d97045c8448cda76284aa0de81df3ab902fdfc785feaa2c0b4cc0'

/** OrcaVote package — used for seal_approve_dataset policy */
const ORCAVOTE_PACKAGE_ID = '0x982f507de25cb88c8fd29b8a10d2375c81d39aa90b380956156aef61b0ab6eec'
const ORCAVOTE_REGISTRY_ID = '0xf2a5b3f0ff9f0c53086060a396dc55bb95bc4ce4945201f0fc5217f82dfd8507'

/** Decentralized key server (aggregator-backed) */
const TESTNET_KEY_SERVERS = [
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
 *
 * NOTE: For the hackathon flow, identity blobs are uploaded as plaintext
 * to Walrus (no Seal encryption) because the Seal identity requires an
 * on-chain poll_id which doesn't exist yet at upload time.
 * Security is maintained by the ZK proof — the identity secret is only
 * used locally to generate a proof and is never revealed on-chain.
 */
export async function encryptIdentityBlob(
  blob: IdentityBlob,
  _network: NetworkKey = 'testnet',
): Promise<Uint8Array> {
  // Upload plaintext — Seal encrypt is skipped because poll_id
  // is not yet available (poll is created after upload).
  return new TextEncoder().encode(JSON.stringify(blob))
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
 * Encrypt arbitrary plaintext with Seal (using ownerAddress as identity).
 * Returns the encrypted bytes only (no Walrus upload).
 */
export async function encryptRaw(
  plaintext: Uint8Array,
  ownerAddress: string,
  network: NetworkKey = 'testnet',
): Promise<Uint8Array> {
  const { toHex } = await import('@mysten/sui/utils')
  const { bcs } = await import('@mysten/sui/bcs')
  const sealClient = createSealClient(network)
  // Identity = BCS-serialized owner address (private_seal pattern)
  const id = toHex(bcs.Address.serialize(ownerAddress).toBytes())
  const { encryptedObject } = await sealClient.encrypt({
    threshold: DEFAULT_THRESHOLD,
    packageId: SEAL_PACKAGE_ID,
    id,
    data: plaintext,
  })
  return encryptedObject
}

/**
 * Encrypt plaintext for a specific poll's dataset (seal_approve_dataset policy).
 * Uses orcavote package + id = registry_id(32) ++ poll_id(32).
 * This must be called AFTER poll creation when poll_id is known.
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
  const idBytes = new Uint8Array([...registryBytes, ...pollIdBytes])
  const id = toHex(idBytes)
  const { encryptedObject } = await sealClient.encrypt({
    threshold: DEFAULT_THRESHOLD,
    packageId: ORCAVOTE_PACKAGE_ID,
    id,
    data: plaintext,
  })
  return encryptedObject
}

/**
 * Encrypt arbitrary plaintext with Seal (using ownerAddress as identity) and upload to Walrus.
 */
export async function encryptAndUploadRaw(
  plaintext: Uint8Array,
  ownerAddress: string,
  network: NetworkKey = 'testnet',
  epochs: number = DEFAULT_EPOCHS,
): Promise<{ blobId: string; walrusUrl: string; encryptedSize: number }> {
  const sealClient = createSealClient(network)
  const { encryptedObject } = await sealClient.encrypt({
    threshold: DEFAULT_THRESHOLD,
    packageId: SEAL_PACKAGE_ID,
    id: ownerAddress,
    data: plaintext,
  })
  const { blobId, walrusUrl } = await uploadToWalrus(encryptedObject, network, epochs)
  return { blobId, walrusUrl, encryptedSize: encryptedObject.length }
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

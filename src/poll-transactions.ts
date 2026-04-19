// On-chain transaction builders for OrcaVote governance
// Builds PTBs for create_poll, register_voters, start_voting

import { Transaction } from '@mysten/sui/transactions'
import { loadVkBytes } from './zk-prove'

// ─── Contract constants ───

export const PACKAGE_ID = '0x982f507de25cb88c8fd29b8a10d2375c81d39aa90b380956156aef61b0ab6eec'
export const REGISTRY_ID = '0xf2a5b3f0ff9f0c53086060a396dc55bb95bc4ce4945201f0fc5217f82dfd8507'

// ─── Helpers ───

/** Convert hex string (from WASM MerkleResult.root) to Uint8Array bytes */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex
  const bytes = new Uint8Array(clean.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

/** Convert a string to UTF-8 bytes */
function strToBytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

// ─── Types ───

export interface CreatePollParams {
  dataBlobId: string      // base64url blob ID from Walrus → convert to bytes
  dataSealIdentity: string // voter address used as Seal identity → convert to bytes
  councilRoot: string     // hex string from MerkleResult.root (LE)
  threshold: number
  votingEnd: number       // ms timestamp
  title: string
}

export interface RegisterVotersParams {
  pollId: string          // 0x... object ID from create_poll result
  voters: string[]        // address[]
  walrusBlobIds: string[] // base64url blob IDs
  sealIdentities: string[] // voter addresses used as Seal identities
}

export interface CreatePollFullParams extends CreatePollParams {
  voters: string[]
  walrusBlobIds: string[]
  sealIdentities: string[]
}

// ─── Transaction builders ───

/**
 * Build transaction for governance::create_poll.
 * Returns the Transaction — caller signs + executes via dapp-kit.
 */
export async function createPollTx(params: CreatePollParams): Promise<Transaction> {
  const vkBytes = await loadVkBytes()
  const tx = new Transaction()

  tx.moveCall({
    target: `${PACKAGE_ID}::governance::create_poll`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.vector('u8', Array.from(strToBytes(params.dataBlobId))),
      tx.pure.vector('u8', Array.from(strToBytes(params.dataSealIdentity))),
      tx.pure.vector('u8', Array.from(hexToBytes(params.councilRoot))),
      tx.pure.u64(params.threshold),
      tx.pure.u64(params.votingEnd),
      tx.pure.vector('u8', Array.from(vkBytes)),
      tx.pure.vector('u8', Array.from(strToBytes(params.title))),
    ],
  })

  return tx
}

/**
 * Build transaction for governance::register_voters (batch).
 */
export function registerVotersTx(params: RegisterVotersParams): Transaction {
  const tx = new Transaction()

  tx.moveCall({
    target: `${PACKAGE_ID}::governance::register_voters`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.id(params.pollId),
      tx.pure.vector('address', params.voters),
      tx.pure('vector<vector<u8>>', params.walrusBlobIds.map(id => Array.from(strToBytes(id)))),
      tx.pure('vector<vector<u8>>', params.sealIdentities.map(id => Array.from(strToBytes(id)))),
    ],
  })

  return tx
}

/**
 * Build transaction for governance::start_voting.
 */
export function startVotingTx(pollId: string): Transaction {
  const tx = new Transaction()

  tx.moveCall({
    target: `${PACKAGE_ID}::governance::start_voting`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.id(pollId),
    ],
  })

  return tx
}

/**
 * Build a single PTB that:
 *   1. create_poll → returns poll_id
 *   2. register_voters (using poll_id from step 1)
 *   3. start_voting (using poll_id from step 1)
 *
 * This is the preferred path — 1 transaction instead of 3.
 */
export async function createPollFullTx(params: CreatePollFullParams): Promise<Transaction> {
  const vkBytes = await loadVkBytes()
  const tx = new Transaction()

  // Step 1: create_poll → returns ID
  const pollId = tx.moveCall({
    target: `${PACKAGE_ID}::governance::create_poll`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.vector('u8', Array.from(strToBytes(params.dataBlobId))),
      tx.pure.vector('u8', Array.from(strToBytes(params.dataSealIdentity))),
      tx.pure.vector('u8', Array.from(hexToBytes(params.councilRoot))),
      tx.pure.u64(params.threshold),
      tx.pure.u64(params.votingEnd),
      tx.pure.vector('u8', Array.from(vkBytes)),
      tx.pure.vector('u8', Array.from(strToBytes(params.title))),
    ],
  })

  // Step 2: register_voters — use poll_id result from step 1
  tx.moveCall({
    target: `${PACKAGE_ID}::governance::register_voters`,
    arguments: [
      tx.object(REGISTRY_ID),
      pollId,
      tx.pure.vector('address', params.voters),
      tx.pure('vector<vector<u8>>', params.walrusBlobIds.map(id => Array.from(strToBytes(id)))),
      tx.pure('vector<vector<u8>>', params.sealIdentities.map(id => Array.from(strToBytes(id)))),
    ],
  })

  // Step 3: start_voting — use same poll_id
  tx.moveCall({
    target: `${PACKAGE_ID}::governance::start_voting`,
    arguments: [
      tx.object(REGISTRY_ID),
      pollId,
    ],
  })

  return tx
}

// ─── Event parsing ───

/** Event type for PollCreated */
const POLL_CREATED_TYPE = `${PACKAGE_ID}::registry::PollCreated`

/**
 * Parse PollCreated event from transaction effects to extract poll_id.
 * Works with the result from useSignAndExecuteTransaction.
 */
export function parsePollIdFromEvents(events: Array<{ type: string; parsedJson?: Record<string, unknown> }>): string | null {
  const evt = events.find(e => e.type === POLL_CREATED_TYPE)
  if (!evt?.parsedJson) return null
  return (evt.parsedJson.poll_id as string) ?? null
}

/** SuiScan URL for a transaction digest */
export function suiScanTxUrl(digest: string, network: string = 'testnet'): string {
  return `https://suiscan.xyz/${network}/tx/${digest}`
}

/** SuiScan URL for an object ID */
export function suiScanObjectUrl(objectId: string, network: string = 'testnet'): string {
  return `https://suiscan.xyz/${network}/object/${objectId}`
}

// ─── Submit Vote ───

export interface SubmitVoteParams {
  pollId: string
  proofBytes: Uint8Array
  publicInputsBytes: Uint8Array
  nullifier: Uint8Array
  choice: number // 0 = NO, 1 = YES
}

/**
 * Build transaction for zk_vote::submit_vote.
 * Requires Clock (0x6) for deadline check.
 */
export function submitVoteTx(params: SubmitVoteParams): Transaction {
  const tx = new Transaction()

  tx.moveCall({
    target: `${PACKAGE_ID}::zk_vote::submit_vote`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.id(params.pollId),
      tx.pure.vector('u8', Array.from(params.proofBytes)),
      tx.pure.vector('u8', Array.from(params.publicInputsBytes)),
      tx.pure.vector('u8', Array.from(params.nullifier)),
      tx.pure.u8(params.choice),
      tx.object('0x6'), // Clock
    ],
  })

  return tx
}

// ─── On-chain poll query types ───

// ─── Finalize ───

/**
 * Build transaction for governance::set_data_blob.
 * Updates the dataset blob reference after Seal-encrypting with poll identity.
 */
export function setDataBlobTx(pollId: string, dataBlobId: string, dataSealIdentity: string): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::governance::set_data_blob`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.id(pollId),
      tx.pure.vector('u8', Array.from(strToBytes(dataBlobId))),
      tx.pure.vector('u8', Array.from(strToBytes(dataSealIdentity))),
    ],
  })
  return tx
}

// ─── Finalize ───

/**
 * Build transaction for governance::finalize (permissionless, after deadline).
 */
export function finalizePollTx(pollId: string): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::governance::finalize`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.id(pollId),
      tx.object('0x6'), // Clock
    ],
  })
  return tx
}

/**
 * Build transaction for governance::admin_finalize (early termination by poll creator).
 */
export function adminFinalizePollTx(pollId: string): Transaction {
  const tx = new Transaction()
  tx.moveCall({
    target: `${PACKAGE_ID}::governance::admin_finalize`,
    arguments: [
      tx.object(REGISTRY_ID),
      tx.pure.id(pollId),
    ],
  })
  return tx
}

// ─── On-chain poll query types ───

export const STATUS_LABELS: Record<number, string> = {
  0: 'Setup',
  1: 'Voting',
  2: 'Approved',
  3: 'Rejected',
}

export const STATUS_COLORS: Record<number, string> = {
  0: '#94A3B8', // gray
  1: '#3B82F6', // blue
  2: '#10B981', // green
  3: '#EF4444', // red
}

export interface PollInfo {
  pollId: string
  title: string
  status: number
  threshold: number
  totalVoters: number
  yesCount: number
  noCount: number
  votingEnd: number
  admin: string
  councilRoot: string
  dataBlobId: string
  dataSealIdentity: string
}

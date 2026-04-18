/**
 * ZK Proof generation for OrcaVote (browser-side).
 *
 * Uses snarkjs to generate Groth16 proofs in the browser.
 * Circuit artifacts are lazy-loaded from public/zk-circuit/ only when needed.
 *
 * File sizes (tree depth 10):
 *   circuit.wasm        ~2.0 MB  (witness calculator)
 *   circuit_final.zkey  ~1.7 MB  (proving key)
 *   vk_bytes.bin          384 B  (verifying key for create_poll)
 *
 * Loading strategy:
 *   - vk_bytes.bin: fetched on demand (tiny, for create_poll)
 *   - circuit.wasm + circuit_final.zkey: fetched only when generateProof() is called
 *   - snarkjs: dynamic import() — not bundled until first use
 *   - poseidon-lite: dynamic import() — not bundled until first use
 *
 * Flow:
 *   1. loadVkBytes()     → Uint8Array for create_poll
 *   2. generateProof()   → { proof, publicInputs, nullifier } for submit_vote
 *   3. formatForSui()    → { proofBytes, publicInputsBytes, nullifier } for Move call
 */

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
const CIRCUIT_WASM = `${BASE}/zk-circuit/circuit.wasm`
const CIRCUIT_ZKEY = `${BASE}/zk-circuit/circuit_final.zkey`
const VK_BYTES_URL = `${BASE}/zk-circuit/vk_bytes.bin`

/** Tree depth must match the compiled circuit */
export const TREE_DEPTH = 10

// ═══════════════════════════════════════════════════════════════════
// VK Bytes (for create_poll) — tiny, loads instantly
// ═══════════════════════════════════════════════════════════════════

let cachedVkBytes: Uint8Array | null = null

/**
 * Load the Arkworks-serialized verifying key bytes (384 bytes).
 * Used as `vk_bytes` parameter in `governance::create_poll`.
 * Static file — same for all polls using this circuit.
 */
export async function loadVkBytes(): Promise<Uint8Array> {
  if (cachedVkBytes) return cachedVkBytes
  const resp = await fetch(VK_BYTES_URL)
  if (!resp.ok) throw new Error(`Failed to load vk_bytes: ${resp.status}`)
  cachedVkBytes = new Uint8Array(await resp.arrayBuffer())
  return cachedVkBytes
}

// ═══════════════════════════════════════════════════════════════════
// Lazy-loaded heavy dependencies
// ═══════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let snarkjsMod: any = null

async function getSnarkjs() {
  if (!snarkjsMod) {
    // Dynamic import — snarkjs (~400 KB) only loaded when proving
    // @ts-expect-error snarkjs has no types
    snarkjsMod = await import('snarkjs')
  }
  return snarkjsMod
}

// ═══════════════════════════════════════════════════════════════════
// Preload (optional — call early to warm cache)
// ═══════════════════════════════════════════════════════════════════

let preloadPromise: Promise<void> | null = null

/**
 * Preload circuit artifacts in the background.
 * Call this when user navigates to the vote page (before they click "Vote").
 * Uses low-priority fetch to avoid blocking the main thread.
 *
 * Files are cached by the browser — subsequent fetches are instant.
 */
export function preloadCircuit(): Promise<void> {
  if (preloadPromise) return preloadPromise
  preloadPromise = Promise.all([
    fetch(CIRCUIT_WASM, { priority: 'low' } as RequestInit),
    fetch(CIRCUIT_ZKEY, { priority: 'low' } as RequestInit),
    getSnarkjs(), // warm up the dynamic import
  ]).then(() => {})
  return preloadPromise
}

// ═══════════════════════════════════════════════════════════════════
// Proof Generation (for submit_vote)
// ═══════════════════════════════════════════════════════════════════

export interface ProofInput {
  /** Voter's identity secret (decimal string from identity.json) */
  identity_secret: string
  /** Merkle path sibling hashes (decimal strings) */
  path_elements: string[]
  /** Merkle path direction indices (0 or 1) */
  path_indices: number[]
  /** Expected Merkle root (decimal string) */
  merkle_root: string
  /** External nullifier — typically Poseidon(poll_id) (decimal string) */
  external_nullifier: string
  /** Signal hash — typically Poseidon(vote_choice) (decimal string) */
  signal_hash: string
}

export interface ProofResult {
  /** Groth16 proof points (snarkjs format) */
  proof: {
    pi_a: string[]
    pi_b: string[][]
    pi_c: string[]
    protocol: string
    curve: string
  }
  /** Public signals: [merkle_root, nullifier_hash, signal_hash, external_nullifier] */
  publicSignals: string[]
  /** The nullifier hash (for on-chain dedup) */
  nullifierHash: string
}

/**
 * Generate a Groth16 proof for voting.
 *
 * This is the heavy operation — fetches circuit.wasm (~2 MB) and
 * circuit_final.zkey (~1.7 MB) on first call (cached after).
 * Proof generation itself takes ~2-5 seconds in browser.
 *
 * @param input - Circuit inputs from identity.json + vote choice
 * @returns Proof result with proof points and public signals
 */
export async function generateProof(input: ProofInput): Promise<ProofResult> {
  // Pre-compute nullifier_hash (public input constrained by circuit)
  const { poseidon2 } = await import('poseidon-lite')
  const nullifierHash = poseidon2([
    BigInt(input.identity_secret),
    BigInt(input.external_nullifier),
  ]).toString()

  const circuitInput = {
    merkle_root: input.merkle_root,
    nullifier_hash: nullifierHash,
    signal_hash: input.signal_hash,
    external_nullifier: input.external_nullifier,
    identity_secret: input.identity_secret,
    path_elements: input.path_elements,
    path_indices: input.path_indices,
  }

  const snarkjs = await getSnarkjs()
  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    CIRCUIT_WASM,
    CIRCUIT_ZKEY,
  )

  return { proof, publicSignals, nullifierHash }
}

// ═══════════════════════════════════════════════════════════════════
// Format for Sui Move contract
// ═══════════════════════════════════════════════════════════════════

export interface SuiProofData {
  /** Proof points bytes (Arkworks compressed, 128 bytes) */
  proofBytes: Uint8Array
  /** Public inputs bytes (4 × 32 bytes LE = 128 bytes) */
  publicInputsBytes: Uint8Array
  /** Nullifier hash bytes (32 bytes LE) — for on-chain VecSet dedup */
  nullifier: Uint8Array
}

/**
 * Convert snarkjs proof to Sui Move contract format.
 *
 * The Sui groth16 module expects:
 *   - proof_points: Arkworks compressed (A_G1 + B_G2 + C_G1 = 128 bytes)
 *   - public_inputs: concatenated 32-byte LE scalars
 */
export function formatForSui(result: ProofResult): SuiProofData {
  const { proof, publicSignals } = result

  const proofBytes = proofToArkworks(proof)

  const publicInputsBytes = new Uint8Array(publicSignals.length * 32)
  for (let i = 0; i < publicSignals.length; i++) {
    publicInputsBytes.set(bigintToLE32(BigInt(publicSignals[i])), i * 32)
  }

  const nullifier = bigintToLE32(BigInt(publicSignals[1]))

  return { proofBytes, publicInputsBytes, nullifier }
}

// ═══════════════════════════════════════════════════════════════════
// Poseidon helpers
// ═══════════════════════════════════════════════════════════════════

/**
 * Compute Poseidon hash of a vote choice (0=NO, 1=YES).
 * Returns decimal string for signal_hash circuit input.
 */
export async function hashSignal(choice: number): Promise<string> {
  const { poseidon1 } = await import('poseidon-lite')
  return poseidon1([BigInt(choice)]).toString()
}

/**
 * Compute external nullifier from poll ID hex string.
 * Returns decimal string for external_nullifier circuit input.
 */
export async function hashExternalNullifier(pollId: string): Promise<string> {
  const { poseidon1 } = await import('poseidon-lite')
  const pollBigint = BigInt(pollId.startsWith('0x') ? pollId : `0x${pollId}`)
  return poseidon1([pollBigint]).toString()
}

// ═══════════════════════════════════════════════════════════════════
// Internal: Arkworks encoding
// ═══════════════════════════════════════════════════════════════════

const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n

function bigintToLE32(n: bigint): Uint8Array {
  const bytes = new Uint8Array(32)
  let v = n
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(v & 0xFFn)
    v >>= 8n
  }
  return bytes
}

function encodeG1(point: string[]): Uint8Array {
  const y = BigInt(point[1])
  const bytes = bigintToLE32(BigInt(point[0]))
  if (y > P / 2n) bytes[31] |= 0x80
  return bytes
}

function encodeG2(point: string[][]): Uint8Array {
  const x_c0 = bigintToLE32(BigInt(point[0][0]))
  const x_c1 = bigintToLE32(BigInt(point[0][1]))
  const y_c1 = BigInt(point[1][1])
  const result = new Uint8Array(64)
  result.set(x_c0, 0)
  result.set(x_c1, 32)
  if (y_c1 > P / 2n) result[63] |= 0x80
  return result
}

function proofToArkworks(proof: ProofResult['proof']): Uint8Array {
  const result = new Uint8Array(128)
  result.set(encodeG1(proof.pi_a), 0)    // A: G1, 32 bytes
  result.set(encodeG2(proof.pi_b), 32)   // B: G2, 64 bytes
  result.set(encodeG1(proof.pi_c), 96)   // C: G1, 32 bytes
  return result
}

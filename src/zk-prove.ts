/**
 * ZK Proof generation for OrcaVote (browser-side).
 *
 * Uses snarkjs to generate Groth16 proofs in the browser.
 * Circuit artifacts (circuit.wasm, circuit_final.zkey) are loaded from public/zk-circuit/.
 *
 * Flow:
 *   1. loadVkBytes()     → Uint8Array for create_poll (one-time, shared across all polls)
 *   2. generateProof()   → { proof, publicInputs, nullifier } for submit_vote
 *   3. formatForSui()    → { proofBytes, publicInputsBytes, nullifier } ready for Move call
 */

// @ts-expect-error snarkjs has no types
import * as snarkjs from 'snarkjs'

const BASE = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
const CIRCUIT_WASM = `${BASE}/zk-circuit/circuit.wasm`
const CIRCUIT_ZKEY = `${BASE}/zk-circuit/circuit_final.zkey`
const VK_BYTES_URL = `${BASE}/zk-circuit/vk_bytes.bin`

// ═══════════════════════════════════════════════════════════════════
// VK Bytes (for create_poll)
// ═══════════════════════════════════════════════════════════════════

let cachedVkBytes: Uint8Array | null = null

/**
 * Load the Arkworks-serialized verifying key bytes.
 * Used as `vk_bytes` parameter in `governance::create_poll`.
 * This is a static file — same for all polls using this circuit.
 */
export async function loadVkBytes(): Promise<Uint8Array> {
  if (cachedVkBytes) return cachedVkBytes
  const resp = await fetch(VK_BYTES_URL)
  if (!resp.ok) throw new Error(`Failed to load vk_bytes: ${resp.status}`)
  cachedVkBytes = new Uint8Array(await resp.arrayBuffer())
  return cachedVkBytes
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
 * @param input - Circuit inputs from identity.json + vote choice
 * @returns Proof result with proof points and public signals
 */
export async function generateProof(input: ProofInput): Promise<ProofResult> {
  // Build circuit input object
  const circuitInput = {
    // Public inputs
    merkle_root: input.merkle_root,
    nullifier_hash: '0', // placeholder — circuit will compute this
    signal_hash: input.signal_hash,
    external_nullifier: input.external_nullifier,
    // Private inputs
    identity_secret: input.identity_secret,
    path_elements: input.path_elements,
    path_indices: input.path_indices,
  }

  // snarkjs computes the witness and generates the proof
  // The nullifier_hash public input is constrained by the circuit,
  // so we need to compute it first to pass as input.
  // Actually, snarkjs fullProve handles this — the circuit constrains
  // nullifier_hash = Poseidon(identity_secret, external_nullifier)
  // We need to pass the correct value.

  // For fullProve, we need to pre-compute nullifier_hash
  // since it's a public input that must match the circuit constraint.
  // We'll use poseidon-lite (already used by the WASM module).
  const { poseidon2 } = await import('poseidon-lite')
  const nullifierHash = poseidon2([
    BigInt(input.identity_secret),
    BigInt(input.external_nullifier),
  ]).toString()

  circuitInput.nullifier_hash = nullifierHash

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(
    circuitInput,
    CIRCUIT_WASM,
    CIRCUIT_ZKEY,
  )

  return {
    proof,
    publicSignals,
    nullifierHash,
  }
}

// ═══════════════════════════════════════════════════════════════════
// Format for Sui Move contract
// ═══════════════════════════════════════════════════════════════════

export interface SuiProofData {
  /** Proof points bytes (Arkworks compressed) */
  proofBytes: Uint8Array
  /** Public inputs bytes (4 × 32 bytes LE) */
  publicInputsBytes: Uint8Array
  /** Nullifier hash bytes (32 bytes LE) — for on-chain VecSet dedup */
  nullifier: Uint8Array
}

/**
 * Convert snarkjs proof to Sui Move contract format.
 *
 * The Sui groth16 module expects:
 *   - proof_points: Arkworks compressed serialization of (A, B, C)
 *   - public_inputs: concatenated 32-byte LE scalars
 */
export function formatForSui(result: ProofResult): SuiProofData {
  const { proof, publicSignals } = result

  // Proof points: A (G1, 32 bytes) + B (G2, 64 bytes) + C (G1, 32 bytes) = 128 bytes
  const proofBytes = proofToArkworks(proof)

  // Public inputs: each signal as 32-byte LE scalar
  // Order: [merkle_root, nullifier_hash, signal_hash, external_nullifier]
  const publicInputsBytes = new Uint8Array(publicSignals.length * 32)
  for (let i = 0; i < publicSignals.length; i++) {
    const bytes = bigintToLE32(BigInt(publicSignals[i]))
    publicInputsBytes.set(bytes, i * 32)
  }

  // Nullifier for on-chain dedup (same as publicSignals[1])
  const nullifier = bigintToLE32(BigInt(publicSignals[1]))

  return { proofBytes, publicInputsBytes, nullifier }
}

// ═══════════════════════════════════════════════════════════════════
// Helpers
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
  const x = BigInt(point[0])
  const y = BigInt(point[1])
  const bytes = bigintToLE32(x)
  if (y > P / 2n) {
    bytes[31] |= 0x80
  }
  return bytes
}

function encodeG2(point: string[][]): Uint8Array {
  const x_c0 = bigintToLE32(BigInt(point[0][0]))
  const x_c1 = bigintToLE32(BigInt(point[0][1]))
  const y_c1 = BigInt(point[1][1])
  const result = new Uint8Array(64)
  result.set(x_c0, 0)
  result.set(x_c1, 32)
  if (y_c1 > P / 2n) {
    result[63] |= 0x80
  }
  return result
}

function proofToArkworks(proof: ProofResult['proof']): Uint8Array {
  const a = encodeG1(proof.pi_a)       // 32 bytes
  const b = encodeG2(proof.pi_b)       // 64 bytes
  const c = encodeG1(proof.pi_c)       // 32 bytes
  const result = new Uint8Array(128)
  result.set(a, 0)
  result.set(b, 32)
  result.set(c, 96)
  return result
}

/**
 * Helper: compute Poseidon hash of a vote choice (0=NO, 1=YES)
 * Returns decimal string suitable for signal_hash input.
 */
export async function hashSignal(choice: number): Promise<string> {
  const { poseidon1 } = await import('poseidon-lite')
  return poseidon1([BigInt(choice)]).toString()
}

/**
 * Helper: compute external nullifier from poll ID string.
 * Returns decimal string suitable for external_nullifier input.
 */
export async function hashExternalNullifier(pollId: string): Promise<string> {
  const { poseidon1 } = await import('poseidon-lite')
  // Convert poll ID hex to bigint
  const pollBigint = BigInt(pollId.startsWith('0x') ? pollId : `0x${pollId}`)
  return poseidon1([pollBigint]).toString()
}

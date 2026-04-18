/**
 * Build a full-depth Poseidon Merkle tree from commitments.
 *
 * When WASM returns tree_depth=0 (single leaf), we need to build
 * the full TREE_DEPTH=10 tree in JS so the circuit gets valid paths.
 */

import { TREE_DEPTH } from './zk-prove'

// ─── Zero hashes (precomputed lazily) ───

let zeroHashes: bigint[] | null = null

/**
 * Compute zero hashes for each level of the tree.
 * zeroHashes[0] = 0 (empty leaf)
 * zeroHashes[i] = Poseidon(zeroHashes[i-1], zeroHashes[i-1])
 */
async function getZeroHashes(): Promise<bigint[]> {
  if (zeroHashes) return zeroHashes
  const { poseidon2 } = await import('poseidon-lite')
  const hashes: bigint[] = [0n]
  for (let i = 1; i <= TREE_DEPTH; i++) {
    hashes.push(poseidon2([hashes[i - 1], hashes[i - 1]]))
  }
  zeroHashes = hashes
  return hashes
}

// ─── Types ───

export interface FullMerklePath {
  pathElements: bigint[]  // sibling hashes, length = TREE_DEPTH
  pathIndices: number[]   // 0 or 1, length = TREE_DEPTH
  root: bigint            // computed root
}

// ─── Build tree ───

/**
 * Build a full Poseidon Merkle tree of depth TREE_DEPTH from leaf commitments.
 * Returns the path for the leaf at `leafIndex`.
 *
 * If only 1 commitment is provided, the tree is padded with zero leaves.
 */
export async function buildFullMerklePath(
  commitments: bigint[],
  leafIndex: number,
): Promise<FullMerklePath> {
  const { poseidon2 } = await import('poseidon-lite')
  const zeros = await getZeroHashes()
  const numLeaves = 1 << TREE_DEPTH // 2^TREE_DEPTH

  // Initialize leaves — pad with zero (empty leaf)
  const leaves: bigint[] = new Array(numLeaves).fill(0n)
  for (let i = 0; i < commitments.length; i++) {
    leaves[i] = commitments[i]
  }

  // Build tree bottom-up, collecting path for leafIndex
  const pathElements: bigint[] = []
  const pathIndices: number[] = []
  let currentLevel = leaves
  let idx = leafIndex

  for (let level = 0; level < TREE_DEPTH; level++) {
    const siblingIdx = idx ^ 1 // XOR to get sibling
    pathElements.push(currentLevel[siblingIdx] ?? zeros[level])
    pathIndices.push(idx & 1) // 0 if left child, 1 if right child

    // Compute next level
    const nextLevel: bigint[] = []
    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i] ?? zeros[level]
      const right = currentLevel[i + 1] ?? zeros[level]
      nextLevel.push(poseidon2([left, right]))
    }
    currentLevel = nextLevel
    idx = Math.floor(idx / 2)
  }

  return {
    pathElements,
    pathIndices,
    root: currentLevel[0],
  }
}

/**
 * Convert a hex string (from WASM) to bigint.
 */
export function hexToBigInt(hex: string): bigint {
  const clean = hex.startsWith('0x') ? hex : `0x${hex}`
  return BigInt(clean)
}

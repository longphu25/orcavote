// ZK Merkle WASM loader
// Loads from public/sui-zk-merkle/

export interface ProofNode {
  hash: string
  position: string
}

export interface IdentityBlob {
  identity_secret: string
  identity_nullifier: string
  identity_commitment: string
  address: string
  merkle_root: string
  merkle_path: ProofNode[]
  leaf_index: number
  tree_depth: number
  poll_info: { poll_id: string; title: string; total_members: number }
  groth16_inputs: {
    merkle_root_le: string
    nullifier_hash_le: string
    signal_hash_le: string
    external_nullifier_le: string
    concatenated_le: string
    merkle_root_decimal: string
    nullifier_hash_decimal: string
  }
}

export interface MerkleResult {
  root: string
  root_le: string
  root_decimal: string
  leaf_count: number
  tree_depth: number
  commitments: string[]
  identities: IdentityBlob[]
}

type WasmModule = {
  build_merkle_tree: (addrs: string[], pollId: string, title: string, signal: string) => MerkleResult
  verify_proof: (commitment: string, proof: ProofNode[], root: string) => boolean
}

let wasm: WasmModule | null = null
let wasmStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
let wasmError: string | null = null

export function getWasmStatus() {
  return { status: wasmStatus, error: wasmError }
}

export async function initZkMerkleWasm(): Promise<WasmModule> {
  if (wasm) return wasm

  wasmStatus = 'loading'
  try {
    const base = import.meta.env.BASE_URL ?? '/'
    const pkgUrl = `${base}sui-zk-merkle/pkg/zk_merkle_wasm.js`
    const mod = await import(/* @vite-ignore */ pkgUrl) as {
      default: (input: URL) => Promise<unknown>
      build_merkle_tree: WasmModule['build_merkle_tree']
      verify_proof: WasmModule['verify_proof']
    }
    await mod.default(new URL(`${base}sui-zk-merkle/wasm/zk-merkle.wasm`, location.origin))
    wasm = mod
    wasmStatus = 'ready'
    return wasm
  } catch (e) {
    wasmStatus = 'error'
    wasmError = e instanceof Error ? e.message : String(e)
    throw e
  }
}

// ZK Merkle WASM loader
// Loads JS glue + WASM binary from public/sui-zk-merkle/ at runtime
// Uses script injection to avoid Vite's public/ import restriction

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

export type WasmModule = {
  build_merkle_tree: (addrs: string[], pollId: string, title: string, signal: string) => MerkleResult
  verify_proof: (commitment: string, proof: ProofNode[], root: string) => boolean
}

let wasm: WasmModule | null = null
let wasmStatus: 'idle' | 'loading' | 'ready' | 'error' = 'idle'
let wasmError: string | null = null
let initPromise: Promise<WasmModule> | null = null

export function getWasmStatus() {
  return { status: wasmStatus, error: wasmError }
}

/**
 * Load the ZK Merkle WASM module.
 *
 * The JS glue file lives in public/ and Vite forbids import() from public/.
 * We load it via a dynamic <script type="module"> that re-exports into a
 * global callback, then init the WASM binary via the glue's default export.
 */
export function initZkMerkleWasm(): Promise<WasmModule> {
  if (wasm) return Promise.resolve(wasm)
  if (initPromise) return initPromise

  wasmStatus = 'loading'

  initPromise = new Promise<WasmModule>((resolve, reject) => {
    const origin = window.location.origin
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '')
    const jsUrl = `${origin}${base}/sui-zk-merkle/pkg/zk_merkle_wasm.js`
    const wasmUrl = `${origin}${base}/sui-zk-merkle/wasm/zk-merkle.wasm`

    // Create a module script that imports the glue and exposes it globally
    const callbackName = `__zkMerkleWasmCallback_${Date.now()}`
    const scriptContent = `import init, { build_merkle_tree, verify_proof } from '${jsUrl}';
window['${callbackName}']({ init, build_merkle_tree, verify_proof });`
    const blob = new Blob([scriptContent], { type: 'text/javascript' })
    const blobUrl = URL.createObjectURL(blob)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(window as any)[callbackName] = async (mod: {
      init: (input: string | URL) => Promise<unknown>
      build_merkle_tree: WasmModule['build_merkle_tree']
      verify_proof: WasmModule['verify_proof']
    }) => {
      try {
        await mod.init(wasmUrl)
        wasm = { build_merkle_tree: mod.build_merkle_tree, verify_proof: mod.verify_proof }
        wasmStatus = 'ready'
        resolve(wasm)
      } catch (e) {
        wasmStatus = 'error'
        wasmError = e instanceof Error ? e.message : String(e)
        reject(e)
      } finally {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        delete (window as any)[callbackName]
        URL.revokeObjectURL(blobUrl)
        script.remove()
      }
    }

    const script = document.createElement('script')
    script.type = 'module'
    script.src = blobUrl
    script.onerror = (e) => {
      wasmStatus = 'error'
      wasmError = `Failed to load WASM glue script: ${e}`
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any)[callbackName]
      URL.revokeObjectURL(blobUrl)
      script.remove()
      reject(new Error(wasmError))
    }
    document.head.appendChild(script)
  })

  return initPromise
}

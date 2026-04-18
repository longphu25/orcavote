import { useState, useCallback, useRef, useEffect } from 'react'
import { useCurrentAccount, useSuiClientContext } from '@mysten/dapp-kit'
import {
  Shield,
  TreePine,
  Download,
  CheckCircle,
  XCircle,
  Loader2,
  FileKey,
  Hash,
  Upload,
  Lock,
  ExternalLink,
  CloudUpload,
  Database,
} from 'lucide-react'
import { C } from './theme'
import { initZkMerkleWasm, getWasmStatus } from './zk-merkle'
import type { MerkleResult } from './zk-merkle'
import { encryptAndUpload, encryptAndUploadAll, uploadToWalrus, AGGREGATORS } from './seal-walrus'
import type { UploadResult, NetworkKey } from './seal-walrus'
import BlobIdPicker from './BlobIdPicker'
import type { WalrusBlob } from './BlobIdPicker'

/* ─── styles ─── */
const card = {
  padding: 24, borderRadius: 16,
  border: `1px solid ${C.border}`, background: C.surface, marginBottom: 20,
} as const

const label = {
  fontSize: 11, color: C.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6, display: 'block',
}

const input = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: `1px solid ${C.border}`, background: C.bg, color: C.text,
  fontSize: 14, fontFamily: "'Exo 2',sans-serif", outline: 'none',
} as const

const textarea = {
  ...input, resize: 'vertical' as const, minHeight: 80, fontFamily: "'Exo 2',monospace",
} as const

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '10px 24px', borderRadius: 10,
  background: C.accent, color: '#000', fontSize: 14, fontWeight: 700,
  border: 'none', cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
  width: '100%', justifyContent: 'center',
} as const

const btnSm = {
  display: 'inline-flex', alignItems: 'center', gap: 4,
  padding: '6px 12px', borderRadius: 8,
  border: `1px solid ${C.border}`, background: 'transparent',
  color: C.text, fontSize: 12, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
} as const

const btnUpload = {
  ...btnSm,
  borderColor: 'rgba(16,185,129,0.3)',
  color: C.green,
} as const

/* ─── Component ─── */
export default function ZkMerklePanel() {
  const currentAccount = useCurrentAccount()
  const ctx = useSuiClientContext()
  const [addresses, setAddresses] = useState('')
  const [pollId, setPollId] = useState('')
  const [pollTitle, setPollTitle] = useState('')
  const [signal, setSignal] = useState('vote')
  const [result, setResult] = useState<MerkleResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [wasmReady, setWasmReady] = useState(false)
  const [verifyResults, setVerifyResults] = useState<Record<number, boolean>>({})
  const dlRef = useRef<HTMLAnchorElement>(null)

  // Upload state
  const [uploadResults, setUploadResults] = useState<Record<number, UploadResult>>({})
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null)
  const [uploadAllProgress, setUploadAllProgress] = useState<{ done: number; total: number } | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)

  // Tree upload state
  const [treeUploadResult, setTreeUploadResult] = useState<{ blobId: string; walrusUrl: string } | null>(null)
  const [treeUploading, setTreeUploading] = useState(false)

  // Data Asset blob ID picker
  const [blobPickerOpen, setBlobPickerOpen] = useState(false)
  const [selectedBlob, setSelectedBlob] = useState<WalrusBlob | null>(null)

  const network = (ctx.network ?? 'testnet') as NetworkKey

  // Pre-load WASM
  useEffect(() => {
    initZkMerkleWasm().then(() => setWasmReady(true)).catch(() => {})
  }, [])

  // Auto-fill connected address on first mount
  const addressRef = useRef(false)
  useEffect(() => {
    if (currentAccount && !addressRef.current) {
      addressRef.current = true
      queueMicrotask(() => setAddresses(currentAccount.address))
    }
  }, [currentAccount])

  const buildTree = useCallback(async () => {
    setLoading(true)
    setError(null)
    setResult(null)
    setVerifyResults({})
    setUploadResults({})
    setUploadError(null)
    setTreeUploadResult(null)
    try {
      const wasm = await initZkMerkleWasm()
      const addrs = addresses.split(/[\n,]+/).map((a) => a.trim()).filter((a) => a.startsWith('0x') && a.length > 10)
      if (addrs.length === 0) throw new Error('Enter at least 1 valid address (0x...)')
      const r = wasm.build_merkle_tree(addrs, pollId || `poll_${Date.now()}`, pollTitle || 'Untitled Poll', signal || 'vote')
      setResult(r)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [addresses, pollId, pollTitle, signal])

  // Download helpers
  function downloadIdentity(idx: number) {
    if (!result) return
    const blob = result.identities[idx]
    const json = JSON.stringify(blob, null, 2)
    const file = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    if (dlRef.current) { dlRef.current.href = url; dlRef.current.download = `identity_${blob.address.slice(0, 8)}.json`; dlRef.current.click(); URL.revokeObjectURL(url) }
  }

  function downloadAll() {
    if (!result) return
    const json = JSON.stringify(result, null, 2)
    const file = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(file)
    if (dlRef.current) { dlRef.current.href = url; dlRef.current.download = `merkle_${result.root.slice(0, 8)}.json`; dlRef.current.click(); URL.revokeObjectURL(url) }
  }

  // Verify
  async function verifyIdentity(idx: number) {
    if (!result) return
    try {
      const wasm = await initZkMerkleWasm()
      const id = result.identities[idx]
      const ok = wasm.verify_proof(id.identity_commitment, id.merkle_path, id.merkle_root)
      setVerifyResults((prev) => ({ ...prev, [idx]: ok }))
    } catch { setVerifyResults((prev) => ({ ...prev, [idx]: false })) }
  }

  // Seal encrypt + Walrus upload (single)
  async function handleUploadOne(idx: number) {
    if (!result) return
    setUploadingIdx(idx)
    setUploadError(null)
    try {
      const res = await encryptAndUpload(result.identities[idx], network)
      setUploadResults((prev) => ({ ...prev, [idx]: res }))
    } catch (e: unknown) {
      setUploadError(`#${idx}: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setUploadingIdx(null)
    }
  }

  // Seal encrypt + Walrus upload (all)
  async function handleUploadAll() {
    if (!result) return
    setUploadAllProgress({ done: 0, total: result.identities.length })
    setUploadError(null)
    try {
      await encryptAndUploadAll(
        result.identities,
        network,
        5,
        (done, total, res) => {
          setUploadAllProgress({ done, total })
          setUploadResults((prev) => {
            const idx = result.identities.findIndex((id) => id.address === res.address)
            return idx >= 0 ? { ...prev, [idx]: res } : prev
          })
        },
      )
    } catch (e: unknown) {
      setUploadError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploadAllProgress(null)
    }
  }

  const { status: ws } = getWasmStatus()
  const isUploading = uploadingIdx !== null || uploadAllProgress !== null
  const allUploaded = result ? result.identities.every((_, i) => i in uploadResults) : false

  // Upload full tree JSON to Walrus (no Seal — public data)
  async function handleUploadTree() {
    if (!result) return
    setTreeUploading(true)
    setUploadError(null)
    try {
      const json = new TextEncoder().encode(JSON.stringify(result))
      const { blobId, walrusUrl } = await uploadToWalrus(json, network)
      setTreeUploadResult({ blobId, walrusUrl })
    } catch (e: unknown) {
      setUploadError(`Tree upload: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setTreeUploading(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <TreePine size={20} color={C.primary} />
          </div>
          <div>
            <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 18, fontWeight: 600, color: C.heading, margin: 0 }}>ZK Merkle Identity</h2>
            <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>Build tree → Seal encrypt → Upload to Walrus</p>
          </div>
        </div>
        <span style={{
          padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 700,
          background: wasmReady ? 'rgba(16,185,129,0.1)' : 'rgba(245,158,11,0.1)',
          color: wasmReady ? C.green : C.accent,
          border: `1px solid ${wasmReady ? 'rgba(16,185,129,0.2)' : 'rgba(245,158,11,0.2)'}`,
        }}>
          {wasmReady ? 'WASM Ready' : ws === 'loading' ? 'Loading…' : 'WASM Error'}
        </span>
      </div>

      {/* Errors */}
      {(error || uploadError) && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle size={16} color="#EF4444" />
          <span style={{ fontSize: 13, color: '#EF4444' }}>{error || uploadError}</span>
        </div>
      )}

      {/* Input form */}
      <div style={card}>
        <div style={{ marginBottom: 16 }}>
          <span style={label}>Wallet Addresses (one per line or comma-separated)</span>
          <textarea style={textarea} rows={4} placeholder={"0xde03f5aa...\n0xabc123..."} value={addresses} onChange={(e) => setAddresses(e.target.value)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div><span style={label}>Poll ID</span><input style={input} placeholder="poll_001" value={pollId} onChange={(e) => setPollId(e.target.value)} /></div>
          <div><span style={label}>Title</span><input style={input} placeholder="DAO Vote #1" value={pollTitle} onChange={(e) => setPollTitle(e.target.value)} /></div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <span style={label}>Data Asset Blob ID</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...input, flex: 1 }}
              placeholder="Blob ID from Walrus"
              value={selectedBlob?.blobId ?? ''}
              readOnly
            />
            <button
              onClick={() => setBlobPickerOpen(true)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 10,
                border: `1px solid ${C.border}`, background: C.surface,
                color: C.accent, fontSize: 13, fontWeight: 600,
                cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
                whiteSpace: 'nowrap',
              }}
            >
              <Database size={14} /> Chọn Blob
            </button>
          </div>
          {selectedBlob && (
            <div style={{ marginTop: 6, fontSize: 11, color: C.green }}>
              ✓ Object: {selectedBlob.objectId.slice(0, 10)}…{selectedBlob.objectId.slice(-6)} · {selectedBlob.size > 0 ? `${(selectedBlob.size / 1024).toFixed(1)} KB` : ''}
            </div>
          )}
        </div>
        <div style={{ marginBottom: 20 }}>
          <span style={label}>Signal (vote value / action)</span>
          <input style={input} placeholder="vote" value={signal} onChange={(e) => setSignal(e.target.value)} />
        </div>
        <button style={{ ...btnPrimary, opacity: loading || !addresses.trim() ? 0.5 : 1 }} onClick={buildTree} disabled={loading || !addresses.trim()}>
          {loading ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <TreePine size={16} />}
          {loading ? 'Building…' : 'Build Merkle Tree (WASM)'}
        </button>
      </div>

      {/* Result */}
      {result && (
        <>
          {/* Tree info */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <Hash size={16} color={C.primary} />
              <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>Merkle Tree (Poseidon BN254)</span>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {[
                ['Root', `${result.root.slice(0, 16)}…${result.root.slice(-8)}`],
                ['Leaves', String(result.leaf_count)],
                ['Depth', String(result.tree_depth)],
                ['Hash', 'Poseidon BN254 (Circom)'],
                ['Verifier', 'sui::groth16::bn254()'],
              ].map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: C.bg }}>
                  <span style={{ fontSize: 13, color: C.textMuted }}>{k}</span>
                  <code style={{ fontSize: 13, color: C.primary, fontFamily: "'Exo 2',monospace" }}>{v}</code>
                </div>
              ))}
            </div>

            {/* Tree upload result */}
            {treeUploadResult && (
              <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={{ fontSize: 11, color: C.textMuted }}>Walrus Blob ID</span>
                  <code style={{ fontSize: 11, color: C.green, fontFamily: "'Exo 2',monospace" }}>
                    {treeUploadResult.blobId.slice(0, 16)}…{treeUploadResult.blobId.slice(-6)}
                  </code>
                </div>
                <a href={treeUploadResult.walrusUrl} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: C.green, textDecoration: 'none', marginTop: 4 }}>
                  <ExternalLink size={12} /> View Full Tree on Walrus
                </a>
              </div>
            )}

            {/* Action buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
              <button style={{ ...btnSm, justifyContent: 'center' }} onClick={downloadAll}>
                <Download size={14} /> Download JSON
              </button>
              <button
                style={{ ...btnUpload, justifyContent: 'center', opacity: treeUploading || treeUploadResult ? 0.6 : 1 }}
                onClick={handleUploadTree}
                disabled={treeUploading || !!treeUploadResult}
              >
                {treeUploading ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : treeUploadResult ? <CheckCircle size={14} /> : <CloudUpload size={14} />}
                {treeUploading ? 'Uploading…' : treeUploadResult ? 'Uploaded' : 'Upload to Walrus'}
              </button>
            </div>
          </div>

          {/* Identity blobs */}
          <div style={card}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileKey size={16} color={C.accent} />
                <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>
                  Identity Blobs ({result.identities.length})
                </span>
              </div>
            </div>

            {/* Upload All button */}
            <button
              style={{
                ...btnPrimary,
                background: allUploaded ? C.green : C.primary,
                marginBottom: 16,
                opacity: isUploading || allUploaded ? 0.6 : 1,
              }}
              onClick={handleUploadAll}
              disabled={isUploading || allUploaded}
            >
              {uploadAllProgress ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Encrypting & Uploading {uploadAllProgress.done}/{uploadAllProgress.total}…
                </>
              ) : allUploaded ? (
                <>
                  <CheckCircle size={16} />
                  All Uploaded to Walrus
                </>
              ) : (
                <>
                  <CloudUpload size={16} />
                  Seal Encrypt & Upload All to Walrus
                </>
              )}
            </button>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {result.identities.map((id, i) => {
                const uploaded = uploadResults[i]
                const isThisUploading = uploadingIdx === i

                return (
                  <div key={i} style={{ padding: 14, borderRadius: 12, border: `1px solid ${uploaded ? 'rgba(16,185,129,0.3)' : C.border}`, background: C.bg }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 700, color: C.textMuted }}>#{i}</span>
                        <code style={{ fontSize: 12, color: C.primary, fontFamily: "'Exo 2',monospace" }}>
                          {id.address.slice(0, 10)}…{id.address.slice(-6)}
                        </code>
                      </div>
                      {uploaded && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: C.green }}>
                          <Lock size={12} /> Sealed
                        </span>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 11, color: C.textMuted }}>
                      <span>nullifier: {id.identity_nullifier.slice(0, 8)}…</span>
                      <span>commit: {id.identity_commitment.slice(0, 8)}…</span>
                    </div>

                    {/* Walrus upload result */}
                    {uploaded && (
                      <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(16,185,129,0.05)', border: '1px solid rgba(16,185,129,0.15)', marginBottom: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: C.textMuted }}>Blob ID</span>
                          <code style={{ fontSize: 11, color: C.green, fontFamily: "'Exo 2',monospace" }}>
                            {uploaded.blobId.slice(0, 12)}…{uploaded.blobId.slice(-6)}
                          </code>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: C.textMuted }}>Size</span>
                          <span style={{ fontSize: 11, color: C.textMuted }}>{(uploaded.encryptedSize / 1024).toFixed(1)} KB encrypted</span>
                        </div>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <button style={btnSm} onClick={() => downloadIdentity(i)}>
                        <Download size={12} /> Download
                      </button>
                      <button style={{ ...btnSm, borderColor: 'rgba(59,130,246,0.3)', color: C.primary }} onClick={() => verifyIdentity(i)}>
                        <Shield size={12} /> Verify
                      </button>
                      {!uploaded && (
                        <button style={btnUpload} onClick={() => handleUploadOne(i)} disabled={isUploading}>
                          {isThisUploading ? <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> : <Upload size={12} />}
                          {isThisUploading ? 'Uploading…' : 'Seal & Upload'}
                        </button>
                      )}
                      {uploaded && (
                        <a href={uploaded.walrusUrl} target="_blank" rel="noopener noreferrer" style={{ ...btnUpload, textDecoration: 'none' }}>
                          <ExternalLink size={12} /> View on Walrus
                        </a>
                      )}
                      {i in verifyResults && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: verifyResults[i] ? C.green : '#EF4444' }}>
                          {verifyResults[i] ? <CheckCircle size={14} /> : <XCircle size={14} />}
                          {verifyResults[i] ? 'Valid' : 'Invalid'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Upload summary */}
          {Object.keys(uploadResults).length > 0 && (
            <div style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <CloudUpload size={16} color={C.green} />
                <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>
                  Walrus Upload Summary
                </span>
              </div>
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 8, background: C.bg }}>
                  <span style={{ fontSize: 13, color: C.textMuted }}>Uploaded</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>{Object.keys(uploadResults).length} / {result.identities.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 8, background: C.bg }}>
                  <span style={{ fontSize: 13, color: C.textMuted }}>Network</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: C.accent }}>{network}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 12px', borderRadius: 8, background: C.bg }}>
                  <span style={{ fontSize: 13, color: C.textMuted }}>Aggregator</span>
                  <code style={{ fontSize: 11, color: C.primary, fontFamily: "'Exo 2',monospace" }}>{AGGREGATORS[network]}</code>
                </div>
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', padding: '8px 0' }}>
            Identity blobs are Seal-encrypted per voter address — only the target voter can decrypt
          </div>
        </>
      )}

      <a ref={dlRef} style={{ display: 'none' }} />

      <BlobIdPicker
        open={blobPickerOpen}
        onClose={() => setBlobPickerOpen(false)}
        onSelect={(blob) => setSelectedBlob(blob)}
      />
    </div>
  )
}

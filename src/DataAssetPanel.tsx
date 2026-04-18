import { useState, useRef, useCallback, useEffect } from 'react'
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientContext,
  useSignPersonalMessage,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit'
import {
  Database,
  Upload,
  Loader2,
  CheckCircle,
  XCircle,
  ExternalLink,
  FileText,
  Lock,
  Unlock,
  X,
  RefreshCw,
  Eye,
} from 'lucide-react'
import { C } from './theme'
import { encryptRaw, fetchBlobFromWalrus, AGGREGATORS } from './seal-walrus'
import type { NetworkKey } from './seal-walrus'
import { SessionKey, EncryptedObject, SealClient } from '@mysten/seal'
import { Transaction } from '@mysten/sui/transactions'
import { fromHex } from '@mysten/sui/utils'
import type { WalrusBlob } from './BlobIdPicker'
import { walrus } from '@mysten/walrus'
import walrusWasmUrl from '@mysten/walrus-wasm/web/walrus_wasm_bg.wasm?url'
import { SuiGrpcClient } from '@mysten/sui/grpc'

/* ─── constants ─── */
const SEAL_PACKAGE_ID = '0x2b5472a9002d97045c8448cda76284aa0de81df3ab902fdfc785feaa2c0b4cc0'
const WALRUS_BLOB_TYPE_TESTNET = '0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66::blob::Blob'
const WALRUS_BLOB_TYPE_MAINNET = '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob'

/** Convert u256 decimal blob_id from on-chain to base64url for Walrus aggregator */
function blobIdToBase64url(decimal: string): string {
  let n = BigInt(decimal)
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(n & 0xffn)
    n >>= 8n
  }
  const b64 = btoa(String.fromCharCode(...bytes))
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

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

/* ─── types ─── */
interface UploadedAsset {
  name: string
  blobId: string
  originalSize: number
  encryptedSize: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

type UploadStep = 'encrypting' | 'encoding' | 'register' | 'uploading' | 'certify' | null

/* ─── Component ─── */
export default function DataAssetPanel() {
  const currentAccount = useCurrentAccount()
  const suiClient = useSuiClient()
  const ctx = useSuiClientContext()
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage()
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
  const network = (ctx.network ?? 'testnet') as NetworkKey

  // Upload state
  const [name, setName] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [fileBytes, setFileBytes] = useState<Uint8Array | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadStep, setUploadStep] = useState<UploadStep>(null)
  const [error, setError] = useState<string | null>(null)
  const [uploaded, setUploaded] = useState<UploadedAsset[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  // Wallet blobs state
  const [walrusBlobs, setWalrusBlobs] = useState<WalrusBlob[]>([])
  const [loadingBlobs, setLoadingBlobs] = useState(false)
  const [blobError, setBlobError] = useState<string | null>(null)

  // Decrypt state
  const [decrypting, setDecrypting] = useState<string | null>(null)
  const [decryptedData, setDecryptedData] = useState<Record<string, { raw: Uint8Array; text: string | null }>>({})
  const [decryptError, setDecryptError] = useState<string | null>(null)

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    if (!name) setName(f.name)
    setFile(f)
    f.arrayBuffer().then((buf) => setFileBytes(new Uint8Array(buf)))
  }, [name])

  const clearFile = () => {
    setFile(null)
    setFileBytes(null)
    if (fileRef.current) fileRef.current.value = ''
  }

  // Upload: Seal encrypt → Walrus SDK writeBlobFlow with upload relay (user signs txs → blob owned by wallet)
  const handleUpload = useCallback(async () => {
    if (!fileBytes || !currentAccount) return
    setUploading(true)
    setError(null)
    try {
      // 1. Seal encrypt
      setUploadStep('encrypting')
      const encrypted = await encryptRaw(fileBytes, currentAccount.address, network)

      // 2. Create Walrus client with upload relay
      const rpcUrl = network === 'testnet' ? 'https://fullnode.testnet.sui.io:443' : 'https://fullnode.mainnet.sui.io:443'
      const relayUrl = network === 'testnet' ? 'https://upload-relay.testnet.walrus.space' : 'https://upload-relay.mainnet.walrus.space'
      const wClient = new SuiGrpcClient({ network, baseUrl: rpcUrl }).$extend(
        walrus({
          wasmUrl: walrusWasmUrl,
          uploadRelay: { host: relayUrl, sendTip: { max: 10000 } },
        }),
      )

      // 3. writeBlobFlow — encode → register (sign) → upload via relay → certify (sign)
      const flow = wClient.walrus.writeBlobFlow({ blob: encrypted })

      setUploadStep('encoding')
      const encoded = await flow.encode()

      setUploadStep('register')
      const registerTx = flow.register({ epochs: 5, owner: currentAccount.address, deletable: true })
      const regResult = await signAndExecute({ transaction: registerTx })

      setUploadStep('uploading')
      await flow.upload({ digest: regResult.digest })

      setUploadStep('certify')
      const certifyTx = flow.certify()
      await signAndExecute({ transaction: certifyTx })

      setUploaded((prev) => [{
        name: name || file?.name || `data_${Date.now()}`,
        blobId: encoded.blobId,
        originalSize: fileBytes.length,
        encryptedSize: encrypted.length,
      }, ...prev])
      setName('')
      clearFile()
      fetchWalrusBlobs()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setUploading(false)
      setUploadStep(null)
    }
  }, [fileBytes, file, name, currentAccount, network, signAndExecute])

  // Fetch wallet's owned Walrus Blob objects
  const fetchWalrusBlobs = useCallback(async () => {
    if (!currentAccount) return
    setLoadingBlobs(true)
    setBlobError(null)
    try {
      let allBlobs: WalrusBlob[] = []
      for (const blobType of [WALRUS_BLOB_TYPE_TESTNET, WALRUS_BLOB_TYPE_MAINNET]) {
        try {
          const res = await suiClient.getOwnedObjects({
            owner: currentAccount.address,
            filter: { StructType: blobType },
            options: { showContent: true, showType: true },
            limit: 50,
          })
          for (const item of res.data) {
            const obj = item.data
            if (!obj?.content || obj.content.dataType !== 'moveObject') continue
            const fields = obj.content.fields as Record<string, unknown>
            const storage = (fields.storage as Record<string, unknown>)?.fields as Record<string, unknown> | undefined
            allBlobs.push({
              objectId: obj.objectId,
              blobId: blobIdToBase64url(String(fields.blob_id ?? '0')),
              size: Number(fields.size ?? 0),
              registeredEpoch: Number(fields.registered_epoch ?? 0),
              certifiedEpoch: fields.certified_epoch != null ? Number(fields.certified_epoch) : null,
              startEpoch: Number(storage?.start_epoch ?? 0),
              endEpoch: Number(storage?.end_epoch ?? 0),
              deletable: Boolean(fields.deletable),
              version: Number(obj.version ?? 0),
            })
          }
          if (allBlobs.length > 0) break
        } catch { /* type not on this network */ }
      }
      setWalrusBlobs(allBlobs)
    } catch (e: unknown) {
      setBlobError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingBlobs(false)
    }
  }, [currentAccount, suiClient])

  useEffect(() => {
    if (currentAccount) fetchWalrusBlobs()
  }, [currentAccount?.address]) // eslint-disable-line react-hooks/exhaustive-deps

  // Decrypt a blob: fetch from Walrus → try Seal decrypt → show content
  const handleDecrypt = useCallback(async (blob: WalrusBlob) => {
    if (!currentAccount) return
    setDecrypting(blob.objectId)
    setDecryptError(null)
    try {
      const ciphertext = await fetchBlobFromWalrus(blob.blobId, network)

      let decrypted: Uint8Array
      try {
        const encObj = EncryptedObject.parse(ciphertext)

        const sessionKey = await SessionKey.create({
          address: currentAccount.address,
          packageId: SEAL_PACKAGE_ID,
          ttlMin: 10,
          suiClient,
        })
        const msg = sessionKey.getPersonalMessage()
        const { signature } = await signPersonalMessage({ message: msg })
        sessionKey.setPersonalMessageSignature(signature)

        const tx = new Transaction()
        tx.moveCall({
          target: `${SEAL_PACKAGE_ID}::whitelist::seal_approve`,
          arguments: [
            tx.pure.vector('u8', fromHex(encObj.id)),
            tx.object(encObj.id),
          ],
        })
        const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true })

        const sealClient = new SealClient({
          suiClient,
          serverConfigs: [{
            objectId: '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98',
            weight: 1,
            aggregatorUrl: 'https://seal-aggregator-testnet.mystenlabs.com',
          }],
          verifyKeyServers: false,
        })
        decrypted = await sealClient.decrypt({ data: ciphertext, sessionKey, txBytes })
      } catch {
        // Not Seal-encrypted or decrypt failed — show raw bytes
        decrypted = ciphertext
      }

      let text: string | null = null
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(decrypted)
        const printable = decoded.split('').filter(c => c.charCodeAt(0) >= 32 || c === '\n' || c === '\r' || c === '\t').length
        if (printable / decoded.length > 0.9) text = decoded
      } catch { /* binary */ }

      setDecryptedData((prev) => ({ ...prev, [blob.objectId]: { raw: decrypted, text } }))
    } catch (e: unknown) {
      setDecryptError(e instanceof Error ? e.message : String(e))
    } finally {
      setDecrypting(null)
    }
  }, [currentAccount, network, suiClient, signPersonalMessage])

  const stepLabel: Record<string, string> = {
    encrypting: 'Seal Encrypting…',
    encoding: 'Encoding blob…',
    register: 'Sign Register Tx…',
    uploading: 'Uploading to nodes…',
    certify: 'Sign Certify Tx…',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Database size={20} color={C.green} />
        </div>
        <div>
          <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 18, fontWeight: 600, color: C.heading, margin: 0 }}>Data Assets</h2>
          <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>Select file → Seal encrypt → Upload to Walrus (wallet-owned)</p>
        </div>
      </div>

      {error && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle size={16} color="#EF4444" />
          <span style={{ fontSize: 13, color: '#EF4444' }}>{error}</span>
        </div>
      )}

      {/* Upload form */}
      <div style={card}>
        <div style={{ marginBottom: 16 }}>
          <span style={label}>Dataset Name</span>
          <input style={input} placeholder="Q1 Revenue Report" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <span style={label}>File</span>
          <div
            style={{ padding: 20, borderRadius: 12, border: `2px dashed ${C.border}`, background: C.bg, textAlign: 'center', cursor: 'pointer' }}
            onClick={() => fileRef.current?.click()}
          >
            {file ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <FileText size={16} color={C.primary} />
                <span style={{ fontSize: 13, color: C.text, fontWeight: 600 }}>{file.name}</span>
                <span style={{ fontSize: 11, color: C.textMuted }}>({formatSize(file.size)})</span>
                <button onClick={(e) => { e.stopPropagation(); clearFile() }} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', display: 'flex', padding: 2 }} aria-label="Remove file">
                  <X size={14} />
                </button>
              </div>
            ) : (
              <div>
                <Upload size={24} color={C.textMuted} style={{ marginBottom: 8 }} />
                <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>Click to select any file</p>
                <p style={{ fontSize: 11, color: C.textMuted, margin: '4px 0 0' }}>.txt, .csv, .json, .pdf, .png, .zip, …</p>
              </div>
            )}
          </div>
          <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleFileSelect} />
        </div>
        <button
          style={{ ...btnPrimary, opacity: uploading || !fileBytes ? 0.5 : 1 }}
          onClick={handleUpload}
          disabled={uploading || !fileBytes}
        >
          {uploading
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> {uploadStep ? stepLabel[uploadStep] : 'Processing…'}</>
            : <><Lock size={16} /> <Upload size={16} /> Seal Encrypt & Upload to Walrus</>
          }
        </button>
        {uploading && uploadStep && (
          <div style={{ marginTop: 8, fontSize: 11, color: C.textMuted, textAlign: 'center' }}>
            User signs 2 transactions: Register blob + Certify blob → Blob owned by your wallet
          </div>
        )}
      </div>

      {/* Uploaded this session */}
      {uploaded.length > 0 && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Database size={16} color={C.accent} />
            <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>
              Uploaded This Session ({uploaded.length})
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {uploaded.map((a, i) => (
              <div key={i} style={{ padding: 14, borderRadius: 12, border: `1px solid rgba(16,185,129,0.3)`, background: C.bg }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.heading }}>{a.name}</span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: C.green }}>
                    <CheckCircle size={12} /> Sealed & Wallet-Owned
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, fontSize: 11, color: C.textMuted }}>
                  <span>Blob: {a.blobId.slice(0, 12)}…{a.blobId.slice(-6)}</span>
                  <span>{formatSize(a.originalSize)} → {formatSize(a.encryptedSize)} encrypted</span>
                </div>
                <a href={`${AGGREGATORS[network]}/v1/blobs/${a.blobId}`} target="_blank" rel="noopener noreferrer" style={{ ...btnSm, borderColor: 'rgba(16,185,129,0.3)', color: C.green, textDecoration: 'none' }}>
                  <ExternalLink size={12} /> View on Walrus
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ My Walrus Blobs (on-chain) ═══ */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Eye size={16} color={C.primary} />
            <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>
              My Walrus Blobs
            </span>
            {walrusBlobs.length > 0 && (
              <span style={{ fontSize: 11, color: C.textMuted }}>({walrusBlobs.length})</span>
            )}
          </div>
          <button onClick={fetchWalrusBlobs} disabled={loadingBlobs} style={{ ...btnSm, borderColor: 'rgba(59,130,246,0.3)', color: C.primary }}>
            <RefreshCw size={12} style={loadingBlobs ? { animation: 'spin 1s linear infinite' } : undefined} /> Refresh
          </button>
        </div>

        {blobError && (
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#EF4444' }}>{blobError}</span>
          </div>
        )}
        {decryptError && (
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: '#EF4444' }}>{decryptError}</span>
          </div>
        )}

        {loadingBlobs && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Loader2 size={20} color={C.primary} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>Querying wallet for Walrus Blob objects…</p>
          </div>
        )}

        {!loadingBlobs && walrusBlobs.length === 0 && !blobError && (
          <div style={{ textAlign: 'center', padding: 24 }}>
            <Database size={24} color={C.textMuted} style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>No Walrus Blob objects found in this wallet.</p>
          </div>
        )}

        {!loadingBlobs && walrusBlobs.length > 0 && (() => {
          const currentEpoch = Math.max(...walrusBlobs.map(b => b.registeredEpoch))
          const activeBlobs = walrusBlobs
            .filter(b => !(b.endEpoch > 0 && b.endEpoch <= currentEpoch))
            .sort((a, b) => b.registeredEpoch - a.registeredEpoch)
          if (activeBlobs.length === 0) return (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Database size={24} color={C.textMuted} style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>All blobs have expired.</p>
            </div>
          )
          return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {activeBlobs.map((b) => {
              const isDecrypting = decrypting === b.objectId
              const data = decryptedData[b.objectId]
              const borderColor = data ? 'rgba(16,185,129,0.3)' : C.border
              return (
                <div key={b.objectId} style={{ padding: 14, borderRadius: 12, border: `1px solid ${borderColor}`, background: C.bg }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <code style={{ fontSize: 12, color: C.primary, fontWeight: 700, fontFamily: "'Exo 2',monospace" }}>
                      {b.blobId.length > 24 ? `${b.blobId.slice(0, 12)}…${b.blobId.slice(-8)}` : b.blobId}
                    </code>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      {b.endEpoch > 0 && (
                        <span style={{ fontSize: 10, fontWeight: 600, color: C.green, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.1)' }}>ACTIVE</span>
                      )}
                      {data && (
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 700, color: C.green }}>
                          <Unlock size={12} /> Decrypted
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 10, fontSize: 11, color: C.textMuted }}>
                    <span>Size: {b.size > 0 ? formatSize(b.size) : 'N/A'}</span>
                    <span>{b.deletable ? '🗑 Deletable' : '🔒 Permanent'}</span>
                    <span>Registered: epoch {b.registeredEpoch}</span>
                    <span>Expires: epoch {b.endEpoch}</span>
                    <span>Storage: epoch {b.startEpoch}→{b.endEpoch}</span>
                    <span>Obj: {b.objectId.slice(0, 10)}…{b.objectId.slice(-4)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <a href={`${AGGREGATORS[network]}/v1/blobs/${b.blobId}`} target="_blank" rel="noopener noreferrer" style={{ ...btnSm, borderColor: 'rgba(16,185,129,0.3)', color: C.green, textDecoration: 'none' }}>
                      <ExternalLink size={12} /> View on Walrus
                    </a>
                    {!data && (
                      <button style={{ ...btnSm, borderColor: 'rgba(245,158,11,0.3)', color: C.accent }} onClick={() => handleDecrypt(b)} disabled={isDecrypting}>
                        {isDecrypting
                          ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Decrypting…</>
                          : <><Unlock size={12} /> Fetch & Decrypt</>}
                      </button>
                    )}
                  </div>
                  {data && (
                    <div style={{ marginTop: 10, padding: 12, borderRadius: 10, background: C.surface, border: `1px solid ${C.border}`, maxHeight: 300, overflow: 'auto' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <span style={{ fontSize: 11, color: C.textMuted }}>{data.text ? 'Text content' : 'Binary content'} · {formatSize(data.raw.length)}</span>
                        <button style={{ ...btnSm, padding: '4px 8px', fontSize: 11 }} onClick={() => {
                          const blob = new Blob([data.raw.buffer as ArrayBuffer])
                          const url = URL.createObjectURL(blob)
                          const a = document.createElement('a')
                          a.href = url; a.download = `blob_${b.blobId.slice(0, 8)}`; a.click()
                          URL.revokeObjectURL(url)
                        }}>Download</button>
                      </div>
                      {data.text ? (
                        <pre style={{ fontSize: 12, color: C.text, fontFamily: "'Exo 2',monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                          {data.text.slice(0, 5000)}{data.text.length > 5000 ? '\n…(truncated)' : ''}
                        </pre>
                      ) : (
                        <div style={{ fontSize: 12, color: C.textMuted }}>Binary data ({formatSize(data.raw.length)}). Use Download to save.</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          )
        })()}
      </div>

      <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', padding: '8px 0' }}>
        Network: {network} · Aggregator: {AGGREGATORS[network]}
      </div>
    </div>
  )
}

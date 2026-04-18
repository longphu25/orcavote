import { useState, useEffect } from 'react'
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'
import { X, Database, Check, Loader2, RefreshCw } from 'lucide-react'
import { C } from './theme'

export interface WalrusBlob {
  objectId: string
  blobId: string
  size: number
  registeredEpoch: number
  certifiedEpoch: number | null
  endEpoch: number
  startEpoch: number
  deletable: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (blob: WalrusBlob) => void
}

/**
 * Walrus testnet package ID — resolved from the system object.
 * We use a known type prefix to query owned Blob objects.
 */
const WALRUS_BLOB_TYPE_TESTNET = '0xd84704c17fc870b8764832c535aa6b11f21a95cd6f5bb38a9b07d2cf42220c66::blob::Blob'
const WALRUS_BLOB_TYPE_MAINNET = '0xfdc88f7d7cf30afab2f82e8380d11ee8f70efb90e863d1de8616fae1bb09ea77::blob::Blob'

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

export default function BlobIdPicker({ open, onClose, onSelect }: Props) {
  const currentAccount = useCurrentAccount()
  const suiClient = useSuiClient()
  const [blobs, setBlobs] = useState<WalrusBlob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const fetchBlobs = async () => {
    if (!currentAccount) return
    setLoading(true)
    setError(null)
    try {
      // Try testnet type first, then mainnet
      let allData: WalrusBlob[] = []
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
            allData.push({
              objectId: obj.objectId,
              blobId: blobIdToBase64url(String(fields.blob_id ?? '0')),
              size: Number(fields.size ?? 0),
              registeredEpoch: Number(fields.registered_epoch ?? 0),
              certifiedEpoch: fields.certified_epoch != null ? Number(fields.certified_epoch) : null,
              startEpoch: Number(storage?.start_epoch ?? 0),
              endEpoch: Number(storage?.end_epoch ?? 0),
              deletable: Boolean(fields.deletable),
            })
          }
          if (allData.length > 0) break // found blobs, stop trying other types
        } catch {
          // type not found on this network, try next
        }
      }
      setBlobs(allData)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open && currentAccount) fetchBlobs()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, currentAccount?.address])

  if (!open) return null

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        style={{
          width: 540, maxHeight: '75vh', borderRadius: 16,
          border: `1px solid ${C.border}`, background: C.surface,
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)', overflow: 'hidden',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Database size={16} color={C.accent} />
            <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>
              Walrus Blobs (Owned by Wallet)
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={fetchBlobs} disabled={loading} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', display: 'flex', padding: 4 }} aria-label="Refresh">
              <RefreshCw size={14} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: C.textMuted, cursor: 'pointer', display: 'flex', padding: 4 }} aria-label="Close">
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 16, maxHeight: '55vh', overflowY: 'auto' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Loader2 size={24} color={C.primary} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
              <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>Querying wallet for Walrus Blob objects…</p>
            </div>
          )}

          {error && (
            <div style={{ padding: 16, borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: 12 }}>
              <span style={{ fontSize: 13, color: '#EF4444' }}>{error}</span>
            </div>
          )}

          {!loading && blobs.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Database size={32} color={C.textMuted} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>No Walrus Blob objects found in this wallet.</p>
              <p style={{ fontSize: 12, color: C.textMuted, margin: '8px 0 0' }}>
                Upload data via Walrus CLI or SDK to create owned Blob objects.
              </p>
            </div>
          )}

          {!loading && blobs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blobs.map((b) => (
                <div
                  key={b.objectId}
                  onClick={() => setSelected(b.objectId)}
                  style={{
                    padding: 14, borderRadius: 12, cursor: 'pointer',
                    border: `1px solid ${selected === b.objectId ? C.primary : C.border}`,
                    background: selected === b.objectId ? 'rgba(59,130,246,0.08)' : C.bg,
                    transition: 'border-color 0.15s',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <code style={{ fontSize: 12, color: C.primary, fontFamily: "'Exo 2',monospace" }}>
                      {b.blobId.length > 24 ? `${b.blobId.slice(0, 12)}…${b.blobId.slice(-8)}` : b.blobId}
                    </code>
                    {selected === b.objectId && <Check size={16} color={C.primary} />}
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 11, color: C.textMuted }}>
                    <span>Size: {b.size > 0 ? `${(b.size / 1024).toFixed(1)} KB` : 'N/A'}</span>
                    <span>Epoch: {b.registeredEpoch}</span>
                    <span>{b.deletable ? 'Deletable' : 'Permanent'}</span>
                  </div>
                  <div style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
                    Object: {b.objectId.slice(0, 10)}…{b.objectId.slice(-6)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        {blobs.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
              background: 'transparent', color: C.text, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
            }}>Cancel</button>
            <button
              disabled={!selected}
              onClick={() => {
                const blob = blobs.find((b) => b.objectId === selected)
                if (blob) { onSelect(blob); onClose() }
              }}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none',
                background: selected ? C.primary : C.border, color: selected ? '#fff' : C.textMuted,
                fontSize: 13, fontWeight: 700, cursor: selected ? 'pointer' : 'default',
                fontFamily: "'Exo 2',sans-serif",
              }}
            >Select</button>
          </div>
        )}
      </div>
    </div>
  )
}

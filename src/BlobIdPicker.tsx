import { useState, useEffect } from 'react'
import { useSuiClientContext } from '@mysten/dapp-kit'
import { X, Database, Check, Loader2, RefreshCw, ExternalLink } from 'lucide-react'
import { C } from './theme'
import { AGGREGATORS } from './seal-walrus'
import type { NetworkKey } from './seal-walrus'
import { useWalrusBlobs } from './useWalrusBlobs'
export type { WalrusBlob } from './useWalrusBlobs'

interface Props {
  open: boolean
  onClose: () => void
  onSelect: (blob: import('./useWalrusBlobs').WalrusBlob) => void
}

function formatSize(bytes: number): string {
  if (bytes <= 0) return 'N/A'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function BlobIdPicker({ open, onClose, onSelect }: Props) {
  const ctx = useSuiClientContext()
  const network = (ctx.network ?? 'testnet') as NetworkKey
  const { activeBlobs, loading, error, fetchBlobs } = useWalrusBlobs(false)
  const [selected, setSelected] = useState<string | null>(null)

  useEffect(() => {
    if (open) fetchBlobs()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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
              My Walrus Blobs
            </span>
            {activeBlobs.length > 0 && (
              <span style={{ fontSize: 11, color: C.textMuted }}>({activeBlobs.length})</span>
            )}
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

          {!loading && activeBlobs.length === 0 && !error && (
            <div style={{ textAlign: 'center', padding: 32 }}>
              <Database size={32} color={C.textMuted} style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>No Walrus Blob objects found.</p>
            </div>
          )}

          {!loading && activeBlobs.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {activeBlobs.map((b) => {
                const isSelected = selected === b.objectId
                return (
                  <div
                    key={b.objectId}
                    onClick={() => setSelected(b.objectId)}
                    style={{
                      padding: 14, borderRadius: 12, cursor: 'pointer',
                      border: `1px solid ${isSelected ? C.primary : C.border}`,
                      background: isSelected ? 'rgba(59,130,246,0.08)' : C.bg,
                      transition: 'border-color 0.15s',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                      <code style={{ fontSize: 12, color: C.primary, fontWeight: 700, fontFamily: "'Exo 2',monospace" }}>
                        {b.blobId.length > 24 ? `${b.blobId.slice(0, 12)}…${b.blobId.slice(-8)}` : b.blobId}
                      </code>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {b.endEpoch > 0 && (
                          <span style={{ fontSize: 10, fontWeight: 600, color: C.green, padding: '2px 6px', borderRadius: 4, background: 'rgba(16,185,129,0.1)' }}>ACTIVE</span>
                        )}
                        {isSelected && <Check size={16} color={C.primary} />}
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 8, fontSize: 11, color: C.textMuted }}>
                      <span>Size: {formatSize(b.size)}</span>
                      <span>{b.deletable ? '🗑 Deletable' : '🔒 Permanent'}</span>
                      <span>Registered: epoch {b.registeredEpoch}</span>
                      <span>Expires: epoch {b.endEpoch}</span>
                    </div>
                    <a
                      href={`${AGGREGATORS[network]}/v1/blobs/${b.blobId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 11, fontWeight: 600, color: C.green, textDecoration: 'none',
                        padding: '4px 8px', borderRadius: 6,
                        border: '1px solid rgba(16,185,129,0.3)',
                      }}
                    >
                      <ExternalLink size={10} /> View on Walrus
                    </a>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        {activeBlobs.length > 0 && (
          <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button onClick={onClose} style={{
              padding: '8px 16px', borderRadius: 8, border: `1px solid ${C.border}`,
              background: 'transparent', color: C.text, fontSize: 13, fontWeight: 600,
              cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
            }}>Cancel</button>
            <button
              disabled={!selected}
              onClick={() => {
                const blob = activeBlobs.find((b) => b.objectId === selected)
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

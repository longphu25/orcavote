import { useState, useCallback, useMemo, useEffect } from 'react'
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientContext,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit'
import {
  Vote,
  Loader2,
  CheckCircle,
  XCircle,
  ExternalLink,
  Users,
  Calendar,
  Hash,
  Zap,
  ChevronRight,
} from 'lucide-react'
import { C } from './theme'
import type { MerkleResult } from './zk-merkle'
import type { UploadResult } from './seal-walrus'
import {
  createPollFullTx,
  parsePollIdFromEvents,
  suiScanTxUrl,
} from './poll-transactions'
import type { NetworkKey } from './seal-walrus'
import { buildFullMerklePath, hexToBigInt } from './merkle-pad'

/* ─── styles ─── */
const card = {
  padding: 24, borderRadius: 16,
  border: `1px solid ${C.border}`, background: C.surface, marginBottom: 20,
} as const

const label = {
  fontSize: 11, color: C.textMuted,
  textTransform: 'uppercase' as const, letterSpacing: 1, marginBottom: 6, display: 'block',
}

const inputStyle = {
  width: '100%', padding: '10px 14px', borderRadius: 10,
  border: `1px solid ${C.border}`, background: C.bg, color: C.text,
  fontSize: 14, fontFamily: "'Exo 2',sans-serif", outline: 'none',
} as const

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '12px 24px', borderRadius: 10,
  background: C.accent, color: '#000', fontSize: 14, fontWeight: 700,
  border: 'none', cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
  width: '100%', justifyContent: 'center',
} as const

/* ─── helpers ─── */
/** Format a Date to `YYYY-MM-DDTHH:mm` in local timezone for datetime-local input */
function toLocalISOString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convert bigint to 32-byte little-endian hex string (for council_root on-chain) */
function bigintToLEHex(n: bigint): string {
  const bytes = new Uint8Array(32)
  let v = n
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(v & 0xFFn)
    v >>= 8n
  }
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

/* ─── Props ─── */
interface CreatePollPanelProps {
  merkleResult: MerkleResult | null
  uploadResults: Record<number, UploadResult>
  selectedBlobId: string   // data asset blob ID
  selectedSealId: string   // data asset seal identity (owner address)
  pollTitle: string        // from ZkMerklePanel input
  onNavigateToPoll?: (pollId: string) => void
}

/* ─── Component ─── */
export default function CreatePollPanel({
  merkleResult,
  uploadResults,
  selectedBlobId,
  selectedSealId,
  pollTitle: initialTitle,
  onNavigateToPoll,
}: CreatePollPanelProps) {
  const currentAccount = useCurrentAccount()
  const suiClient = useSuiClient()
  const ctx = useSuiClientContext()
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
  const network = (ctx.network ?? 'testnet') as NetworkKey

  // Form state
  const [title, setTitle] = useState(initialTitle)
  const [threshold, setThreshold] = useState(1)
  const [votingDeadline, setVotingDeadline] = useState(() => {
    const d = new Date(Date.now() + 3600_000)
    d.setSeconds(0, 0)
    return toLocalISOString(d)
  })

  // Tx state
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [txDigest, setTxDigest] = useState<string | null>(null)
  const [pollId, setPollId] = useState<string | null>(null)

  // Derived
  const voterCount = merkleResult?.identities.length ?? 0
  const uploadedCount = Object.keys(uploadResults).length
  const allUploaded = merkleResult ? voterCount === uploadedCount : false
  const councilRoot = merkleResult?.root ?? null
  const minDeadline = useMemo(() => toLocalISOString(new Date()), [])

  // Compute full depth-10 Merkle root (WASM may return depth=0)
  const [fullRoot, setFullRoot] = useState<bigint | null>(null)
  useEffect(() => {
    if (!merkleResult) { setFullRoot(null); return }
    const commitments = merkleResult.commitments.map(c => hexToBigInt(c))
    buildFullMerklePath(commitments, 0).then(r => setFullRoot(r.root))
  }, [merkleResult])

  const canSubmit =
    !!currentAccount &&
    !!councilRoot &&
    !!fullRoot &&
    allUploaded &&
    title.trim().length > 0 &&
    threshold >= 1 &&
    votingDeadline.length > 0 &&
    !submitting &&
    !pollId

  const handleCreatePoll = useCallback(async () => {
    if (!merkleResult || !currentAccount || !fullRoot) return
    setSubmitting(true)
    setError(null)
    try {
      const votingEnd = new Date(votingDeadline).getTime()
      if (isNaN(votingEnd) || votingEnd <= Date.now()) {
        throw new Error('Voting deadline must be in the future')
      }

      // Build voter arrays from upload results
      const voters: string[] = []
      const walrusBlobIds: string[] = []
      const sealIdentities: string[] = []

      for (let i = 0; i < merkleResult.identities.length; i++) {
        const identity = merkleResult.identities[i]
        const upload = uploadResults[i]
        if (!upload) throw new Error(`Missing upload for voter #${i}`)
        voters.push(identity.address)
        walrusBlobIds.push(upload.blobId)
        sealIdentities.push(identity.address) // Seal identity = voter address
      }

      // Build single PTB: create_poll + register_voters + start_voting
      // Convert depth-10 root bigint to LE hex for the contract
      const rootLE = bigintToLEHex(fullRoot)
      const tx = await createPollFullTx({
        dataBlobId: selectedBlobId || 'none',
        dataSealIdentity: selectedSealId || currentAccount.address,
        councilRoot: rootLE,
        threshold,
        votingEnd,
        title: title.trim(),
        voters,
        walrusBlobIds,
        sealIdentities,
      })

      // Sign + execute
      await signAndExecute(
        { transaction: tx },
        {
          onSuccess: async (data) => {
            setTxDigest(data.digest)
            // Fetch full tx to get events
            const fullTx = await suiClient.waitForTransaction({
              digest: data.digest,
              options: { showEvents: true },
            })
            const events = (fullTx.events ?? []) as Array<{ type: string; parsedJson?: Record<string, unknown> }>
            const id = parsePollIdFromEvents(events)
            if (id) setPollId(id)
          },
        },
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSubmitting(false)
    }
  }, [
    merkleResult, currentAccount, fullRoot, votingDeadline,
    uploadResults, selectedBlobId, selectedSealId, threshold, title,
    signAndExecute, suiClient,
  ])

  // Don't render if no merkle result yet
  if (!merkleResult) return null

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <Vote size={16} color={C.accent} />
        <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>
          Create Poll On-Chain
        </span>
      </div>

      {/* Status summary */}
      <div style={{ display: 'grid', gap: 6, marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: C.bg }}>
          <span style={{ fontSize: 13, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Hash size={12} /> Council Root
          </span>
          <code style={{ fontSize: 11, color: fullRoot ? C.green : C.textMuted, fontFamily: "'Exo 2',monospace" }}>
            {fullRoot ? (() => { const h = fullRoot.toString(16).padStart(64, '0'); return `${h.slice(0, 12)}…${h.slice(-6)}` })() : 'Not built'}
          </code>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: C.bg }}>
          <span style={{ fontSize: 13, color: C.textMuted, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Users size={12} /> Voters Uploaded
          </span>
          <span style={{ fontSize: 13, fontWeight: 700, color: allUploaded ? C.green : C.accent }}>
            {uploadedCount} / {voterCount}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle size={14} color="#EF4444" />
          <span style={{ fontSize: 12, color: '#EF4444', wordBreak: 'break-word' }}>{error}</span>
        </div>
      )}

      {/* Success */}
      {txDigest && (
        <div style={{ padding: 16, borderRadius: 12, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <CheckCircle size={16} color={C.green} />
            <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>Poll Created & Voting Started!</span>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {pollId && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: C.bg }}>
                <span style={{ fontSize: 11, color: C.textMuted }}>Poll ID</span>
                <button
                  onClick={() => onNavigateToPoll?.(pollId)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontSize: 11, color: C.primary, fontFamily: "'Exo 2',monospace",
                    background: 'none', border: 'none', cursor: 'pointer', padding: 0,
                    textDecoration: 'underline', textUnderlineOffset: 2,
                  }}
                >
                  {pollId.slice(0, 10)}…{pollId.slice(-6)} <ChevronRight size={10} />
                </button>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, background: C.bg }}>
              <span style={{ fontSize: 11, color: C.textMuted }}>Tx Digest</span>
              <a href={suiScanTxUrl(txDigest, network)} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, color: C.primary, fontFamily: "'Exo 2',monospace", textDecoration: 'none' }}>
                {txDigest.slice(0, 10)}…{txDigest.slice(-6)} <ExternalLink size={10} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Form — only show if not yet created */}
      {!pollId && (
        <>
          <div style={{ display: 'grid', gap: 12, marginBottom: 16 }}>
            <div>
              <span style={label}>Poll Title</span>
              <input style={inputStyle} placeholder="DAO Proposal #1" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <span style={label}>Threshold (min YES votes)</span>
                <input style={inputStyle} type="number" min={1} max={voterCount || 999} value={threshold} onChange={(e) => setThreshold(Math.max(1, parseInt(e.target.value) || 1))} />
              </div>
              <div>
                <span style={label}>
                  <Calendar size={10} style={{ display: 'inline', marginRight: 4 }} />
                  Voting Deadline
                </span>
                <input
                  style={inputStyle}
                  type="datetime-local"
                  value={votingDeadline}
                  min={minDeadline}
                  onChange={(e) => setVotingDeadline(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Warnings */}
          {!allUploaded && (
            <div style={{ padding: 10, borderRadius: 8, background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: C.accent }}>
                Upload all identity blobs before creating the poll ({uploadedCount}/{voterCount} done)
              </span>
            </div>
          )}

          {/* Submit button */}
          <button
            style={{ ...btnPrimary, opacity: canSubmit ? 1 : 0.4 }}
            onClick={handleCreatePoll}
            disabled={!canSubmit}
          >
            {submitting ? (
              <>
                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                Creating Poll…
              </>
            ) : (
              <>
                <Zap size={16} />
                Create Poll + Register Voters + Start Voting
              </>
            )}
          </button>
          <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 8 }}>
            Single transaction: create_poll → register_voters → start_voting
          </div>
        </>
      )}
    </div>
  )
}

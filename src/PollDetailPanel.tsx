import { useState, useCallback, useEffect } from 'react'
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientContext,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit'
import {
  ArrowLeft,
  Vote,
  Loader2,
  CheckCircle,
  XCircle,
  ExternalLink,
  Clock,
  ThumbsUp,
  ThumbsDown,
  Shield,
  Lock,
  Zap,
} from 'lucide-react'
import { C } from './theme'
import {
  PACKAGE_ID,
  REGISTRY_ID,
  STATUS_LABELS,
  STATUS_COLORS,
  submitVoteTx,
  suiScanTxUrl,
} from './poll-transactions'
import type { PollInfo } from './poll-transactions'
import type { NetworkKey } from './seal-walrus'
import { fetchBlobFromWalrus } from './seal-walrus'
import { Transaction } from '@mysten/sui/transactions'
import type { IdentityBlob } from './zk-merkle'
import {
  generateProof,
  formatForSui,
  hashSignal,
  hashExternalNullifier,
  preloadCircuit,
} from './zk-prove'
import { buildFullMerklePath, hexToBigInt } from './merkle-pad'

/* ─── styles ─── */
const card = {
  padding: 24, borderRadius: 16,
  border: `1px solid ${C.border}`, background: C.surface, marginBottom: 20,
} as const

const btnPrimary = {
  display: 'inline-flex', alignItems: 'center', gap: 8,
  padding: '12px 24px', borderRadius: 10,
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

/* ─── Props ─── */
interface PollDetailPanelProps {
  poll: PollInfo
  onBack: () => void
}

type VoteStep = 'idle' | 'fetching-ref' | 'decrypting' | 'proving' | 'submitting' | 'done'

/* ─── Component ─── */
export default function PollDetailPanel({ poll, onBack }: PollDetailPanelProps) {
  const currentAccount = useCurrentAccount()
  const suiClient = useSuiClient()
  const ctx = useSuiClientContext()
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction()
  const network = (ctx.network ?? 'testnet') as NetworkKey

  const [choice, setChoice] = useState<number | null>(null) // 0=NO, 1=YES
  const [step, setStep] = useState<VoteStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txDigest, setTxDigest] = useState<string | null>(null)
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null)
  const [checkingReg, setCheckingReg] = useState(false)

  // Live poll data
  const [liveYes, setLiveYes] = useState(poll.yesCount)
  const [liveNo, setLiveNo] = useState(poll.noCount)
  const [liveStatus, setLiveStatus] = useState(poll.status)
  const [liveTitle, setLiveTitle] = useState(poll.title)
  const [liveThreshold, setLiveThreshold] = useState(poll.threshold)
  const [liveTotalVoters, setLiveTotalVoters] = useState(poll.totalVoters)
  const [liveVotingEnd, setLiveVotingEnd] = useState(poll.votingEnd)
  const [liveAdmin, _setLiveAdmin] = useState(poll.admin)

  const statusColor = STATUS_COLORS[liveStatus] ?? C.textMuted
  const statusLabel = STATUS_LABELS[liveStatus] ?? 'Unknown'
  const isVoting = liveStatus === 1
  const totalVotes = liveYes + liveNo
  const yesPercent = totalVotes > 0 ? Math.round((liveYes / totalVotes) * 100) : 0
  const deadline = new Date(liveVotingEnd)
  const isExpired = Date.now() > liveVotingEnd

  // Preload circuit artifacts when entering poll detail
  useEffect(() => { preloadCircuit() }, [])

  // Check if current user is registered voter
  useEffect(() => {
    if (!currentAccount) return
    setCheckingReg(true)
    ;(async () => {
      try {
        const tx = new Transaction()
        tx.moveCall({
          target: `${PACKAGE_ID}::governance::is_voter_registered`,
          arguments: [
            tx.object(REGISTRY_ID),
            tx.pure.id(poll.pollId),
            tx.pure.address(currentAccount.address),
          ],
        })
        const result = await suiClient.devInspectTransactionBlock({
          transactionBlock: tx,
          sender: currentAccount.address,
        })
        const retVal = result.results?.[0]?.returnValues?.[0]?.[0]
        setIsRegistered(retVal ? (retVal as number[])[0] === 1 : false)
      } catch {
        setIsRegistered(null)
      } finally {
        setCheckingReg(false)
      }
    })()
  }, [currentAccount, poll.pollId, suiClient])

  // Refresh tally
  const refreshTally = useCallback(async () => {
    try {
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::governance::poll_tally`,
        arguments: [tx.object(REGISTRY_ID), tx.pure.id(poll.pollId)],
      })
      const result = await suiClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      })
      const yesBytes = result.results?.[0]?.returnValues?.[0]?.[0]
      const noBytes = result.results?.[0]?.returnValues?.[1]?.[0]
      if (yesBytes) setLiveYes(parseBcsU64(yesBytes as number[]))
      if (noBytes) setLiveNo(parseBcsU64(noBytes as number[]))

      // Also refresh status
      const tx2 = new Transaction()
      tx2.moveCall({
        target: `${PACKAGE_ID}::governance::poll_status`,
        arguments: [tx2.object(REGISTRY_ID), tx2.pure.id(poll.pollId)],
      })
      const statusResult = await suiClient.devInspectTransactionBlock({
        transactionBlock: tx2,
        sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
      })
      const statusBytes = statusResult.results?.[0]?.returnValues?.[0]?.[0]
      if (statusBytes) setLiveStatus((statusBytes as number[])[0] ?? poll.status)

      // Fetch additional fields (title, threshold, totalVoters, votingEnd)
      const fields = ['poll_title', 'poll_threshold', 'poll_total_voters', 'poll_voting_end'] as const
      const fieldResults = await Promise.all(
        fields.map(async (fn) => {
          try {
            const ftx = new Transaction()
            ftx.moveCall({
              target: `${PACKAGE_ID}::governance::${fn}`,
              arguments: [ftx.object(REGISTRY_ID), ftx.pure.id(poll.pollId)],
            })
            const r = await suiClient.devInspectTransactionBlock({
              transactionBlock: ftx,
              sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
            })
            return r.results?.[0]?.returnValues?.[0]?.[0] ?? null
          } catch { return null }
        }),
      )

      const [titleBytes, thresholdBytes, totalVotersBytes, votingEndBytes] = fieldResults
      if (titleBytes) {
        try {
          // BCS vector<u8>: first byte(s) = length prefix, rest = UTF-8 data
          const raw = titleBytes as number[]
          // ULEB128 length prefix
          let offset = 0
          let len = 0
          let shift = 0
          while (offset < raw.length) {
            const b = raw[offset++]
            len |= (b & 0x7f) << shift
            if ((b & 0x80) === 0) break
            shift += 7
          }
          const decoded = new TextDecoder().decode(Uint8Array.from(raw.slice(offset, offset + len)))
          if (decoded) setLiveTitle(decoded)
        } catch { /* keep existing */ }
      }
      if (thresholdBytes) setLiveThreshold(parseBcsU64(thresholdBytes as number[]))
      if (totalVotersBytes) setLiveTotalVoters(parseBcsU64(totalVotersBytes as number[]))
      if (votingEndBytes) setLiveVotingEnd(parseBcsU64(votingEndBytes as number[]))
    } catch { /* ignore */ }
  }, [suiClient, poll.pollId, poll.status])

  useEffect(() => { refreshTally() }, [refreshTally])

  // ─── Vote flow ───
  const handleVote = useCallback(async () => {
    if (choice === null || !currentAccount) return
    setError(null)
    setStep('fetching-ref')

    try {
      // 1. Get voter's identity ref (walrus_blob_id + seal_identity)
      const tx = new Transaction()
      tx.moveCall({
        target: `${PACKAGE_ID}::governance::get_voter_ref`,
        arguments: [
          tx.object(REGISTRY_ID),
          tx.pure.id(poll.pollId),
          tx.pure.address(currentAccount.address),
        ],
      })
      const refResult = await suiClient.devInspectTransactionBlock({
        transactionBlock: tx,
        sender: currentAccount.address,
      })

      const walrusBlobIdBytes = refResult.results?.[0]?.returnValues?.[0]?.[0] as number[] | undefined
      if (!walrusBlobIdBytes) throw new Error('Could not fetch voter identity reference')

      // Decode walrus blob ID from BCS vector<u8>
      // BCS vector has a ULEB128 length prefix before the actual data bytes
      const blobIdStr = decodeBcsVectorU8AsString(walrusBlobIdBytes)

      // 2. Fetch identity blob from Walrus (plaintext — not Seal encrypted)
      setStep('decrypting')
      const rawBytes = await fetchBlobFromWalrus(blobIdStr, network)
      const identity: IdentityBlob = JSON.parse(new TextDecoder().decode(rawBytes))

      // 3. Build full-depth Merkle tree and get proof path
      //    WASM may return depth=0 for single-leaf trees — we rebuild to depth 10
      setStep('proving')
      const commitmentBigints = [hexToBigInt(identity.identity_commitment)]
      const fullPath = await buildFullMerklePath(commitmentBigints, identity.leaf_index)

      const signalHash = await hashSignal(choice)
      const externalNullifier = await hashExternalNullifier(poll.pollId)

      const proofResult = await generateProof({
        identity_secret: identity.identity_secret,
        identity_nullifier: identity.identity_nullifier,
        path_elements: fullPath.pathElements.map(e => e.toString()),
        path_indices: fullPath.pathIndices,
        merkle_root: fullPath.root.toString(),
        external_nullifier: externalNullifier,
        signal_hash: signalHash,
      })

      const suiProof = formatForSui(proofResult)

      // 5. Submit vote on-chain
      setStep('submitting')
      const voteTx = submitVoteTx({
        pollId: poll.pollId,
        proofBytes: suiProof.proofBytes,
        publicInputsBytes: suiProof.publicInputsBytes,
        nullifier: suiProof.nullifier,
        choice,
      })

      await signAndExecute(
        { transaction: voteTx },
        {
          onSuccess: (data) => {
            setTxDigest(data.digest)
            setStep('done')
            // Refresh tally after vote
            setTimeout(refreshTally, 2000)
          },
        },
      )
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
      setStep('idle')
    }
  }, [choice, currentAccount, poll.pollId, suiClient, network, signAndExecute, refreshTally])

  const stepLabels: Record<VoteStep, string> = {
    'idle': '',
    'fetching-ref': 'Fetching identity reference…',
    'decrypting': 'Decrypting identity with Seal…',
    'proving': 'Generating ZK proof (may take a few seconds)…',
    'submitting': 'Submitting vote on-chain…',
    'done': 'Vote submitted!',
  }

  const canVote = isVoting && !isExpired && isRegistered && choice !== null && step === 'idle' && !txDigest

  return (
    <div>
      {/* Back button */}
      <button
        onClick={onBack}
        style={{
          ...btnSm, marginBottom: 20, color: C.textMuted,
          borderColor: 'transparent', padding: '4px 0',
        }}
      >
        <ArrowLeft size={14} /> Back to Polls
      </button>

      {/* Poll header */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 20, fontWeight: 700, color: C.heading, margin: '0 0 8px' }}>
              {liveTitle || 'Loading…'}
            </h2>
            <span style={{
              fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6,
              background: `${statusColor}15`, color: statusColor,
            }}>
              {statusLabel}
            </span>
          </div>
        </div>

        {/* Info grid */}
        <div style={{ display: 'grid', gap: 8 }}>
          {[
            ['Poll ID', `${poll.pollId.slice(0, 10)}…${poll.pollId.slice(-6)}`],
            ['Admin', liveAdmin ? `${liveAdmin.slice(0, 10)}…${liveAdmin.slice(-6)}` : '—'],
            ['Threshold', `${liveThreshold} YES votes needed`],
            ['Voters', `${liveTotalVoters} registered`],
            ['Deadline', liveVotingEnd ? `${deadline.toLocaleString()}${isExpired ? ' (expired)' : ''}` : '—'],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', borderRadius: 8, background: C.bg }}>
              <span style={{ fontSize: 13, color: C.textMuted }}>{k}</span>
              <span style={{ fontSize: 13, color: C.text, fontFamily: "'Exo 2',monospace" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Tally */}
      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <Vote size={16} color={C.primary} />
          <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>
            Results
          </span>
          <span style={{ fontSize: 12, color: C.textMuted, marginLeft: 'auto' }}>
            {totalVotes} / {poll.totalVoters} voted
          </span>
        </div>

        {/* Progress bar */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.green, display: 'flex', alignItems: 'center', gap: 4 }}>
              <ThumbsUp size={12} /> YES: {liveYes}
            </span>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#EF4444', display: 'flex', alignItems: 'center', gap: 4 }}>
              NO: {liveNo} <ThumbsDown size={12} />
            </span>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: C.bg, overflow: 'hidden', display: 'flex' }}>
            {totalVotes > 0 && (
              <>
                <div style={{ height: '100%', width: `${yesPercent}%`, background: C.green, transition: 'width 0.3s' }} />
                <div style={{ height: '100%', width: `${100 - yesPercent}%`, background: '#EF4444', transition: 'width 0.3s' }} />
              </>
            )}
          </div>
          {liveThreshold > 0 && (
            <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6, textAlign: 'center' }}>
              Threshold: {liveThreshold} YES · {liveYes >= liveThreshold ? '✓ Reached' : `${liveThreshold - liveYes} more needed`}
            </div>
          )}
        </div>
      </div>

      {/* Vote section */}
      {isVoting && !isExpired && (
        <div style={card}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Shield size={16} color={C.accent} />
            <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>
              Cast Your Vote (ZK Anonymous)
            </span>
          </div>

          {/* Registration check */}
          {checkingReg && (
            <div style={{ padding: 12, borderRadius: 10, background: C.bg, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Loader2 size={14} color={C.primary} style={{ animation: 'spin 1s linear infinite' }} />
              <span style={{ fontSize: 12, color: C.textMuted }}>Checking voter registration…</span>
            </div>
          )}
          {isRegistered === false && (
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(245,158,11,0.3)', background: 'rgba(245,158,11,0.05)', marginBottom: 16 }}>
              <span style={{ fontSize: 12, color: C.accent }}>
                <Lock size={12} style={{ display: 'inline', marginRight: 4 }} />
                Your wallet is not registered as a voter for this poll.
              </span>
            </div>
          )}

          {/* Vote success */}
          {txDigest && (
            <div style={{ padding: 16, borderRadius: 12, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <CheckCircle size={16} color={C.green} />
                <span style={{ fontSize: 14, fontWeight: 700, color: C.green }}>
                  Vote submitted anonymously!
                </span>
              </div>
              <a href={suiScanTxUrl(txDigest, network)} target="_blank" rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: C.primary, textDecoration: 'none' }}>
                View on SuiScan <ExternalLink size={10} />
              </a>
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ padding: 12, borderRadius: 10, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
              <XCircle size={14} color="#EF4444" />
              <span style={{ fontSize: 12, color: '#EF4444', wordBreak: 'break-word' }}>{error}</span>
            </div>
          )}

          {/* Choice buttons */}
          {!txDigest && isRegistered && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
                <button
                  onClick={() => setChoice(1)}
                  style={{
                    padding: 16, borderRadius: 12, cursor: 'pointer',
                    border: `2px solid ${choice === 1 ? C.green : C.border}`,
                    background: choice === 1 ? 'rgba(16,185,129,0.08)' : C.bg,
                    color: choice === 1 ? C.green : C.text,
                    fontSize: 16, fontWeight: 700, fontFamily: "'Exo 2',sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.15s',
                  }}
                >
                  <ThumbsUp size={18} /> YES
                </button>
                <button
                  onClick={() => setChoice(0)}
                  style={{
                    padding: 16, borderRadius: 12, cursor: 'pointer',
                    border: `2px solid ${choice === 0 ? '#EF4444' : C.border}`,
                    background: choice === 0 ? 'rgba(239,68,68,0.08)' : C.bg,
                    color: choice === 0 ? '#EF4444' : C.text,
                    fontSize: 16, fontWeight: 700, fontFamily: "'Exo 2',sans-serif",
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'all 0.15s',
                  }}
                >
                  <ThumbsDown size={18} /> NO
                </button>
              </div>

              {/* Submit */}
              <button
                style={{ ...btnPrimary, opacity: canVote ? 1 : 0.4 }}
                onClick={handleVote}
                disabled={!canVote}
              >
                {step !== 'idle' ? (
                  <>
                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                    {stepLabels[step]}
                  </>
                ) : (
                  <>
                    <Zap size={16} />
                    Submit Anonymous Vote
                  </>
                )}
              </button>

              <div style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 8 }}>
                Decrypt identity → Generate ZK proof → Submit on-chain (no one knows how you voted)
              </div>
            </>
          )}
        </div>
      )}

      {/* Expired / finalized message */}
      {(!isVoting || isExpired) && (
        <div style={{ ...card, borderColor: `${statusColor}30` }}>
          <div style={{ textAlign: 'center', padding: 12 }}>
            {liveStatus === 2 && <CheckCircle size={32} color={C.green} style={{ marginBottom: 8 }} />}
            {liveStatus === 3 && <XCircle size={32} color="#EF4444" style={{ marginBottom: 8 }} />}
            {liveStatus === 0 && <Lock size={32} color={C.textMuted} style={{ marginBottom: 8 }} />}
            {isExpired && liveStatus === 1 && <Clock size={32} color={C.accent} style={{ marginBottom: 8 }} />}
            <p style={{ fontSize: 14, fontWeight: 600, color: statusColor, margin: 0 }}>
              {liveStatus === 0 && 'Poll is still in setup'}
              {liveStatus === 2 && 'Poll Approved'}
              {liveStatus === 3 && 'Poll Rejected'}
              {isExpired && liveStatus === 1 && 'Voting period ended — awaiting finalization'}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── BCS helpers ─── */
function parseBcsU64(bytes: number[]): number {
  if (!bytes || bytes.length < 8) return 0
  let val = 0n
  for (let i = 0; i < 8; i++) {
    val |= BigInt(bytes[i] ?? 0) << BigInt(i * 8)
  }
  return Number(val)
}

/**
 * Decode a BCS-encoded vector<u8> into a UTF-8 string.
 * BCS vectors have a ULEB128 length prefix followed by the raw bytes.
 */
function decodeBcsVectorU8AsString(raw: number[]): string {
  // Read ULEB128 length prefix
  let len = 0
  let shift = 0
  let offset = 0
  for (; offset < raw.length; offset++) {
    const byte = raw[offset]
    len |= (byte & 0x7F) << shift
    shift += 7
    if ((byte & 0x80) === 0) { offset++; break }
  }
  // Extract the actual data bytes after the length prefix
  const data = raw.slice(offset, offset + len)
  return new TextDecoder().decode(Uint8Array.from(data))
}

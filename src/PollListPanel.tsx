import { useState, useEffect, useCallback } from 'react'
import { useSuiClient } from '@mysten/dapp-kit'
import {
  Vote,
  Loader2,
  RefreshCw,
  Users,
  Clock,
  ChevronRight,
  CheckCircle,
  XCircle,
  AlertCircle,
  Settings,
} from 'lucide-react'
import { C } from './theme'
import {
  PACKAGE_ID,
  REGISTRY_ID,
  STATUS_LABELS,
  STATUS_COLORS,
} from './poll-transactions'
import type { PollInfo } from './poll-transactions'

/* ─── styles ─── */
const card = {
  padding: 24, borderRadius: 16,
  border: `1px solid ${C.border}`, background: C.surface, marginBottom: 20,
} as const

/* ─── Props ─── */
interface PollListPanelProps {
  onSelectPoll: (poll: PollInfo) => void
}

/* ─── Status icon ─── */
function StatusIcon({ status }: { status: number }) {
  const size = 14
  switch (status) {
    case 0: return <Settings size={size} />
    case 1: return <AlertCircle size={size} />
    case 2: return <CheckCircle size={size} />
    case 3: return <XCircle size={size} />
    default: return <AlertCircle size={size} />
  }
}

/** Decode UTF-8 bytes from on-chain vector<u8> (returned as number[]) */
function decodeTitle(raw: unknown): string {
  if (!raw) return 'Untitled'
  if (typeof raw === 'string') {
    // Sometimes returned as hex or utf8 string
    try { return new TextDecoder().decode(Uint8Array.from(raw.split(',').map(Number))) } catch { return raw }
  }
  if (Array.isArray(raw)) {
    try { return new TextDecoder().decode(Uint8Array.from(raw.map(Number))) } catch { return 'Untitled' }
  }
  return String(raw)
}

function formatDeadline(ms: number): string {
  const d = new Date(ms)
  const now = Date.now()
  if (ms <= now) return `Ended ${d.toLocaleDateString()}`
  const diff = ms - now
  const hours = Math.floor(diff / 3600000)
  const mins = Math.floor((diff % 3600000) / 60000)
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h left`
  if (hours > 0) return `${hours}h ${mins}m left`
  return `${mins}m left`
}

/* ─── Component ─── */
export default function PollListPanel({ onSelectPoll }: PollListPanelProps) {
  const suiClient = useSuiClient()

  const [polls, setPolls] = useState<PollInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchPolls = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      // Query PollCreated events to get all poll IDs
      const events = await suiClient.queryEvents({
        query: { MoveEventType: `${PACKAGE_ID}::registry::PollCreated` },
        order: 'descending',
        limit: 50,
      })

      const pollInfos: PollInfo[] = []

      for (const evt of events.data) {
        const parsed = evt.parsedJson as Record<string, unknown> | undefined
        if (!parsed) continue

        const pollId = String(parsed.poll_id ?? '')
        if (!pollId) continue

        // Fetch poll details via devInspectTransactionBlock
        try {
          const detailCalls = [
            { fn: 'poll_status', parse: (r: unknown) => Number(r) },
            { fn: 'poll_threshold', parse: (r: unknown) => Number(r) },
            { fn: 'poll_total_voters', parse: (r: unknown) => Number(r) },
            { fn: 'poll_voting_end', parse: (r: unknown) => Number(r) },
            { fn: 'poll_title', parse: (r: unknown) => decodeTitle(r) },
          ] as const

          // Use individual devInspect calls for each field
          const results = await Promise.all(
            detailCalls.map(async ({ fn }) => {
              try {
                const tx = new (await import('@mysten/sui/transactions')).Transaction()
                tx.moveCall({
                  target: `${PACKAGE_ID}::governance::${fn}`,
                  arguments: [tx.object(REGISTRY_ID), tx.pure.id(pollId)],
                })
                const result = await suiClient.devInspectTransactionBlock({
                  transactionBlock: tx,
                  sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
                })
                return result.results?.[0]?.returnValues?.[0]?.[0] ?? null
              } catch { return null }
            }),
          )

          // Parse BCS-encoded return values
          const statusBytes = results[0]
          const thresholdBytes = results[1]
          const totalVotersBytes = results[2]
          const votingEndBytes = results[3]

          const status = statusBytes ? (statusBytes as number[])[0] ?? 0 : 0
          const threshold = thresholdBytes ? parseBcsU64(thresholdBytes as number[]) : 0
          const totalVoters = totalVotersBytes ? parseBcsU64(totalVotersBytes as number[]) : 0
          const votingEnd = votingEndBytes ? parseBcsU64(votingEndBytes as number[]) : 0

          // Get tally
          let yesCount = 0, noCount = 0
          try {
            const tx2 = new (await import('@mysten/sui/transactions')).Transaction()
            tx2.moveCall({
              target: `${PACKAGE_ID}::governance::poll_tally`,
              arguments: [tx2.object(REGISTRY_ID), tx2.pure.id(pollId)],
            })
            const tallyResult = await suiClient.devInspectTransactionBlock({
              transactionBlock: tx2,
              sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
            })
            const yesBytes = tallyResult.results?.[0]?.returnValues?.[0]?.[0]
            const noBytes = tallyResult.results?.[0]?.returnValues?.[1]?.[0]
            if (yesBytes) yesCount = parseBcsU64(yesBytes as number[])
            if (noBytes) noCount = parseBcsU64(noBytes as number[])
          } catch { /* ignore */ }

          pollInfos.push({
            pollId,
            title: decodeTitle(parsed.title),
            status,
            threshold,
            totalVoters,
            yesCount,
            noCount,
            votingEnd,
            admin: String(parsed.admin ?? ''),
            councilRoot: '',
            dataBlobId: '',
            dataSealIdentity: '',
          })
        } catch {
          // If devInspect fails, still show the poll from event data
          pollInfos.push({
            pollId,
            title: decodeTitle(parsed.title),
            status: -1,
            threshold: Number(parsed.threshold ?? 0),
            totalVoters: 0,
            yesCount: 0,
            noCount: 0,
            votingEnd: Number(parsed.voting_end ?? 0),
            admin: String(parsed.admin ?? ''),
            councilRoot: '',
            dataBlobId: '',
            dataSealIdentity: '',
          })
        }
      }

      setPolls(pollInfos)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [suiClient])

  useEffect(() => { fetchPolls() }, [fetchPolls])

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Vote size={20} color={C.primary} />
          </div>
          <div>
            <h2 style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 18, fontWeight: 600, color: C.heading, margin: 0 }}>Polls</h2>
            <p style={{ fontSize: 12, color: C.textMuted, margin: 0 }}>On-chain governance polls</p>
          </div>
        </div>
        <button
          onClick={fetchPolls}
          disabled={loading}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8,
            border: `1px solid ${C.border}`, background: 'transparent',
            color: C.primary, fontSize: 12, fontWeight: 600,
            cursor: 'pointer', fontFamily: "'Exo 2',sans-serif",
          }}
        >
          <RefreshCw size={12} style={loading ? { animation: 'spin 1s linear infinite' } : undefined} />
          Refresh
        </button>
      </div>

      {/* Error */}
      {error && (
        <div style={{ ...card, borderColor: 'rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <XCircle size={16} color="#EF4444" />
          <span style={{ fontSize: 13, color: '#EF4444' }}>{error}</span>
        </div>
      )}

      {/* Loading */}
      {loading && polls.length === 0 && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Loader2 size={24} color={C.primary} style={{ animation: 'spin 1s linear infinite', marginBottom: 12 }} />
          <p style={{ fontSize: 13, color: C.textMuted, margin: 0 }}>Loading polls from on-chain…</p>
        </div>
      )}

      {/* Empty */}
      {!loading && polls.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: 48 }}>
          <Vote size={32} color={C.textMuted} style={{ marginBottom: 12 }} />
          <p style={{ fontSize: 14, color: C.textMuted, margin: 0 }}>No polls found</p>
          <p style={{ fontSize: 12, color: C.textMuted, margin: '4px 0 0' }}>Create a poll in the "Tạo Poll" tab</p>
        </div>
      )}

      {/* Poll list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {polls.map((poll) => {
          const statusColor = STATUS_COLORS[poll.status] ?? C.textMuted
          const statusLabel = STATUS_LABELS[poll.status] ?? 'Unknown'
          const isVoting = poll.status === 1
          const isFinalized = poll.status === 2 || poll.status === 3
          const totalVotes = poll.yesCount + poll.noCount
          const yesPercent = totalVotes > 0 ? Math.round((poll.yesCount / totalVotes) * 100) : 0

          return (
            <button
              key={poll.pollId}
              onClick={() => onSelectPoll(poll)}
              style={{
                ...card,
                marginBottom: 0,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 16,
                textAlign: 'left',
                transition: 'border-color 0.15s',
                borderColor: isVoting ? 'rgba(59,130,246,0.3)' : C.border,
              }}
            >
              {/* Status indicator */}
              <div style={{
                width: 44, height: 44, borderRadius: 12, flexShrink: 0,
                background: `${statusColor}15`,
                border: `1px solid ${statusColor}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: statusColor,
              }}>
                <StatusIcon status={poll.status} />
              </div>

              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 15, fontWeight: 700, color: C.heading, fontFamily: "'Exo 2',sans-serif", overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {poll.title}
                  </span>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                    background: `${statusColor}15`, color: statusColor,
                    flexShrink: 0,
                  }}>
                    {statusLabel}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 16, fontSize: 12, color: C.textMuted }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Users size={11} /> {poll.totalVoters} voters
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={11} /> {formatDeadline(poll.votingEnd)}
                  </span>
                  {totalVotes > 0 && (
                    <span>
                      {poll.yesCount} YES / {poll.noCount} NO ({yesPercent}%)
                    </span>
                  )}
                </div>

                {/* Progress bar for voting/finalized */}
                {(isVoting || isFinalized) && totalVotes > 0 && (
                  <div style={{ marginTop: 8, height: 4, borderRadius: 2, background: C.bg, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 2,
                      width: `${yesPercent}%`,
                      background: poll.yesCount >= poll.threshold ? C.green : C.primary,
                      transition: 'width 0.3s',
                    }} />
                  </div>
                )}
              </div>

              {/* Arrow */}
              <ChevronRight size={16} color={C.textMuted} style={{ flexShrink: 0 }} />
            </button>
          )
        })}
      </div>
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

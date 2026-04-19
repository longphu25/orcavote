import { useState, useCallback, useEffect } from 'react'
import {
  useCurrentAccount,
  useSuiClient,
  useSuiClientContext,
  useSignAndExecuteTransaction,
  useSignPersonalMessage,
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
  Unlock,
  Zap,
  Database,
  Gavel,
} from 'lucide-react'
import { C } from './theme'
import {
  PACKAGE_ID,
  REGISTRY_ID,
  STATUS_LABELS,
  STATUS_COLORS,
  submitVoteTx,
  finalizePollTx,
  adminFinalizePollTx,
  suiScanTxUrl,
} from './poll-transactions'
import type { PollInfo } from './poll-transactions'
import type { NetworkKey } from './seal-walrus'
import { fetchBlobFromWalrus, AGGREGATORS, ORCAVOTE_PACKAGE_ID, ORCAVOTE_REGISTRY_ID, TESTNET_KEY_SERVERS } from './seal-walrus'
import { SessionKey, EncryptedObject, SealClient } from '@mysten/seal'
import { Transaction } from '@mysten/sui/transactions'
import { fromHex } from '@mysten/sui/utils'
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
  const { mutateAsync: signPersonalMessage } = useSignPersonalMessage()
  const network = (ctx.network ?? 'testnet') as NetworkKey

  const [choice, setChoice] = useState<number | null>(null) // 0=NO, 1=YES
  const [step, setStep] = useState<VoteStep>('idle')
  const [error, setError] = useState<string | null>(null)
  const [txDigest, setTxDigest] = useState<string | null>(null)
  const [isRegistered, setIsRegistered] = useState<boolean | null>(null)
  const [checkingReg, setCheckingReg] = useState(false)

  // Finalize state
  const [finalizing, setFinalizing] = useState(false)
  const [finalizeError, setFinalizeError] = useState<string | null>(null)
  const [finalizeTxDigest, setFinalizeTxDigest] = useState<string | null>(null)

  // Dataset decrypt state
  const [dataBlobId, setDataBlobId] = useState(poll.dataBlobId || '')
  const [dataDecrypting, setDataDecrypting] = useState(false)
  const [dataDecrypted, setDataDecrypted] = useState<{ raw: Uint8Array; text: string | null } | null>(null)
  const [dataDecryptError, setDataDecryptError] = useState<string | null>(null)

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

  // Fetch data_blob_id from on-chain if not already set
  useEffect(() => {
    if (dataBlobId) return
    ;(async () => {
      try {
        const tx = new Transaction()
        tx.moveCall({
          target: `${PACKAGE_ID}::governance::poll_data_blob_id`,
          arguments: [tx.object(REGISTRY_ID), tx.pure.id(poll.pollId)],
        })
        const result = await suiClient.devInspectTransactionBlock({
          transactionBlock: tx,
          sender: '0x0000000000000000000000000000000000000000000000000000000000000000',
        })
        const bytes = result.results?.[0]?.returnValues?.[0]?.[0]
        if (bytes) {
          const decoded = decodeBcsVectorU8AsString(bytes as number[])
          if (decoded) setDataBlobId(decoded)
        }
      } catch { /* ignore */ }
    })()
  }, [poll.pollId, suiClient, dataBlobId])

  // ─── Finalize flow ───
  const handleFinalize = useCallback(async (admin: boolean) => {
    setFinalizing(true)
    setFinalizeError(null)
    try {
      const tx = admin ? adminFinalizePollTx(poll.pollId) : finalizePollTx(poll.pollId)
      await signAndExecute(
        { transaction: tx },
        {
          onSuccess: (data) => {
            setFinalizeTxDigest(data.digest)
            setTimeout(refreshTally, 2000)
          },
        },
      )
    } catch (e: unknown) {
      setFinalizeError(e instanceof Error ? e.message : String(e))
    } finally {
      setFinalizing(false)
    }
  }, [poll.pollId, signAndExecute, refreshTally])

  // ─── Dataset decrypt flow (Seal seal_approve_dataset) ───
  const handleDecryptDataset = useCallback(async () => {
    if (!currentAccount || !dataBlobId) return
    setDataDecrypting(true)
    setDataDecryptError(null)
    try {
      // 1. Fetch encrypted blob from Walrus
      const ciphertext = await fetchBlobFromWalrus(dataBlobId, network)

      let decrypted: Uint8Array
      try {
        const encObj = EncryptedObject.parse(ciphertext)

        // 2. Create session key
        const sessionKey = await SessionKey.create({
          address: currentAccount.address,
          packageId: ORCAVOTE_PACKAGE_ID,
          ttlMin: 10,
          suiClient,
        })
        const msg = sessionKey.getPersonalMessage()
        const { signature } = await signPersonalMessage({ message: msg })
        sessionKey.setPersonalMessageSignature(signature)

        // 3. Build seal_approve_dataset PTB
        // id format: registry_object_id(32) ++ poll_id(32)
        const registryBytes = fromHex(ORCAVOTE_REGISTRY_ID)
        const pollIdBytes = fromHex(poll.pollId)
        const sealId = new Uint8Array([...registryBytes, ...pollIdBytes])

        const tx = new Transaction()
        tx.moveCall({
          target: `${ORCAVOTE_PACKAGE_ID}::seal_policy::seal_approve_dataset`,
          arguments: [
            tx.pure.vector('u8', Array.from(sealId)),
            tx.object(ORCAVOTE_REGISTRY_ID),
          ],
        })
        const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true })

        // 4. Decrypt via Seal key server
        const sealClient = new SealClient({
          suiClient,
          serverConfigs: TESTNET_KEY_SERVERS.map(s => ({ ...s })),
          verifyKeyServers: false,
        })
        decrypted = await sealClient.decrypt({ data: ciphertext, sessionKey, txBytes })
      } catch (sealErr) {
        // Seal decrypt failed — try data_asset pattern as fallback
        // (blob may have been encrypted with seal_approve_data_asset instead of seal_approve_dataset)
        try {
          const encObj2 = EncryptedObject.parse(ciphertext)

          // Check if the encrypted object's packageId matches orcavote
          // If id is registry_id(32) + owner_address(32), try seal_approve_data_asset
          const sessionKey2 = await SessionKey.create({
            address: currentAccount.address,
            packageId: ORCAVOTE_PACKAGE_ID,
            ttlMin: 10,
            suiClient,
          })
          const msg2 = sessionKey2.getPersonalMessage()
          const { signature: sig2 } = await signPersonalMessage({ message: msg2 })
          sessionKey2.setPersonalMessageSignature(sig2)

          // Try with owner address pattern
          const registryBytes2 = fromHex(ORCAVOTE_REGISTRY_ID)
          const ownerBytes = fromHex(currentAccount.address)
          const sealId2 = new Uint8Array([...registryBytes2, ...ownerBytes])

          const tx2 = new Transaction()
          tx2.moveCall({
            target: `${ORCAVOTE_PACKAGE_ID}::seal_policy::seal_approve_data_asset`,
            arguments: [
              tx2.pure.vector('u8', Array.from(sealId2)),
              tx2.object(ORCAVOTE_REGISTRY_ID),
            ],
          })
          const txBytes2 = await tx2.build({ client: suiClient, onlyTransactionKind: true })

          const sealClient2 = new SealClient({
            suiClient,
            serverConfigs: TESTNET_KEY_SERVERS.map(s => ({ ...s })),
            verifyKeyServers: false,
          })
          decrypted = await sealClient2.decrypt({ data: ciphertext, sessionKey: sessionKey2, txBytes: txBytes2 })
        } catch {
          // Both patterns failed — show error, don't return garbage
          throw new Error(`Seal decrypt failed: ${sealErr instanceof Error ? sealErr.message : String(sealErr)}`)
        }
      }

      let text: string | null = null
      try {
        const decoded = new TextDecoder('utf-8', { fatal: true }).decode(decrypted)
        const printable = decoded.split('').filter(c => c.charCodeAt(0) >= 32 || c === '\n' || c === '\r' || c === '\t').length
        if (printable / decoded.length > 0.9) text = decoded
      } catch { /* binary */ }

      setDataDecrypted({ raw: decrypted, text })
    } catch (e: unknown) {
      setDataDecryptError(e instanceof Error ? e.message : String(e))
    } finally {
      setDataDecrypting(false)
    }
  }, [currentAccount, dataBlobId, network, poll.pollId, suiClient, signPersonalMessage])

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

      // 3. Fetch ALL voters' commitments to rebuild the correct Merkle tree
      //    The tree was built with all voters' commitments — we need them all
      setStep('proving')

      // 3a. Get voter list for this poll
      const voterListTx = new Transaction()
      voterListTx.moveCall({
        target: `${PACKAGE_ID}::governance::poll_voter_list`,
        arguments: [voterListTx.object(REGISTRY_ID), voterListTx.pure.id(poll.pollId)],
      })
      const voterListResult = await suiClient.devInspectTransactionBlock({
        transactionBlock: voterListTx,
        sender: currentAccount.address,
      })
      const voterListBytes = voterListResult.results?.[0]?.returnValues?.[0]?.[0] as number[] | undefined

      let allCommitments: bigint[]
      let myLeafIndex: number

      if (voterListBytes && voterListBytes.length > 1) {
        // Parse BCS vector<address>: ULEB128 length + N × 32-byte addresses
        let offset = 0
        let len = 0
        let shift = 0
        while (offset < voterListBytes.length) {
          const b = voterListBytes[offset++]
          len |= (b & 0x7f) << shift
          if ((b & 0x80) === 0) break
          shift += 7
        }

        const voterAddresses: string[] = []
        for (let i = 0; i < len; i++) {
          const addrBytes = voterListBytes.slice(offset + i * 32, offset + (i + 1) * 32)
          voterAddresses.push('0x' + Array.from(addrBytes).map(b => b.toString(16).padStart(2, '0')).join(''))
        }

        // 3b. Fetch each voter's identity blob to get their commitment
        const commitments: bigint[] = []
        let foundIndex = -1
        for (let i = 0; i < voterAddresses.length; i++) {
          const addr = voterAddresses[i]
          try {
            const refTx = new Transaction()
            refTx.moveCall({
              target: `${PACKAGE_ID}::governance::get_voter_ref`,
              arguments: [refTx.object(REGISTRY_ID), refTx.pure.id(poll.pollId), refTx.pure.address(addr)],
            })
            const refRes = await suiClient.devInspectTransactionBlock({
              transactionBlock: refTx,
              sender: currentAccount.address,
            })
            const blobBytes = refRes.results?.[0]?.returnValues?.[0]?.[0] as number[] | undefined
            if (!blobBytes) continue
            const bid = decodeBcsVectorU8AsString(blobBytes)
            const raw = await fetchBlobFromWalrus(bid, network)
            const id: IdentityBlob = JSON.parse(new TextDecoder().decode(raw))
            commitments.push(hexToBigInt(id.identity_commitment))
            if (addr.toLowerCase() === currentAccount.address.toLowerCase()) {
              foundIndex = i
            }
          } catch {
            // If we can't fetch a voter's blob, use 0 as placeholder
            commitments.push(0n)
          }
        }

        allCommitments = commitments
        myLeafIndex = foundIndex >= 0 ? foundIndex : (identity.leaf_index ?? 0)
      } else {
        // Fallback: single voter
        allCommitments = [hexToBigInt(identity.identity_commitment)]
        myLeafIndex = identity.leaf_index ?? 0
      }

      // 3c. Build full-depth Merkle tree with ALL commitments
      const fullPath = await buildFullMerklePath(allCommitments, myLeafIndex)

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

          {/* Finalize button — shown when expired + still Voting */}
          {isExpired && liveStatus === 1 && !finalizeTxDigest && (
            <div style={{ marginTop: 16 }}>
              {finalizeError && (
                <div style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: '#EF4444' }}>{finalizeError}</span>
                </div>
              )}
              <button
                style={{ ...btnPrimary, background: C.accent, opacity: finalizing ? 0.5 : 1 }}
                onClick={() => handleFinalize(false)}
                disabled={finalizing}
              >
                {finalizing
                  ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Finalizing…</>
                  : <><Gavel size={16} /> Finalize Poll</>}
              </button>
              {currentAccount?.address === liveAdmin && (
                <button
                  style={{ ...btnSm, width: '100%', justifyContent: 'center', marginTop: 8, borderColor: 'rgba(245,158,11,0.3)', color: C.accent }}
                  onClick={() => handleFinalize(true)}
                  disabled={finalizing}
                >
                  <Gavel size={12} /> Admin Force-Finalize
                </button>
              )}
              <p style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 8 }}>
                Anyone can finalize after deadline. Result: {liveYes >= liveThreshold ? 'Approved ✓' : 'Rejected ✗'}
              </p>
            </div>
          )}

          {/* Admin early finalize — shown when Voting + NOT expired + user is admin */}
          {liveStatus === 1 && !isExpired && currentAccount?.address === liveAdmin && !finalizeTxDigest && (
            <div style={{ marginTop: 16 }}>
              {finalizeError && (
                <div style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: '#EF4444' }}>{finalizeError}</span>
                </div>
              )}
              <button
                style={{ ...btnSm, width: '100%', justifyContent: 'center', borderColor: 'rgba(245,158,11,0.3)', color: C.accent }}
                onClick={() => handleFinalize(true)}
                disabled={finalizing}
              >
                {finalizing
                  ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Finalizing…</>
                  : <><Gavel size={12} /> Admin Early Finalize</>}
              </button>
            </div>
          )}

          {/* Finalize success */}
          {finalizeTxDigest && (
            <div style={{ marginTop: 16, padding: 12, borderRadius: 10, border: '1px solid rgba(16,185,129,0.3)', background: 'rgba(16,185,129,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <CheckCircle size={14} color={C.green} />
                <span style={{ fontSize: 13, fontWeight: 700, color: C.green }}>Poll finalized!</span>
              </div>
              <a href={suiScanTxUrl(finalizeTxDigest, network)} target="_blank" rel="noopener noreferrer"
                style={{ fontSize: 12, color: C.primary, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                View on SuiScan <ExternalLink size={10} />
              </a>
            </div>
          )}
        </div>
      )}

      {/* ═══ Dataset Decrypt — shown when Approved ═══ */}
      {liveStatus === 2 && dataBlobId && (
        <div style={{ ...card, borderColor: 'rgba(16,185,129,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Database size={16} color={C.green} />
            <span style={{ fontFamily: "'Orbitron',sans-serif", fontSize: 14, fontWeight: 600, color: C.heading }}>
              Shared Dataset
            </span>
            <span style={{ fontSize: 11, color: C.green, fontWeight: 600, marginLeft: 'auto' }}>
              Unlocked by Approval
            </span>
          </div>

          <div style={{ padding: 10, borderRadius: 8, background: C.bg, marginBottom: 12, fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ color: C.textMuted }}>Blob ID</span>
              <code style={{ color: C.primary, fontFamily: "'Exo 2',monospace" }}>
                {dataBlobId.length > 30 ? `${dataBlobId.slice(0, 16)}…${dataBlobId.slice(-8)}` : dataBlobId}
              </code>
            </div>
            <a href={`${AGGREGATORS[network]}/v1/blobs/${dataBlobId}`} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 11, color: C.green, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <ExternalLink size={10} /> View encrypted blob on Walrus
            </a>
          </div>

          {dataDecryptError && (
            <div style={{ padding: 10, borderRadius: 8, border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.05)', marginBottom: 12 }}>
              <span style={{ fontSize: 12, color: '#EF4444' }}>{dataDecryptError}</span>
            </div>
          )}

          {!dataDecrypted && (
            <button
              style={{ ...btnPrimary, background: C.green, opacity: dataDecrypting ? 0.5 : 1 }}
              onClick={handleDecryptDataset}
              disabled={dataDecrypting}
            >
              {dataDecrypting
                ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Decrypting dataset…</>
                : <><Unlock size={16} /> Decrypt Dataset</>}
            </button>
          )}

          {dataDecrypted && (
            <div style={{ padding: 14, borderRadius: 12, border: `1px solid rgba(16,185,129,0.3)`, background: C.bg }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: C.green }}>
                  <Unlock size={12} /> Decrypted
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 11, color: C.textMuted }}>
                    {dataDecrypted.text ? 'Text' : 'Binary'} · {dataDecrypted.raw.length < 1024 ? `${dataDecrypted.raw.length} B` : `${(dataDecrypted.raw.length / 1024).toFixed(1)} KB`}
                  </span>
                  <button style={{ ...btnSm, padding: '2px 8px', fontSize: 10 }} onClick={() => {
                    const blob = new Blob([dataDecrypted.raw.buffer as ArrayBuffer])
                    const url = URL.createObjectURL(blob)
                    const a = document.createElement('a')
                    a.href = url; a.download = `dataset_${poll.pollId.slice(0, 8)}`; a.click()
                    URL.revokeObjectURL(url)
                  }}>Download</button>
                </div>
              </div>
              {dataDecrypted.text ? (
                <pre style={{ fontSize: 12, color: C.text, fontFamily: "'Exo 2',monospace", whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, maxHeight: 300, overflow: 'auto' }}>
                  {dataDecrypted.text.slice(0, 5000)}{dataDecrypted.text.length > 5000 ? '\n…(truncated)' : ''}
                </pre>
              ) : (
                <div style={{ fontSize: 12, color: C.textMuted }}>Binary data. Use Download to save.</div>
              )}
            </div>
          )}

          <p style={{ fontSize: 11, color: C.textMuted, textAlign: 'center', marginTop: 10 }}>
            Poll approved → Seal key servers verify on-chain status → Dataset decrypted for everyone
          </p>
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

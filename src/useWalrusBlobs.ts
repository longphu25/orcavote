// Shared hook for fetching wallet-owned Walrus Blob objects (paginated)

import { useState, useCallback, useEffect } from 'react'
import { useCurrentAccount, useSuiClient } from '@mysten/dapp-kit'

export interface WalrusBlob {
  objectId: string
  blobId: string
  size: number
  registeredEpoch: number
  certifiedEpoch: number | null
  endEpoch: number
  startEpoch: number
  deletable: boolean
  version: number
}

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

export function useWalrusBlobs(autoFetch = true) {
  const currentAccount = useCurrentAccount()
  const suiClient = useSuiClient()

  const [blobs, setBlobs] = useState<WalrusBlob[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchBlobs = useCallback(async () => {
    if (!currentAccount) return
    setLoading(true)
    setError(null)
    try {
      const allBlobs: WalrusBlob[] = []
      for (const blobType of [WALRUS_BLOB_TYPE_TESTNET, WALRUS_BLOB_TYPE_MAINNET]) {
        try {
          let cursor: string | null | undefined = null
          let hasNext = true
          while (hasNext) {
            const res = await suiClient.getOwnedObjects({
              owner: currentAccount.address,
              filter: { StructType: blobType },
              options: { showContent: true, showType: true },
              limit: 50,
              ...(cursor ? { cursor } : {}),
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
            hasNext = res.hasNextPage
            cursor = res.nextCursor
          }
          if (allBlobs.length > 0) break
        } catch { /* type not on this network */ }
      }
      setBlobs(allBlobs)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [currentAccount, suiClient])

  useEffect(() => {
    if (autoFetch && currentAccount) fetchBlobs()
  }, [currentAccount?.address]) // eslint-disable-line react-hooks/exhaustive-deps

  /** Active blobs sorted newest-first */
  const activeBlobs = (() => {
    if (blobs.length === 0) return []
    const currentEpoch = Math.max(...blobs.map(b => b.registeredEpoch))
    return blobs
      .filter(b => !(b.endEpoch > 0 && b.endEpoch <= currentEpoch))
      .sort((a, b) => b.registeredEpoch - a.registeredEpoch || b.version - a.version)
  })()

  return { blobs, activeBlobs, loading, error, fetchBlobs }
}

#!/usr/bin/env node
/**
 * Full decrypt debug: fetch blob → parse → build PTB → dry-run → check.
 *
 * Usage:
 *   node scripts/debug-decrypt-full.mjs <blobId> <pollId>
 */

import { EncryptedObject, SealClient } from '@mysten/seal'
import { SuiJsonRpcClient } from '@mysten/sui/jsonRpc'
import { Transaction } from '@mysten/sui/transactions'
import { fromHex } from '@mysten/sui/utils'

const AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space'
const ORCAVOTE_PACKAGE_ID = '0x115063746a65dce6e68997b5116af16188a164f724de111d87f9be6e085225f0'
const ORCAVOTE_REGISTRY_ID = '0x04d714c372105c024a7b99d2d3fb9d8e79f159e335894c158dae11668b9a233e'
const DUMMY_SENDER = '0x0000000000000000000000000000000000000000000000000000000000000000'

const blobId = process.argv[2]
const pollId = process.argv[3]

if (!blobId || !pollId) {
  console.error('Usage: node scripts/debug-decrypt-full.mjs <blobId> <pollId>')
  process.exit(1)
}

const suiClient = new SuiJsonRpcClient({ url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' })

console.log('=== Full Decrypt Debug ===\n')

// 1. Fetch
console.log('1. Fetching blob...')
const res = await fetch(`${AGGREGATOR}/v1/blobs/${blobId}`)
const ciphertext = new Uint8Array(await res.arrayBuffer())
console.log('   Size:', ciphertext.length, 'bytes')

// 2. Parse
console.log('\n2. Parsing EncryptedObject...')
const encObj = EncryptedObject.parse(ciphertext)
console.log('   packageId:', encObj.packageId)
console.log('   id:', encObj.id)
console.log('   threshold:', encObj.threshold)

// 3. Check poll status
console.log('\n3. Checking poll status...')
const statusTx = new Transaction()
statusTx.moveCall({
  target: `${ORCAVOTE_PACKAGE_ID}::governance::poll_status`,
  arguments: [statusTx.object(ORCAVOTE_REGISTRY_ID), statusTx.pure.id(pollId)],
})
try {
  const statusResult = await suiClient.devInspectTransactionBlock({
    transactionBlock: statusTx,
    sender: DUMMY_SENDER,
  })
  const statusBytes = statusResult.results?.[0]?.returnValues?.[0]?.[0]
  const status = statusBytes ? statusBytes[0] : -1
  const labels = { 0: 'Setup', 1: 'Voting', 2: 'Approved', 3: 'Rejected' }
  console.log('   Status:', status, `(${labels[status] ?? 'Unknown'})`)
  if (status !== 2) {
    console.log('   ⚠ Poll is NOT Approved — seal_approve_dataset will fail!')
  }
} catch (e) {
  console.log('   ✗ Failed to check status:', e.message)
}

// 4. Dry-run seal_approve_dataset
console.log('\n4. Dry-run seal_approve_dataset...')
const idBytes = fromHex(encObj.id)
console.log('   id bytes length:', idBytes.length)

const tx = new Transaction()
tx.moveCall({
  target: `${encObj.packageId}::seal_policy::seal_approve_dataset`,
  arguments: [
    tx.pure.vector('u8', Array.from(idBytes)),
    tx.object(ORCAVOTE_REGISTRY_ID),
  ],
})

try {
  const txBytes = await tx.build({ client: suiClient, onlyTransactionKind: true })
  console.log('   PTB built, size:', txBytes.length, 'bytes')

  // Try dry-run
  // We need a real sender for dry-run to work with seal
  const dryResult = await suiClient.devInspectTransactionBlock({
    transactionBlock: tx,
    sender: DUMMY_SENDER,
  })
  
  if (dryResult.effects?.status?.status === 'success') {
    console.log('   ✓ Dry-run SUCCESS — seal_approve_dataset passed')
  } else {
    console.log('   ✗ Dry-run FAILED:', JSON.stringify(dryResult.effects?.status))
  }
} catch (e) {
  console.log('   ✗ Build/dry-run error:', e.message?.slice(0, 200))
}

// 5. Check on-chain data_blob_id
console.log('\n5. Checking on-chain data_blob_id...')
const blobTx = new Transaction()
blobTx.moveCall({
  target: `${ORCAVOTE_PACKAGE_ID}::governance::poll_data_blob_id`,
  arguments: [blobTx.object(ORCAVOTE_REGISTRY_ID), blobTx.pure.id(pollId)],
})
try {
  const blobResult = await suiClient.devInspectTransactionBlock({
    transactionBlock: blobTx,
    sender: DUMMY_SENDER,
  })
  const blobBytes = blobResult.results?.[0]?.returnValues?.[0]?.[0]
  if (blobBytes) {
    // Decode BCS vector<u8>
    let offset = 0, len = 0, shift = 0
    while (offset < blobBytes.length) {
      const b = blobBytes[offset++]
      len |= (b & 0x7f) << shift
      if ((b & 0x80) === 0) break
      shift += 7
    }
    const decoded = Buffer.from(blobBytes.slice(offset, offset + len)).toString('utf-8')
    console.log('   On-chain data_blob_id:', decoded)
    console.log('   Matches input blobId:', decoded === blobId)
    if (decoded !== blobId) {
      console.log('   ⚠ MISMATCH! On-chain points to different blob')
      console.log('   UI may be fetching wrong blob')
    }
  }
} catch (e) {
  console.log('   ✗ Failed:', e.message)
}

console.log('\n=== Done ===')

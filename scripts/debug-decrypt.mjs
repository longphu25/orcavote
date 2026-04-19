#!/usr/bin/env node
/**
 * Debug script: fetch encrypted blob from Walrus and inspect Seal EncryptedObject.
 *
 * Usage:
 *   node scripts/debug-decrypt.mjs <blobId> [pollId]
 *
 * Example:
 *   node scripts/debug-decrypt.mjs eLTKWR98JQkQbmCmChQCObm1LxbKlc_9uhWuyjh8Ddg 0x5276b3b7a26be8bcb037d9cd1e4b1ad3b0252076b998e51283e0acee0b045fb9
 */

import { EncryptedObject } from '@mysten/seal'

const AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space'
const ORCAVOTE_PACKAGE_ID = '0x115063746a65dce6e68997b5116af16188a164f724de111d87f9be6e085225f0'
const ORCAVOTE_REGISTRY_ID = '0x04d714c372105c024a7b99d2d3fb9d8e79f159e335894c158dae11668b9a233e'

const blobId = process.argv[2]
const pollId = process.argv[3]

if (!blobId) {
  console.error('Usage: node scripts/debug-decrypt.mjs <blobId> [pollId]')
  process.exit(1)
}

console.log('=== OrcaVote Seal Debug ===\n')
console.log('Blob ID:', blobId)
if (pollId) console.log('Poll ID:', pollId)

// 1. Fetch blob from Walrus
console.log('\n--- Step 1: Fetch blob from Walrus ---')
const url = `${AGGREGATOR}/v1/blobs/${blobId}`
console.log('URL:', url)

const res = await fetch(url)
if (!res.ok) {
  console.error(`Fetch failed: ${res.status} ${res.statusText}`)
  process.exit(1)
}

const ciphertext = new Uint8Array(await res.arrayBuffer())
console.log('Ciphertext size:', ciphertext.length, 'bytes')
console.log('First 32 bytes (hex):', Buffer.from(ciphertext.slice(0, 32)).toString('hex'))

// 2. Parse EncryptedObject
console.log('\n--- Step 2: Parse EncryptedObject ---')
try {
  const encObj = EncryptedObject.parse(ciphertext)
  console.log('✓ Parse successful')
  console.log('  packageId:', encObj.packageId)
  console.log('  id:', encObj.id)
  console.log('  id length:', encObj.id.length / 2, 'bytes (hex chars:', encObj.id.length, ')')
  console.log('  threshold:', encObj.threshold)
  console.log('  services:', encObj.services?.length ?? 'N/A')

  // Split id into registry + second part
  const idHex = encObj.id.startsWith('0x') ? encObj.id.slice(2) : encObj.id
  if (idHex.length >= 128) {
    const registryPart = '0x' + idHex.slice(0, 64)
    const secondPart = '0x' + idHex.slice(64, 128)
    console.log('\n  ID breakdown:')
    console.log('    Registry:', registryPart)
    console.log('    Second:  ', secondPart)
    console.log('    Registry match:', registryPart === ORCAVOTE_REGISTRY_ID)
    if (pollId) {
      console.log('    Poll ID match: ', secondPart === pollId)
    }
  }

  // Check packageId match
  console.log('\n  Package match:', encObj.packageId === ORCAVOTE_PACKAGE_ID)
  if (encObj.packageId !== ORCAVOTE_PACKAGE_ID) {
    console.log('  ⚠ MISMATCH! Blob encrypted with different package')
    console.log('    Expected:', ORCAVOTE_PACKAGE_ID)
    console.log('    Got:     ', encObj.packageId)
  }

} catch (e) {
  console.log('✗ Parse FAILED:', e.message)
  console.log('  This blob is NOT a Seal EncryptedObject (plaintext?)')
  console.log('  First 100 bytes as UTF-8:', Buffer.from(ciphertext.slice(0, 100)).toString('utf-8'))
}

// 3. Check what seal_approve_dataset would receive
if (pollId) {
  console.log('\n--- Step 3: Expected Seal ID for seal_approve_dataset ---')
  const registryHex = ORCAVOTE_REGISTRY_ID.slice(2)
  const pollHex = pollId.slice(2)
  const expectedId = registryHex + pollHex
  console.log('Expected ID:', expectedId)
  console.log('Expected ID length:', expectedId.length / 2, 'bytes')

  try {
    const encObj = EncryptedObject.parse(ciphertext)
    const actualId = encObj.id.startsWith('0x') ? encObj.id.slice(2) : encObj.id
    console.log('Actual ID:  ', actualId)
    console.log('IDs match:  ', actualId === expectedId)
    if (actualId !== expectedId) {
      console.log('\n⚠ SEAL ID MISMATCH!')
      console.log('  The blob was encrypted for a DIFFERENT identity than this poll.')
      console.log('  Decrypt will get wrong key → output = garbage.')
      console.log('  Solution: re-encrypt dataset via "Seal Encrypt & Upload Dataset" step.')
    } else {
      console.log('\n✓ Seal IDs match — decrypt should work if poll is Approved.')
    }
  } catch { /* already handled */ }
}

// 4. Try to see if it's actually plaintext wrapped in Seal
console.log('\n--- Step 4: Raw content inspection ---')
try {
  const encObj = EncryptedObject.parse(ciphertext)
  // The encrypted payload starts after header
  // Try to detect if the "encrypted" data is suspiciously text-like
  const idHex = encObj.id.startsWith('0x') ? encObj.id.slice(2) : encObj.id
  const headerSize = 1 + 32 + 1 + (idHex.length / 2) // version + pkg + id_len + id
  console.log('Estimated header size:', headerSize, 'bytes')
  console.log('Payload size:', ciphertext.length - headerSize, 'bytes')
} catch { /* skip */ }

console.log('\n=== Done ===')

#!/usr/bin/env node
/**
 * Convert snarkjs verification_key.json → Arkworks-compatible vk_bytes
 * for Sui's groth16::prepare_verifying_key(bn254(), &vk_bytes)
 *
 * Arkworks BN254 verifying key format (canonical compressed):
 *   alpha_g1 (32 bytes) + beta_g2 (64 bytes) + gamma_g2 (64 bytes) +
 *   delta_g2 (64 bytes) + IC[0..n] (32 bytes each)
 *
 * Usage: node export-vk-bytes.mjs [verification_key.json] [output.bin]
 */

import { readFileSync, writeFileSync } from 'fs'

const vkPath = process.argv[2] || 'build/verification_key.json'
const outPath = process.argv[3] || 'build/vk_bytes.bin'
const hexPath = process.argv[4] || 'build/vk_bytes.hex'

const vk = JSON.parse(readFileSync(vkPath, 'utf8'))

// BN254 field size
const FIELD_SIZE = 32n
const P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n

/**
 * Convert a decimal string to a 32-byte little-endian Uint8Array (Arkworks format)
 */
function toLEBytes(decStr) {
  let n = BigInt(decStr)
  const bytes = new Uint8Array(32)
  for (let i = 0; i < 32; i++) {
    bytes[i] = Number(n & 0xFFn)
    n >>= 8n
  }
  return bytes
}

/**
 * Encode a G1 point in Arkworks compressed format (32 bytes).
 * Arkworks compressed G1: x in LE, with the highest bit of the last byte
 * indicating the "greater" y coordinate.
 */
function encodeG1Compressed(point) {
  const x = BigInt(point[0])
  const y = BigInt(point[1])
  const bytes = toLEBytes(point[0])
  // Set the "greatest" flag: if y > P/2, set the top bit of the last byte
  if (y > P / 2n) {
    bytes[31] |= 0x80
  }
  return bytes
}

/**
 * Encode a G2 point in Arkworks compressed format (64 bytes).
 * G2 point has coordinates in Fp2 = (c0, c1) where element = c0 + c1*u
 * Arkworks compressed G2: x (Fp2) in LE, with greatest flag.
 * x is serialized as c0 (32 bytes LE) + c1 (32 bytes LE)
 */
function encodeG2Compressed(point) {
  // snarkjs format: [[x_c0, x_c1], [y_c0, y_c1], [z_c0, z_c1]]
  // For affine (z=1): x = (x_c0, x_c1), y = (y_c0, y_c1)
  const x_c0 = toLEBytes(point[0][0])
  const x_c1 = toLEBytes(point[0][1])
  const y_c1 = BigInt(point[1][1])

  const result = new Uint8Array(64)
  result.set(x_c0, 0)
  result.set(x_c1, 32)

  // Greatest flag based on y's c1 component (or c0 if c1 == 0)
  const y_c0 = BigInt(point[1][0])
  const yFlag = x_c1.every(b => b === 0)
    ? false  // If c1 of x is 0, skip (degenerate case)
    : y_c1 > P / 2n
  if (yFlag) {
    result[63] |= 0x80
  }
  return result
}

// Build the verifying key bytes
const parts = []

// alpha_g1 (32 bytes)
parts.push(encodeG1Compressed(vk.vk_alpha_1))

// beta_g2 (64 bytes)
parts.push(encodeG2Compressed(vk.vk_beta_2))

// gamma_g2 (64 bytes)
parts.push(encodeG2Compressed(vk.vk_gamma_2))

// delta_g2 (64 bytes)
parts.push(encodeG2Compressed(vk.vk_delta_2))

// IC points (each 32 bytes)
for (const ic of vk.IC) {
  parts.push(encodeG1Compressed(ic))
}

// Concatenate
const totalLen = parts.reduce((sum, p) => sum + p.length, 0)
const vkBytes = new Uint8Array(totalLen)
let offset = 0
for (const p of parts) {
  vkBytes.set(p, offset)
  offset += p.length
}

// Write binary
writeFileSync(outPath, Buffer.from(vkBytes))

// Write hex
const hexStr = Array.from(vkBytes).map(b => b.toString(16).padStart(2, '0')).join('')
writeFileSync(hexPath, hexStr)

console.log(`✓ vk_bytes written:`)
console.log(`  Binary: ${outPath} (${vkBytes.length} bytes)`)
console.log(`  Hex:    ${hexPath}`)
console.log(`  IC points: ${vk.IC.length}`)
console.log(`  Total: ${32 + 64*3 + 32*vk.IC.length} bytes = alpha(32) + beta(64) + gamma(64) + delta(64) + IC(${vk.IC.length}×32)`)
console.log(``)
console.log(`  Use in TypeScript:`)
console.log(`    const vkBytes = new Uint8Array([...]) // from hex file`)
console.log(`    // or read the .bin file`)

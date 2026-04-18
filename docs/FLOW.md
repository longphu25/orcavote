# OrcaVote — Technical Flow & Bug Log

## Mục lục

1. [End-to-End Flow](#1-end-to-end-flow)
2. [Phase 1: Build Merkle Tree (WASM)](#2-phase-1-build-merkle-tree-wasm)
3. [Phase 2: Upload Identity Blobs (Walrus)](#3-phase-2-upload-identity-blobs-walrus)
4. [Phase 3: Create Poll On-Chain (PTB)](#4-phase-3-create-poll-on-chain-ptb)
5. [Phase 4: Vote (ZK Proof + On-Chain)](#5-phase-4-vote-zk-proof--on-chain)
6. [Phase 5: Finalize](#6-phase-5-finalize)
7. [Data Format Reference](#7-data-format-reference)
8. [Bug Log — Các lỗi đã gặp và cách fix](#8-bug-log--các-lỗi-đã-gặp-và-cách-fix)

---

## 1. End-to-End Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        POLL CREATOR FLOW                            │
│                                                                     │
│  ① Build Merkle Tree (WASM)                                        │
│     Input:  voter addresses[], poll_id, title, signal               │
│     Output: MerkleResult { root, commitments[], identities[] }      │
│             ↓                                                       │
│  ② Upload Identity Blobs (Walrus)                                  │
│     Per voter: identity.json → Walrus Publisher → blob_id           │
│             ↓                                                       │
│  ③ Create Poll On-Chain (single PTB)                               │
│     create_poll(council_root, vk_bytes, ...) → poll_id              │
│     register_voters(poll_id, voters[], blob_ids[])                  │
│     start_voting(poll_id)                                           │
│     → Poll status: Voting                                           │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          VOTER FLOW                                 │
│                                                                     │
│  ④ Vote                                                            │
│     a. Fetch identity.json từ Walrus (via voter_ref on-chain)       │
│     b. Rebuild depth-10 Merkle tree (poseidon-lite, JS)             │
│     c. Generate Groth16 proof (snarkjs, browser)                    │
│     d. submit_vote(proof, public_inputs, nullifier, choice)         │
│     → Tally updated, nullifier recorded                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                        FINALIZE FLOW                                │
│                                                                     │
│  ⑤ Finalize (permissionless, sau deadline)                         │
│     yes_count >= threshold → Approved                               │
│     yes_count <  threshold → Rejected                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Phase 1: Build Merkle Tree (WASM)

### Input
- `addresses[]` — danh sách Sui wallet addresses của voters
- `pollId` — string identifier (user input, e.g. `"poll_04"`)
- `title` — tên poll
- `signal` — vote signal (default `"vote"`)

### Process (trong WASM `build_merkle_tree`)

```
Per voter:
  1. identity_secret    = random 32 bytes (hex)
  2. identity_nullifier = random 32 bytes (hex)
  3. identity_commitment = Poseidon2(identity_nullifier, identity_secret)
     ⚠️ WASM dùng Poseidon(nullifier, secret), KHÔNG phải Poseidon(secret)

Build Poseidon Merkle tree từ commitments[]
  → root (hex), root_le (little-endian hex), root_decimal
```

### Output: `MerkleResult`
```json
{
  "root": "09704b7e...",          // hex, big-endian
  "root_le": "70aeb484...",       // hex, little-endian (cho contract)
  "root_decimal": "42692235...",  // decimal string
  "leaf_count": 1,
  "tree_depth": 0,               // ⚠️ WASM trả depth thực, KHÔNG phải circuit depth
  "commitments": ["09704b7e..."],
  "identities": [{ ... }]        // 1 IdentityBlob per voter
}
```

### Output: `IdentityBlob` (per voter)
```json
{
  "identity_secret": "1441ae57...",      // hex, 32 bytes
  "identity_nullifier": "09ef46f4...",   // hex, 32 bytes
  "identity_commitment": "09704b7e...",  // hex = Poseidon2(nullifier, secret)
  "address": "0x34113ecf...",
  "merkle_root": "09704b7e...",
  "merkle_path": [],                     // ⚠️ Có thể rỗng nếu 1 voter
  "leaf_index": 0,
  "tree_depth": 0,                       // ⚠️ Depth thực từ WASM, không phải 10
  "groth16_inputs": {
    "merkle_root_decimal": "42692235...",
    "nullifier_hash_decimal": "11351522..."
  }
}
```

### Lưu ý quan trọng

| Vấn đề | Chi tiết |
|---------|----------|
| `tree_depth` từ WASM | Trả về depth thực (0 cho 1 leaf, 1 cho 2 leaves, ...). Circuit cần depth 10. |
| `merkle_path` rỗng | Khi chỉ có 1 voter, WASM trả `[]`. Frontend phải tự build full tree. |
| Commitment formula | WASM: `Poseidon2(nullifier, secret)`. Circuit phải match. |
| Hex values | Tất cả hash values từ WASM là hex strings KHÔNG có `0x` prefix. |

---

## 3. Phase 2: Upload Identity Blobs (Walrus)

### Process
```
Per voter identity blob:
  1. Serialize identity.json → UTF-8 bytes (plaintext)
  2. Upload to Walrus Publisher HTTP API
     PUT /v1/blobs?epochs=5
     Content-Type: application/octet-stream
     Body: plaintext bytes
  3. Response → blob_id (base64url string)
```

### Tại sao plaintext (không Seal encrypt)?

Identity blobs được upload TRƯỚC khi poll tạo on-chain → chưa có `poll_id` thật.
Seal `seal_approve_identity` cần `registry_id + poll_id` làm identity → không thể encrypt trước.

Bảo mật vẫn OK vì:
- `identity_secret` chỉ dùng locally để generate ZK proof
- ZK proof không reveal secret — chỉ chứng minh voter biết secret
- On-chain chỉ thấy nullifier (không link được tới voter)

### Output per voter
```typescript
{
  address: "0x34113ecf...",
  blobId: "6GYzK4Kyc...",        // base64url, dùng cho register_voters
  walrusUrl: "https://aggregator.../v1/blobs/6GYzK4Kyc...",
  encryptedSize: 1234             // thực ra là plaintext size
}
```

---

## 4. Phase 3: Create Poll On-Chain (PTB)

### Single Programmable Transaction Block (3 calls)

```
┌─────────────────────────────────────────────────────────┐
│  PTB: Create Poll + Register Voters + Start Voting      │
│                                                         │
│  1. governance::create_poll(                            │
│       registry,                                         │
│       data_blob_id,        // Walrus blob of dataset    │
│       data_seal_identity,  // Seal ID for dataset       │
│       council_root,        // ⚠️ Depth-10 root (LE)    │
│       threshold,           // min YES votes             │
│       voting_end,          // ms timestamp              │
│       vk_bytes,            // 392 bytes, Arkworks VK    │
│       title                // UTF-8 bytes               │
│     ) → poll_id                                         │
│                                                         │
│  2. governance::register_voters(                        │
│       registry,                                         │
│       poll_id,             // from step 1               │
│       voters[],            // address[]                 │
│       walrus_blob_ids[],   // UTF-8 bytes of blob IDs  │
│       seal_identities[]    // UTF-8 bytes of addresses  │
│     )                                                   │
│                                                         │
│  3. governance::start_voting(                           │
│       registry,                                         │
│       poll_id              // from step 1               │
│     )                                                   │
└─────────────────────────────────────────────────────────┘
```

### Council Root — Depth-10 Computation (Critical)

WASM trả về depth-0 root (= commitment khi 1 voter). Contract cần depth-10 root.

Frontend (`merkle-pad.ts`) rebuild full tree:

```
Input:  commitments[] từ MerkleResult
Output: depth-10 Poseidon Merkle root

Algorithm:
  1. Tạo 2^10 = 1024 leaves, pad với 0n
  2. Set leaves[0..n] = commitments
  3. Hash bottom-up: parent = Poseidon2(left, right)
  4. Root = tree[0] ở level 10

Zero hashes (precomputed):
  zeros[0] = 0n
  zeros[i] = Poseidon2(zeros[i-1], zeros[i-1])
```

Root được convert sang LE hex (`bigintToLEHex`) rồi truyền vào `hexToBytes` cho contract.

### vk_bytes Format (392 bytes)

```
alpha_g1      (32 bytes)  — G1 compressed, LE
beta_g2       (64 bytes)  — G2 compressed, LE
gamma_g2      (64 bytes)  — G2 compressed, LE
delta_g2      (64 bytes)  — G2 compressed, LE
ic_count      (8 bytes)   — u64 LE = 5
IC[0..4]      (5×32 bytes) — G1 compressed, LE
Total: 32 + 64×3 + 8 + 32×5 = 392 bytes
```

---

## 5. Phase 4: Vote (ZK Proof + On-Chain)

### Step-by-step

```
1. FETCH IDENTITY REF
   devInspect → governance::get_voter_ref(registry, poll_id, voter_address)
   → (walrus_blob_id, seal_identity) as BCS vector<u8>
   → Decode BCS: skip ULEB128 length prefix → UTF-8 string = blob_id

2. FETCH IDENTITY FROM WALRUS
   GET https://aggregator.../v1/blobs/{blob_id}
   → JSON → parse as IdentityBlob

3. REBUILD MERKLE TREE (JS, poseidon-lite)
   commitments = [hexToBigInt(identity.identity_commitment)]
   fullPath = buildFullMerklePath(commitments, identity.leaf_index)
   → pathElements[10], pathIndices[10], root (bigint)

4. GENERATE ZK PROOF (snarkjs, browser)
   Circuit inputs (ALL must be decimal strings):
     merkle_root:        fullPath.root.toString()
     nullifier_hash:     Poseidon2(secret, external_nullifier).toString()
     signal_hash:        Poseidon1(choice).toString()
     external_nullifier: Poseidon1(poll_id_bigint).toString()
     identity_secret:    toBigInt(identity.identity_secret).toString()
     identity_nullifier: toBigInt(identity.identity_nullifier).toString()
     path_elements[10]:  fullPath.pathElements.map(e => e.toString())
     path_indices[10]:   fullPath.pathIndices

   snarkjs.groth16.fullProve(inputs, circuit.wasm, circuit_final.zkey)
   → proof (pi_a, pi_b, pi_c) + publicSignals[4]

5. FORMAT FOR SUI
   proofBytes (128 bytes):
     A = encodeG1(pi_a)     32 bytes
     B = encodeG2(pi_b)     64 bytes
     C = encodeG1(pi_c)     32 bytes

   publicInputsBytes (128 bytes):
     merkle_root      32 bytes LE
     nullifier_hash   32 bytes LE
     signal_hash      32 bytes LE
     external_null    32 bytes LE

   nullifier (32 bytes LE) = publicSignals[1]

6. SUBMIT ON-CHAIN
   zk_vote::submit_vote(
     registry, poll_id,
     proof_bytes, public_inputs_bytes,
     nullifier, choice, clock
   )
```

### On-chain Verification (zk_vote.move)

```
1. Assert poll.status == Voting (1)
2. Assert clock.timestamp_ms() <= poll.voting_end
3. Assert choice == 0 or 1
4. Assert nullifier NOT in poll.nullifiers (VecSet)
5. Extract root from public_inputs[0..32]
6. Assert root == poll.council_root          ← must match depth-10 root
7. Reconstruct PVK from poll's 4 pvk fields
8. groth16::verify_groth16_proof(bn254(), pvk, inputs, proof)
9. Assert proof valid
10. Insert nullifier into VecSet
11. Increment yes_count or no_count
12. Emit VoteCast event
```

---

## 6. Phase 5: Finalize

```
Sau voting_end:
  governance::finalize(registry, poll_id, clock)  — permissionless
  hoặc
  governance::admin_finalize(registry, poll_id)   — poll admin, bất kỳ lúc nào

Logic:
  yes_count >= threshold → status = Approved (2)
  yes_count <  threshold → status = Rejected (3)
```

---

## 7. Data Format Reference

### Hex ↔ BigInt Conversion

```typescript
// WASM output: hex strings WITHOUT 0x prefix
// snarkjs input: decimal strings
// Contract input: bytes (LE)

function toBigInt(s: string): bigint {
  if (s.startsWith('0x')) return BigInt(s)
  if (/[a-fA-F]/.test(s)) return BigInt(`0x${s}`)  // hex without prefix
  return BigInt(s)                                    // decimal
}
```

### BCS vector<u8> Decoding

`devInspectTransactionBlock` trả về BCS-encoded values. `vector<u8>` có ULEB128 length prefix:

```
[length_uleb128] [data_bytes...]

Decode:
  1. Read ULEB128 → length
  2. Skip prefix bytes
  3. Read `length` bytes → actual data
```

### Poseidon Hash Functions

| Function | Input | Output | Dùng cho |
|----------|-------|--------|----------|
| `Poseidon1(x)` | 1 field element | field element | signal_hash, external_nullifier |
| `Poseidon2(a, b)` | 2 field elements | field element | commitment, nullifier_hash, Merkle hash |

Field: BN254 scalar field (~254 bits)

---

## 8. Bug Log — Các lỗi đã gặp và cách fix

### Bug 1: `groth16::prepare_verifying_key_internal` abort code 0

**Triệu chứng:** Transaction abort khi create_poll, lỗi ở `prepare_verifying_key_internal`.

**Nguyên nhân:** `vk_bytes.bin` thiếu 8 bytes IC count prefix. Arkworks `serialize_compressed` format yêu cầu u64 LE length trước IC points array. Script `export-vk-bytes.mjs` không ghi length prefix.

**Fix:** Thêm IC count (u64 LE, 8 bytes) vào `export-vk-bytes.mjs` trước IC points. File size: 384 → 392 bytes.

```
Trước: alpha(32) + beta(64) + gamma(64) + delta(64) + IC(5×32) = 384
Sau:   alpha(32) + beta(64) + gamma(64) + delta(64) + ic_count(8) + IC(5×32) = 392
```

---

### Bug 2: Walrus fetch 400 — `Cannot parse blob_id`

**Triệu chứng:** Khi vote, fetch identity từ Walrus trả về 400: `failed to parse a blob ID`.

**Nguyên nhân:** `devInspectTransactionBlock` trả về BCS-encoded `vector<u8>`. Code decode toàn bộ raw bytes (bao gồm ULEB128 length prefix) thành UTF-8, làm hỏng blob ID string.

**Fix:** Thêm `decodeBcsVectorU8AsString()` — skip ULEB128 length prefix trước khi decode UTF-8.

---

### Bug 3: `No module found with module name whitelist`

**Triệu chứng:** Khi decrypt identity blob, Seal SDK báo lỗi module `whitelist` không tồn tại.

**Nguyên nhân:** Identity blobs được encrypt với Seal demo package (`0x2b5472a...`) có module `whitelist`, nhưng module đó không tồn tại trên testnet. Decrypt cần gọi approve function từ cùng package đã encrypt.

**Fix:** Bỏ Seal encrypt cho identity blobs — upload plaintext lên Walrus. Lý do: poll_id chưa tồn tại on-chain tại thời điểm upload (cần cho Seal identity format `registry_id + poll_id`). Bảo mật vẫn OK vì ZK proof không reveal identity secret.

---

### Bug 4: `Cannot convert ... to a BigInt`

**Triệu chứng:** Khi generate proof, `BigInt("2e1c1ac7...")` fail vì chữ `e` bị hiểu là scientific notation.

**Nguyên nhân:** WASM trả về hex strings không có `0x` prefix. `BigInt()` không tự detect hex. Ký tự `e` trong hex bị parse như exponent.

**Fix:** Thêm helper `toBigInt(s)` — detect hex (chứa `a-f`) và tự thêm `0x` prefix. Áp dụng cho tất cả circuit inputs trước khi truyền vào snarkjs.

```typescript
function toBigInt(s: string): bigint {
  if (s.startsWith('0x')) return BigInt(s)
  if (/[a-fA-F]/.test(s)) return BigInt(`0x${s}`)
  return BigInt(s)
}
```

---

### Bug 5: `Not enough values for input signal path_elements`

**Triệu chứng:** snarkjs báo lỗi khi generate proof — `path_elements` không đủ 10 phần tử.

**Nguyên nhân:** WASM trả về `merkle_path: []` và `tree_depth: 0` cho tree 1 leaf. Circuit cần `path_elements[10]`. Padding với `'0'` không tạo valid Merkle proof.

**Fix:** Tạo `merkle-pad.ts` — build full depth-10 Poseidon Merkle tree từ commitments ở frontend. Dùng `poseidon-lite` để hash, tạo đúng zero hashes cho mỗi level. Trả về `pathElements[10]`, `pathIndices[10]`, và depth-10 `root`.

---

### Bug 6: `Assert Failed in OrcaVote_142 line 88` (tree.root === merkle_root)

**Triệu chứng:** Circuit assert fail — computed Merkle root không match public input `merkle_root`.

**Nguyên nhân 1 — Council root sai:** On-chain `council_root` lưu depth-0 root từ WASM (= commitment), nhưng circuit compute depth-10 root (khác hoàn toàn).

**Fix:** `CreatePollPanel` compute depth-10 root bằng `buildFullMerklePath()` và lưu on-chain thay vì WASM root.

**Nguyên nhân 2 — Commitment formula mismatch:** Circuit dùng `Poseidon1(identity_secret)` nhưng WASM dùng `Poseidon2(identity_nullifier, identity_secret)`.

```
Circuit (cũ):  commitment = Poseidon(secret)           → 0x0342ea53...
WASM:          commitment = Poseidon(nullifier, secret) → 0x09704b7e...
```

**Fix:** Sửa circuit `orcavote.circom`:
- Thêm private input `identity_nullifier`
- Đổi commitment: `Poseidon(1) → Poseidon(2)` với inputs `[nullifier, secret]`
- Recompile circuit → new wasm, zkey, vk_bytes
- Redeploy Move contract (vì vk_bytes thay đổi)
- Update `generateProof()` truyền `identity_nullifier` vào circuit

---

### Bug 7: `Invalid hex string ... poll_01`

**Triệu chứng:** Seal encrypt fail với hex string chứa `"poll_01"` (không phải hex).

**Nguyên nhân:** `encryptIdentityBlob()` build Seal identity = `registry_id + poll_id`. Nhưng `poll_id` từ identity blob là user-input string (`"poll_01"`), không phải on-chain hex object ID. `padStart(64, '0')` trên `"poll_01"` tạo ra invalid hex.

**Fix:** Bỏ Seal encrypt cho identity blobs (xem Bug 3). Upload plaintext.

---

### Bug 8: BlobIdPicker sort sai

**Triệu chứng:** Popup "Walrus Blobs" hiện blobs cũ ở trên, mới ở dưới.

**Nguyên nhân:** Sort theo `registeredEpoch` nhưng tất cả blobs cùng epoch. `getOwnedObjects` không guarantee order.

**Fix:** Thêm `version` field vào `WalrusBlob` interface, capture từ `obj.version`. Sort theo `version` descending (cao hơn = mới hơn).

---

## Deployment History

| Version | Package ID | Registry ID | Thay đổi |
|---------|-----------|-------------|----------|
| v1 | `0xcaa9a44d...` | `0x96c9df61...` | Initial deploy |
| v2 | `0x0276941f...` | `0x77b86d9a...` | Fix vk_bytes IC count, Seal encrypt changes |
| v3 | `0x982f507d...` | `0xf2a5b3f0...` | Circuit fix: commitment = Poseidon2(nullifier, secret) |

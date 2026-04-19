# OrcaVote — ZK Proof System

## Tổng quan

OrcaVote sử dụng Groth16 zero-knowledge proof trên đường cong BN254 để đảm bảo:

1. Voter là thành viên hợp lệ (Merkle membership)
2. Mỗi voter chỉ vote 1 lần (nullifier)
3. Vote choice bị bind vào proof (signal)
4. Không ai biết voter chọn YES hay NO (zero-knowledge)

Circuit dựa trên Semaphore protocol, customize cho OrcaVote.

---

## Circuit Architecture

```
                    Private Inputs                    Public Inputs
                    ──────────────                    ─────────────
                    identity_secret                   merkle_root
                    identity_nullifier                nullifier_hash
                    path_elements[10]                 signal_hash
                    path_indices[10]                  external_nullifier

                              │                              │
                              ▼                              ▼
                    ┌─────────────────────────────────────────────┐
                    │              OrcaVote Circuit                │
                    │                                             │
                    │  1. commitment = Poseidon(nullifier, secret)│
                    │  2. Merkle proof: commitment ∈ tree         │
                    │  3. nullifier = Poseidon(secret, ext_null)  │
                    │  4. signal constraint                       │
                    │                                             │
                    │  Constraints: 2911                          │
                    │  Curve: BN254                               │
                    │  Tree depth: 10 (max 1024 voters)           │
                    └─────────────────────────────────────────────┘
                              │
                              ▼
                    Groth16 Proof (128 bytes)
                    + Public Signals (4 × 32 bytes)
```

---

## Inputs chi tiết

### Private Inputs (chỉ voter biết, không lộ on-chain)

| Input | Type | Nguồn |
|-------|------|-------|
| `identity_secret` | 32 bytes hex | Từ IdentityBlob (Walrus) |
| `identity_nullifier` | 32 bytes hex | Từ IdentityBlob (Walrus) |
| `path_elements[10]` | bigint[10] | Rebuild từ tất cả commitments |
| `path_indices[10]` | bit[10] | Vị trí leaf trong tree |

### Public Inputs (lộ on-chain, ai cũng thấy)

| Input | Type | Ý nghĩa |
|-------|------|---------|
| `merkle_root` | bigint | Root của Poseidon Merkle tree — phải match on-chain `council_root` |
| `nullifier_hash` | bigint | Hash duy nhất per voter per poll — ngăn double-vote |
| `signal_hash` | bigint | Hash của vote choice — bind proof vào YES/NO |
| `external_nullifier` | bigint | Hash của poll_id — scope nullifier theo poll |

---

## 4 bước trong Circuit

### 1. Identity Commitment

```
commitment = Poseidon2(identity_nullifier, identity_secret)
```

Đây là "fingerprint" của voter. Được tính khi build Merkle tree (WASM) và lưu trong IdentityBlob.

Thứ tự input quan trọng: `(nullifier, secret)` — phải match giữa WASM builder và circuit.

### 2. Merkle Membership Proof

```
leaf = commitment
for i in 0..10:
    if path_indices[i] == 0:
        hash = Poseidon2(leaf, path_elements[i])
    else:
        hash = Poseidon2(path_elements[i], leaf)
    leaf = hash

ASSERT: leaf == merkle_root  ← Circuit line 91
```

Chứng minh: commitment nằm trong Merkle tree mà không tiết lộ nó ở vị trí nào.

Tree depth = 10 → hỗ trợ tối đa 2^10 = 1024 voters. Nếu ít hơn 1024, các leaf trống = 0 (zero hash).

### 3. Nullifier Hash

```
nullifier_hash = Poseidon2(identity_secret, external_nullifier)
```

Trong đó:
```
external_nullifier = Poseidon1(poll_id)
```

Nullifier là deterministic: cùng voter + cùng poll → cùng nullifier. On-chain lưu nullifier trong VecSet → nếu đã tồn tại → reject (double-vote).

Tại sao dùng `identity_secret` thay vì `identity_nullifier`?
- Đây là design choice của circuit. `identity_secret` là private input duy nhất mà chỉ voter biết.
- `identity_nullifier` cũng private, nhưng dùng `secret` cho nullifier hash đảm bảo nullifier không thể reverse ra nullifier value.

### 4. Signal Constraint

```
signal_hash_sq = signal_hash × signal_hash
```

Trong đó:
```
signal_hash = Poseidon1(choice)    // choice = 0 (NO) hoặc 1 (YES)
```

Phép nhân tạo constraint — nếu bỏ, compiler optimize `signal_hash` ra khỏi circuit. Kết quả: proof chỉ valid cho đúng choice đã chọn. Thay đổi choice → proof invalid.

---

## Merkle Tree

### Build (WASM — lúc tạo poll)

```
Input: voter addresses[]
Output: MerkleResult {
    root,           // hex, big-endian
    root_le,        // hex, little-endian (cho contract)
    commitments[],  // 1 per voter
    identities[],   // IdentityBlob per voter
}
```

WASM module:
1. Tạo random `identity_secret` + `identity_nullifier` cho mỗi voter
2. Tính `commitment = Poseidon2(nullifier, secret)`
3. Build Poseidon Merkle tree từ commitments
4. Trả root + paths

### Rebuild (JS — lúc vote)

Khi voter vote, app cần rebuild tree để lấy proof path:

1. Fetch `poll_voter_list` on-chain → danh sách voter addresses
2. Fetch mỗi voter's IdentityBlob từ Walrus → extract `identity_commitment`
3. `buildFullMerklePath(allCommitments, myLeafIndex)` → path + root
4. Root phải match on-chain `council_root`

Tại sao rebuild thay vì lưu tree?
- Tree có thể rebuild từ commitments bất cứ lúc nào
- Không cần lưu trữ thêm
- Commitments đã nằm trong IdentityBlobs trên Walrus

### Zero Hashes

Khi tree có ít hơn 2^10 leaves, các vị trí trống dùng zero hash:

```
zeroHashes[0] = 0
zeroHashes[i] = Poseidon2(zeroHashes[i-1], zeroHashes[i-1])
```

---

## On-Chain Verification

### Contract: `zk_vote::submit_vote`

```move
public fun submit_vote(
    registry, poll_id,
    proof_bytes,           // 128 bytes: A(32) + B(64) + C(32)
    public_inputs_bytes,   // 128 bytes: 4 × 32-byte LE scalars
    nullifier,             // 32 bytes LE
    choice,                // u8: 0 or 1
    clock,
)
```

Verification steps:
1. Poll status == Voting
2. Clock <= voting_end (deadline)
3. Choice == 0 or 1
4. Nullifier chưa dùng (VecSet check)
5. `public_inputs[0..32]` (merkle_root) == poll's `council_root`
6. `groth16::verify_groth16_proof(bn254, pvk, inputs, proof)` → true

Nếu tất cả pass → lưu nullifier + tăng yes/no count.

### Proof Encoding (Arkworks format)

snarkjs output → Arkworks compressed:

```
proof_bytes (128 bytes):
  [0..32]   A point (G1 compressed): x coordinate LE + sign bit
  [32..96]  B point (G2 compressed): x coordinates LE + sign bit
  [96..128] C point (G1 compressed): x coordinate LE + sign bit

public_inputs_bytes (128 bytes):
  [0..32]   merkle_root (LE)
  [32..64]  nullifier_hash (LE)
  [64..96]  signal_hash (LE)
  [96..128] external_nullifier (LE)
```

G1 compression: 32 bytes x-coordinate (little-endian), bit 255 = sign of y.
G2 compression: 64 bytes (x_c0 LE + x_c1 LE), bit 511 = sign of y_c1.

### Verifying Key

`vk_bytes.bin` (384 bytes) — Arkworks-serialized Groth16 verifying key.

- Static file — build 1 lần từ circuit, dùng cho tất cả polls
- Truyền vào `create_poll` → contract gọi `groth16::prepare_verifying_key(bn254, vk_bytes)`
- Prepared key (4 parts) lưu trong Poll struct

---

## Tính ẩn danh

### Cái lộ on-chain

| Thông tin | Nơi lưu |
|-----------|---------|
| Ai gọi `submit_vote` (sender) | Transaction trên SuiScan |
| Nullifier hash | VoteCast event + Poll.nullifiers |
| YES/NO count tổng | Poll.yes_count, Poll.no_count |
| Thời gian vote | Transaction timestamp |

### Cái KHÔNG thể biết

| Thông tin | Tại sao |
|-----------|---------|
| Voter X chọn YES hay NO | ZK proof ẩn liên kết address ↔ choice |
| Nullifier thuộc voter nào | Hash 1 chiều, không reverse |
| Identity secret | Private input, không bao giờ on-chain |
| Vị trí leaf trong tree | Path indices là private input |

### Lưu ý bảo mật

**Timing attack**: Với ít voters + realtime tally, có thể suy luận:
- "Voter A vote lúc 10:00, yes_count tăng 0→1 → A vote YES"
- Giải pháp: chỉ reveal tally sau khi voting kết thúc

**Identity blob plaintext**: IdentityBlobs upload dạng plaintext vì poll_id chưa tồn tại lúc upload. Ai cũng đọc được identity_secret. Tuy nhiên:
- Chỉ wallet owner mới ký được transaction submit_vote
- ZK proof verify sender implicitly qua Sui transaction signature
- Identity secret chỉ dùng locally để generate proof

---

## Circuit Artifacts

```
public/zk-circuit/
├── circuit.wasm           ~2.0 MB   Witness calculator (circom compiled)
├── circuit_final.zkey     ~1.7 MB   Proving key (Groth16 trusted setup)
├── verification_key.json  ~2 KB     Human-readable VK (for debugging)
└── vk_bytes.bin           392 B     Arkworks VK (for create_poll)
```

### Build từ source

```bash
cd circuits
npm install          # circomlib
make all             # compile → trusted setup → export → copy to public/
```

Pipeline:
1. `circom orcavote.circom` → circuit.wasm + circuit.r1cs
2. `snarkjs groth16 setup` → circuit_0000.zkey (powers of tau)
3. `snarkjs zkey contribute` → circuit_final.zkey
4. `snarkjs zkey export verificationkey` → verification_key.json
5. `node export-vk-bytes.mjs` → vk_bytes.bin (Arkworks format)

### Browser loading

- `vk_bytes.bin`: fetch on demand (tiny, cho create_poll)
- `circuit.wasm` + `circuit_final.zkey`: fetch khi user click Vote (cached sau lần đầu)
- `snarkjs`: dynamic import (không bundle cho đến khi cần)
- `poseidon-lite`: dynamic import

Proof generation: ~2-5 giây trong browser.

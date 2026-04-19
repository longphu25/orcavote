# OrcaVote — Voting Flow Guide

## Tổng quan

OrcaVote là hệ thống bỏ phiếu ẩn danh trên Sui blockchain, sử dụng ZK Proof (Groth16) để đảm bảo không ai biết voter đã chọn YES hay NO, kể cả khi transaction được ký công khai trên chain.

```
┌──────────────────────────────────────────────────────────────┐
│                    POLL CREATOR FLOW                          │
│                                                              │
│  ① Nhập danh sách voter addresses                           │
│  ② WASM build Merkle Tree → tạo IdentityBlob cho mỗi voter │
│  ③ Upload mỗi IdentityBlob lên Walrus → nhận blobId        │
│  ④ Tạo Poll on-chain (1 transaction duy nhất):              │
│     create_poll → register_voters → start_voting             │
│                                                              │
│  Kết quả: Poll on-chain lưu mapping                         │
│           voter_address → walrus_blob_id                     │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                      VOTER FLOW                              │
│                                                              │
│  ① Mở poll detail trong app                                 │
│  ② App tự động fetch identity blob từ Walrus                │
│  ③ App generate ZK proof trong browser                      │
│  ④ Submit vote on-chain (ẩn danh)                           │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                    FINALIZE FLOW                             │
│                                                              │
│  Sau deadline → ai cũng có thể gọi Finalize                │
│  yes_count >= threshold → Approved → Dataset được unlock    │
│  yes_count <  threshold → Rejected                          │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Build Merkle Tree

Poll creator nhập danh sách wallet addresses của voters (ví dụ 3 addresses).

WASM module `build_merkle_tree` thực hiện:

```
Với mỗi voter:
  1. Tạo identity_secret    = random 32 bytes
  2. Tạo identity_nullifier = random 32 bytes
  3. Tính identity_commitment = Poseidon2(identity_nullifier, identity_secret)
```

Sau đó build Poseidon Merkle Tree từ tất cả commitments → ra `council_root`.

Output cho mỗi voter là một `IdentityBlob`:

```json
{
  "identity_secret": "1441ae57...",
  "identity_nullifier": "09ef46f4...",
  "identity_commitment": "09704b7e...",
  "address": "0x3411...",
  "merkle_root": "09704b7e...",
  "merkle_path": [/* sibling hashes */],
  "leaf_index": 0
}
```

Nếu WASM trả `tree_depth=0` (1 voter), app sẽ rebuild tree lên depth 10 trong JS để match circuit.

---

## Phase 2: Upload Identity Blobs lên Walrus

Mỗi `IdentityBlob` được upload lên Walrus dưới dạng plaintext JSON.

```
IdentityBlob (JSON) → Walrus Publisher/SDK → blobId (base64url)
```

Tại sao plaintext mà không Seal encrypt?
- Lúc upload, `poll_id` chưa tồn tại (poll chưa được tạo on-chain)
- Seal identity cần `poll_id` để tạo access policy
- Bảo mật vẫn đảm bảo vì: identity secret chỉ dùng locally để generate ZK proof, không bao giờ lộ on-chain

Mỗi blob upload xong nhận được `blobId` — đây là key để fetch lại từ Walrus.

---

## Phase 3: Tạo Poll On-Chain

Một transaction duy nhất (PTB) thực hiện 3 bước:

### Bước 1: `create_poll`

```
Input:
  - data_blob_id        → Walrus blob ID của dataset (dữ liệu sẽ share nếu Approved)
  - data_seal_identity  → Seal identity cho dataset
  - council_root        → Merkle root (little-endian hex)
  - threshold           → Số YES votes tối thiểu để Approved
  - voting_end          → Timestamp deadline (ms)
  - vk_bytes            → Groth16 verifying key (Arkworks BN254)
  - title               → Tên poll

Output: poll_id (on-chain object ID)
```

### Bước 2: `register_voters`

```
Input:
  - poll_id
  - voters[]           → [0x3411..., 0xdfdd..., 0x70b5...]
  - walrus_blob_ids[]  → [blobId_0, blobId_1, blobId_2]
  - seal_identities[]  → [addr_0, addr_1, addr_2]

On-chain lưu mapping:
  (poll_id, voter_address) → VoterIdentityRef {
    walrus_blob_id,
    seal_identity
  }
```

### Bước 3: `start_voting`

Chuyển poll status từ `Setup (0)` → `Voting (1)`.

Sau bước này, voters có thể bắt đầu vote.

---

## Phase 4: Vote (ZK Anonymous)

Khi voter mở poll detail và bấm Vote, app thực hiện tự động:

### 4.1 Fetch Identity Blob

```
get_voter_ref(registry, poll_id, voter_address)
  → walrus_blob_id

fetch(aggregator/v1/blobs/{walrus_blob_id})
  → IdentityBlob JSON
```

App gọi on-chain `get_voter_ref` để lấy blob ID, rồi fetch blob từ Walrus aggregator.

### 4.2 Rebuild Merkle Path

```
commitments = [tất cả identity_commitments]
buildFullMerklePath(commitments, leaf_index)
  → { pathElements, pathIndices, root }
```

Rebuild Poseidon Merkle tree depth 10 trong browser để lấy proof path.

### 4.3 Generate ZK Proof (Groth16)

```
Input (private — không lộ on-chain):
  - identity_secret
  - identity_nullifier
  - merkle_path (pathElements + pathIndices)

Input (public — lộ on-chain):
  - merkle_root
  - nullifier_hash = Poseidon(identity_nullifier, external_nullifier)
  - signal_hash = Poseidon(choice)  // 0=NO, 1=YES
  - external_nullifier = Poseidon(poll_id)

Output:
  - proof (Groth16 BN254)
  - public_inputs
  - nullifier
```

ZK circuit chứng minh: "Tôi biết một identity_secret + identity_nullifier mà commitment của nó nằm trong Merkle tree, nhưng tôi không tiết lộ nó là cái nào."

### 4.4 Submit Vote On-Chain

```
submit_vote(
  registry,
  poll_id,
  proof_bytes,
  public_inputs_bytes,
  nullifier,
  choice,    // 0 hoặc 1
  clock
)
```

On-chain contract:
1. Verify Groth16 proof → đảm bảo voter hợp lệ
2. Check nullifier chưa dùng → ngăn vote 2 lần
3. Lưu nullifier + tăng yes_count hoặc no_count
4. Emit event `VoteCast { nullifier, choice, yes_count, no_count }`

---

## Phase 5: Finalize

Sau voting deadline, ai cũng có thể gọi `finalize`:

```
if yes_count >= threshold → status = Approved (2)
if yes_count <  threshold → status = Rejected (3)
```

Poll admin có thể gọi `admin_finalize` để kết thúc sớm.

Khi poll Approved, dataset blob được unlock qua Seal:
- `seal_approve_dataset` kiểm tra poll status == Approved
- Seal key server dry-run verify → trả decryption key
- Ai cũng có thể decrypt dataset

---

## Tính ẩn danh

### Cái có thể thấy on-chain

| Thông tin | Ai thấy? |
|-----------|----------|
| Ai đã gọi `submit_vote` (sender address) | Công khai trên SuiScan |
| Nullifier hash | Công khai (trong event) |
| Tổng YES / NO count | Công khai |

### Cái KHÔNG thể truy ngược

| Thông tin | Tại sao? |
|-----------|----------|
| Voter X chọn YES hay NO | ZK proof ẩn liên kết giữa address và choice |
| Nullifier thuộc voter nào | Nullifier = hash(identity_nullifier, external_nullifier), không reverse được |
| Identity secret của voter | Chỉ tồn tại trong IdentityBlob, dùng locally rồi bỏ |

### Lưu ý

Với số lượng voter ít (ví dụ 3 người) và tally hiển thị realtime, có thể suy luận dựa trên thứ tự vote + thời gian. Ví dụ: "Voter A vote lúc 10:00, lúc đó yes_count tăng 0→1 → A vote YES". Giải pháp: chỉ reveal tally sau khi voting kết thúc.

---

## Sơ đồ dữ liệu On-Chain

```
Registry (shared object)
├── polls: Table<ID, Poll>
│   └── Poll {
│       poll_id, data_blob_id, data_seal_identity,
│       council_root, threshold, voting_end, status,
│       yes_count, no_count, nullifiers: VecSet,
│       pvk_* (verifying key parts), title, admin
│   }
├── voter_refs: Table<VoterRefKey, VoterIdentityRef>
│   └── (poll_id, voter_address) → {
│       walrus_blob_id,   // fetch identity blob từ Walrus
│       seal_identity     // voter address
│   }
├── poll_voters: Table<ID, vector<address>>
│   └── poll_id → [voter addresses]
└── data_assets: Table<ID, DataAsset>
    └── { walrus_blob_id, seal_identity, owner, name }
```

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Smart Contract | Move on Sui |
| ZK Circuit | Groth16 BN254 (circom → snarkjs) |
| Merkle Tree | Poseidon hash (WASM + poseidon-lite JS) |
| Identity Storage | Walrus (decentralized blob store) |
| Dataset Encryption | Seal (threshold encryption on Sui) |
| Frontend | React + Vite + @mysten/dapp-kit |

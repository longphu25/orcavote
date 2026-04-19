# OrcaVote — Product Requirements Document

## 1. Overview

**Tên sản phẩm:** OrcaVote
**Tagline:** Vote-to-unlock private data.

OrcaVote là protocol trên Sui cho phép release dữ liệu nhạy cảm (dataset, báo cáo, AI training data…) chỉ khi một nhóm stakeholder bỏ phiếu ẩn danh đồng ý. Dữ liệu luôn được mã hóa bằng Seal và lưu trên Walrus, logic bỏ phiếu và điều kiện release được thực thi on-chain bằng Move.

**Deployed:** Sui Testnet
- Package: `0x115063746a65dce6e68997b5116af16188a164f724de111d87f9be6e085225f0`
- Registry: `0x04d714c372105c024a7b99d2d3fb9d8e79f159e335894c158dae11668b9a233e`

---

## 2. Goals

1. **Data luôn được bảo vệ**: chỉ tồn tại ở dạng ciphertext trên Walrus; on-chain chỉ lưu metadata.
2. **Data release có governance**: mọi truy cập dataset phải đi qua vòng vote on-chain (threshold YES/NO, deadline).
3. **Anonymous voting**: mỗi phiếu là ZK proof chứng minh membership và non-double-vote, không lộ identity.
4. **On-chain tally**: kết quả được đếm và lưu trực tiếp trên Sui, code minh bạch.
5. **Trustless release**: Seal key server tự động cấp key khi poll Approved — không cần trust bên thứ 3.

---

## 3. Personas

| Persona | Vai trò |
|---------|---------|
| **Poll Creator** | Tạo poll, đăng ký voters, gắn dataset, quản lý lifecycle |
| **Data Council Member (Voter)** | Bỏ phiếu ẩn danh YES/NO cho mỗi poll |
| **Data Consumer** | Sau khi poll Approved, decrypt dataset từ Walrus |
| **Observer** | Xem trạng thái polls, tally, kết quả — không xem được phiếu cá nhân |

---

## 4. Core Use Case

DAO có dataset `Q1_Revenue_By_Region` đã encrypt bằng Seal và lưu trên Walrus. Đối tác X muốn truy cập:

1. Poll Creator upload dataset → Seal encrypt → Walrus
2. Nhập 3 voter addresses → WASM build Merkle tree → upload identity blobs → Walrus
3. Tạo poll on-chain: `create_poll` + `register_voters` + `start_voting` (1 transaction)
4. Seal encrypt dataset cho poll (registry_id + poll_id) → update on-chain blob reference
5. 3 voters connect wallet → bỏ phiếu ẩn danh (ZK proof trong browser)
6. Đủ 2/3 YES → Finalize → Approved
7. Ai cũng decrypt dataset từ Walrus (Seal verify poll Approved on-chain)

---

## 5. Functional Requirements — Implementation Status

### 5.1 Data Asset Management ✅

- Upload file → Seal encrypt (`seal_approve_data_asset` policy) → Walrus
- Epoch selector (1–53 epochs) + cost estimate (WAL)
- Deletable toggle
- Paginated blob list (all wallet-owned blobs, not just 50)
- Decrypt by blob ID (owner-only via Seal)
- On-chain registration via `data_asset::register`

**Files:** `DataAssetPanel.tsx`, `useWalrusBlobs.ts`, `BlobIdPicker.tsx`

### 5.2 ZK Merkle Identity Builder ✅

- WASM module (`zk_merkle_wasm`) build Poseidon Merkle tree
- Per voter: random `identity_secret` + `identity_nullifier` → `commitment = Poseidon2(nullifier, secret)`
- Tree depth 10 (max 1024 voters)
- Output: `MerkleResult` with root, commitments, IdentityBlobs
- Full depth-10 tree rebuild in JS (`merkle-pad.ts`) when WASM returns depth=0

**Files:** `ZkMerklePanel.tsx`, `zk-merkle.ts`, `merkle-pad.ts`

### 5.3 Identity Blob Upload ✅

- Upload identity blobs to Walrus (plaintext — Seal encrypt skipped because poll_id unknown at upload time)
- Batch upload with progress
- Security maintained by ZK proof — identity secret only used locally

**Files:** `seal-walrus.ts` (`encryptIdentityBlob`, `encryptAndUploadAll`)

### 5.4 Poll Creation ✅

- Single PTB: `create_poll` → `register_voters` → `start_voting`
- On-chain stores: council_root, threshold, deadline, prepared verifying key
- Voter mapping: `(poll_id, voter_address) → VoterIdentityRef { walrus_blob_id }`
- Post-creation: "Seal Encrypt & Upload Dataset" step
  - Detect if blob is Seal-encrypted → decrypt with owner key first
  - Re-encrypt plaintext with poll identity (`registry_id + poll_id`)
  - Upload new blob → update on-chain `data_blob_id` via `set_data_blob`

**Files:** `CreatePollPanel.tsx`, `poll-transactions.ts`

### 5.5 Anonymous Voting ✅

- Voter opens poll → app checks registration on-chain
- Vote flow (4 automatic steps):
  1. Fetch voter's identity blob from Walrus (via on-chain mapping)
  2. Fetch ALL voters' blobs → extract commitments → rebuild full Merkle tree
  3. Generate Groth16 proof in browser (snarkjs, ~3 seconds)
  4. Submit proof + nullifier + choice on-chain
- On-chain: verify proof → check nullifier → update tally
- Live tally display (YES/NO count, threshold progress)

**Files:** `PollDetailPanel.tsx`, `zk-prove.ts`

### 5.6 Finalize ✅

- Permissionless finalize after deadline (`governance::finalize`)
- Admin early finalize (`governance::admin_finalize`)
- Result: `yes_count >= threshold` → Approved, else Rejected

**Files:** `PollDetailPanel.tsx`, `poll-transactions.ts` (`finalizePollTx`, `adminFinalizePollTx`)

### 5.7 Dataset Decrypt (Post-Approval) ✅

- When poll Approved: "Shared Dataset" section appears
- Click "Decrypt Dataset" → Seal key server dry-run `seal_approve_dataset` → verify poll Approved → return key
- App decrypts → display content + download button
- Fallback: try `seal_approve_data_asset` if first pattern fails
- Sanity check: detect if decrypt returned ciphertext unchanged

**Files:** `PollDetailPanel.tsx`

### 5.8 Poll List ✅

- Query `PollCreated` events → fetch poll details via devInspect
- Display: title, status, tally, threshold, deadline, admin
- Click → poll detail with vote/finalize/decrypt UI

**Files:** `PollListPanel.tsx`

---

## 6. Architecture

### 6.1 On-Chain (Move)

```
move/orcavote/sources/
├── registry.move       Shared singleton, core types, AdminCap
├── governance.move     Poll lifecycle, voter registration, set_data_blob, finalize
├── zk_vote.move        Groth16 BN254 verification, nullifier dedup, tally
├── seal_policy.move    3 Seal approval policies
└── data_asset.move     Dataset registration
```

### 6.2 Seal Policies (Unified — single package)

| Policy | Function | Who | Seal ID |
|--------|----------|-----|---------|
| Data Asset | `seal_approve_data_asset` | Owner only | `registry_id(32) + owner_address(32)` |
| Dataset | `seal_approve_dataset` | Anyone (post-Approved) | `registry_id(32) + poll_id(32)` |
| Identity | `seal_approve_identity` | Registered voter | `registry_id(32) + poll_id(32)` |

### 6.3 ZK Circuit

```
circuits/orcavote.circom — Semaphore-style Groth16 (BN254)
├── Poseidon Merkle membership (depth 10, max 1024 voters)
├── Nullifier = Poseidon2(identity_secret, external_nullifier)
├── Signal = Poseidon1(vote_choice) — binds proof to YES/NO
└── 2911 constraints, 4 public inputs
```

### 6.4 Frontend

```
src/
├── OrcaVoteApp.tsx          Main app (3 tabs: Data Asset, Tạo Poll, Polls)
├── DataAssetPanel.tsx       Upload + encrypt + decrypt data assets
├── ZkMerklePanel.tsx        Build Merkle tree + upload identities
├── CreatePollPanel.tsx      Create poll + Seal encrypt dataset
├── PollListPanel.tsx        List all polls
├── PollDetailPanel.tsx      Vote + finalize + decrypt dataset
├── seal-walrus.ts           Seal encrypt/decrypt + Walrus upload/fetch
├── poll-transactions.ts     Move transaction builders
├── zk-prove.ts              Browser ZK proof generation (snarkjs)
├── merkle-pad.ts            Full depth-10 Merkle tree builder
├── useWalrusBlobs.ts        Shared hook for wallet blob fetching
├── BlobIdPicker.tsx          Blob selection modal
└── theme.ts                 Design tokens
```

### 6.5 Browser Artifacts

```
public/zk-circuit/
├── circuit.wasm           ~2 MB    Witness calculator
├── circuit_final.zkey     ~1.7 MB  Proving key
├── verification_key.json           Human-readable VK
└── vk_bytes.bin           392 B    Arkworks VK for create_poll
```

---

## 7. Data Flow

```
Poll Creator                          Voters                         Anyone
───────────                          ──────                         ──────

1. Upload dataset (Data Asset)
   File → Seal encrypt → Walrus

2. Build Merkle Tree
   Addresses → WASM → IdentityBlobs

3. Upload Identity Blobs → Walrus

4. Create Poll on-chain (1 tx)
   create_poll + register_voters
   + start_voting

5. Seal Encrypt Dataset for poll
   Decrypt owner blob → re-encrypt
   with poll identity → upload
   → update on-chain

                                     6. Open poll → Vote
                                        Fetch identity blob
                                        Rebuild Merkle tree
                                        Generate ZK proof
                                        Submit on-chain

                                                                    7. Finalize (after deadline)

                                                                    8. Decrypt dataset
                                                                       (if Approved)
```

---

## 8. Privacy Model

### Visible on-chain
- Who called `submit_vote` (sender address)
- Nullifier hash (per vote)
- Total YES/NO count
- Vote timestamp

### NOT visible
- Which voter chose YES vs NO (ZK proof hides this)
- Which nullifier belongs to which voter (hash is one-way)
- Identity secret (private input, never on-chain)
- Leaf position in Merkle tree (private input)

### Known limitation
With few voters + realtime tally, timing analysis possible. Production mitigation: reveal tally only after deadline.

---

## 9. Non-Functional Requirements

| Requirement | Status |
|-------------|--------|
| Privacy: no voter-choice link on-chain | ✅ ZK proof |
| Verifiability: public Move code, auditable state | ✅ |
| Performance: proof gen < 5s in browser | ✅ ~3s |
| Gas cost: < 0.02 SUI per vote | ✅ ~0.01 SUI |
| Storage: decentralized (Walrus) | ✅ |
| Encryption: threshold (Seal) | ✅ |
| Max voters: 1024 (depth 10) | ✅ |

---

## 10. Documentation

| Document | Path |
|----------|------|
| Voting Flow | [docs/voting-flow.md](voting-flow.md) |
| UI Guide | [docs/ui-guide.md](ui-guide.md) |
| ZK Proof System | [docs/zk-proof.md](zk-proof.md) |
| On-Chain Architecture | [docs/on-chain.md](on-chain.md) |
| Bug Log | [docs/bug-log.md](bug-log.md) |
| Presentation Script | [docs/presentation-script.md](presentation-script.md) |

---

## 11. Future Work (Post-MVP)

- Dynamic voter groups (join/leave on-chain)
- Anti-collusion (MACI-style re-voting)
- Tally reveal only after deadline (prevent timing analysis)
- Tree depth 20 (1M voters)
- Multi-choice voting (beyond YES/NO)
- Weighted voting
- CLI tools for headless operation
- Mainnet deployment

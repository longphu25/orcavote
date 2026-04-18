# OrcaVote — Move Smart Contracts Technical Documentation

## Mục lục

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Module map](#2-module-map)
3. [On-chain objects](#3-on-chain-objects)
4. [Luồng hoạt động](#4-luồng-hoạt-động)
5. [Module chi tiết](#5-module-chi-tiết)
6. [Error codes](#6-error-codes)
7. [Events](#7-events)
8. [Seal integration](#8-seal-integration)
9. [ZK Circuit & vk_bytes](#9-zk-circuit--vk_bytes)
10. [Hướng dẫn deploy](#10-hướng-dẫn-deploy)
11. [Client integration](#11-client-integration)

---

## 1. Tổng quan kiến trúc

OrcaVote sử dụng **Registry pattern** — một shared object duy nhất (`Registry`) chứa toàn bộ state on-chain. Mọi query và mutation đều đi qua object này.

```
┌─────────────────────────────────────────────────────┐
│                   Registry (shared)                  │
│                                                      │
│  polls: Table<ID, Poll>                              │
│  data_assets: Table<ID, DataAsset>                   │
│  voter_refs: Table<VoterRefKey, VoterIdentityRef>    │
│  poll_ids: vector<ID>                                │
│  data_asset_ids: vector<ID>                          │
│  poll_voters: Table<ID, vector<address>>             │
└──────────┬──────────┬──────────┬──────────┬──────────┘
           │          │          │          │
     data_asset  governance  zk_vote  seal_policy
```

Lý do chọn Registry pattern:
- **Queryable**: client chỉ cần biết 1 object ID để đọc toàn bộ state.
- **Composable**: các module trong package truy cập Registry qua `public(package)` accessors.
- **Atomic**: tất cả write operations trên cùng 1 shared object, đảm bảo consistency.

---

## 2. Module map

```
sources/
├── registry.move      # Core types, init, package-internal accessors
├── data_asset.move    # Đăng ký encrypted dataset
├── governance.move    # Tạo poll, đăng ký voter, start/finalize voting
├── zk_vote.move       # Groth16 BN254 proof verification, nullifier, tally
└── seal_policy.move   # Entry functions cho Seal key-server dry-run
```

| Module | Vai trò | Phụ thuộc |
|--------|---------|-----------|
| `orcavote::registry` | Sở hữu tất cả struct, OTW, init, byte helpers | `sui::table`, `sui::vec_set` |
| `orcavote::data_asset` | Register + query DataAsset | `registry` |
| `orcavote::governance` | Poll lifecycle + voter registration + query | `registry`, `sui::groth16`, `sui::clock` |
| `orcavote::zk_vote` | Submit vote với ZK proof | `registry`, `sui::groth16`, `sui::clock` |
| `orcavote::seal_policy` | Seal approve entry functions | `registry` |

---

## 3. On-chain objects

### 3.1 Registry

Shared singleton, tạo lúc publish package.

| Field | Type | Mô tả |
|-------|------|-------|
| `polls` | `Table<ID, Poll>` | Tất cả polls, key = poll_id |
| `data_assets` | `Table<ID, DataAsset>` | Tất cả datasets, key = asset_id |
| `voter_refs` | `Table<VoterRefKey, VoterIdentityRef>` | Mapping (poll_id, voter) → identity ref |
| `poll_ids` | `vector<ID>` | Danh sách poll ID theo thứ tự tạo |
| `data_asset_ids` | `vector<ID>` | Danh sách asset ID theo thứ tự tạo |
| `poll_voters` | `Table<ID, vector<address>>` | poll_id → danh sách voter addresses |

### 3.2 AdminCap

Owned object, transfer cho deployer lúc init. Hiện tại AdminCap không bắt buộc cho poll creation — ai cũng có thể tạo poll. Người tạo poll trở thành admin của poll đó (lưu trong `poll.admin`). AdminCap được giữ lại cho các global admin operations trong tương lai.

### 3.3 DataAsset

| Field | Type | Mô tả |
|-------|------|-------|
| `asset_id` | `ID` | Unique identifier |
| `walrus_blob_id` | `vector<u8>` | Walrus blob ID của encrypted dataset |
| `seal_identity` | `vector<u8>` | Seal identity dùng để encrypt dataset |
| `owner` | `address` | Người đăng ký |
| `name` | `vector<u8>` | Tên / mô tả |

### 3.4 Poll

| Field | Type | Mô tả |
|-------|------|-------|
| `poll_id` | `ID` | Unique identifier |
| `data_blob_id` | `vector<u8>` | Walrus blob ID của dataset liên quan |
| `data_seal_identity` | `vector<u8>` | Seal identity của dataset |
| `council_root` | `vector<u8>` | Poseidon Merkle root (BN254, 32 bytes LE) |
| `threshold` | `u64` | Số YES tối thiểu để Approved |
| `total_voters` | `u64` | Tổng voter đã đăng ký |
| `voting_end` | `u64` | Deadline (millisecond timestamp) |
| `status` | `u8` | 0=Setup, 1=Voting, 2=Approved, 3=Rejected |
| `yes_count` | `u64` | Số phiếu YES |
| `no_count` | `u64` | Số phiếu NO |
| `nullifiers` | `VecSet<vector<u8>>` | Tập nullifier đã dùng (chống double-vote) |
| `pvk_*` | `vector<u8>` × 4 | Prepared Verifying Key (Groth16 BN254) |
| `title` | `vector<u8>` | Tiêu đề poll |
| `admin` | `address` | Admin tạo poll |

### 3.5 VoterIdentityRef

| Field | Type | Mô tả |
|-------|------|-------|
| `poll_id` | `ID` | Poll liên quan |
| `voter` | `address` | Địa chỉ ví voter |
| `walrus_blob_id` | `vector<u8>` | Walrus blob ID của encrypted identity.json |
| `seal_identity` | `vector<u8>` | Seal identity dùng để encrypt identity.json |

Lookup key: `VoterRefKey { poll_id, voter }`.

---

## 4. Luồng hoạt động

### 4.1 Poll creator flow (permissionless)

```
1. Deploy package
   → init() tạo Registry (shared) + AdminCap (owned by deployer)

2. Register dataset (permissionless)
   → data_asset::register(registry, walrus_blob_id, seal_identity, name)
   → emit DataAssetRegistered

3. Off-chain: gen identities + Merkle tree (WASM)
   → council_root, identity.json per voter

4. Off-chain: encrypt identity.json bằng Seal, upload Walrus
   → identity_blob_id, seal_identity per voter

5. Create poll (permissionless — caller trở thành poll admin)
   → governance::create_poll(registry, data_blob_id, data_seal_identity,
                              council_root, threshold, voting_end, vk_bytes, title)
   → vk_bytes: load từ public/zk-circuit/vk_bytes.bin (cố định, dùng chung)
   → emit PollCreated
   → Poll status = Setup

6. Register voters (chỉ poll admin)
   → governance::register_voter(registry, poll_id, voter, walrus_blob_id, seal_identity)
   → hoặc governance::register_voters(...) cho batch
   → emit VoterRegistered per voter

7. Start voting (chỉ poll admin)
   → governance::start_voting(registry, poll_id)
   → Poll status = Voting
```

### 4.2 Voter flow

```
1. Connect ví → query Registry để tìm VoterIdentityRef cho address mình

2. Download identity
   → Seal SDK requestKey(seal_identity) → key server gọi seal_approve_identity (dry-run)
   → Nếu pass: decrypt identity.json từ Walrus, lưu local

3. Vote
   → Dùng identity.json + circuit WASM để sinh Groth16 proof
   → zk_vote::submit_vote(registry, poll_id, proof_bytes, public_inputs_bytes,
                            nullifier, choice, clock)
   → On-chain: verify proof, check nullifier, update tally
   → emit VoteCast
```

### 4.3 Finalize flow

```
1. Sau deadline:
   → governance::finalize(registry, poll_id, clock)    # permissionless
   → hoặc governance::admin_finalize(registry, poll_id)  # poll admin, bất kỳ lúc nào

2. Kết quả:
   → yes_count >= threshold → status = Approved (2)
   → ngược lại              → status = Rejected (3)
   → emit PollFinalized
```

### 4.4 Data release flow

```
1. Poll status = Approved

2. Requester gọi Seal SDK requestKey(data_seal_identity)
   → key server gọi seal_approve_dataset (dry-run)
   → Check poll status == Approved → pass

3. Requester decrypt dataset từ Walrus bằng key nhận được
```

---

## 5. Module chi tiết

### 5.1 registry.move

Module trung tâm, sở hữu tất cả struct definitions.

**Public functions** (ai cũng gọi được):

| Function | Signature | Mô tả |
|----------|-----------|-------|
| `poll_id` | `(Poll): ID` | Lấy poll ID |
| `poll_status` | `(Poll): u8` | Lấy status |
| `poll_yes_count` | `(Poll): u64` | Số YES |
| `poll_no_count` | `(Poll): u64` | Số NO |
| `poll_threshold` | `(Poll): u64` | Threshold |
| `poll_voting_end` | `(Poll): u64` | Deadline |
| `poll_title` | `(Poll): vector<u8>` | Tiêu đề |
| `poll_total_voters` | `(Poll): u64` | Tổng voter |
| `poll_council_root` | `(Poll): vector<u8>` | Merkle root |
| `poll_admin` | `(Poll): address` | Admin address |
| `poll_nullifiers_contains` | `(Poll, vector<u8>): bool` | Check nullifier |
| `data_asset_blob_id` | `(DataAsset): vector<u8>` | Walrus blob ID |
| `data_asset_seal_identity` | `(DataAsset): vector<u8>` | Seal identity |
| `data_asset_owner` | `(DataAsset): address` | Owner |
| `data_asset_name` | `(DataAsset): vector<u8>` | Name |
| `voter_ref_walrus_blob_id` | `(VoterIdentityRef): vector<u8>` | Blob ID |
| `voter_ref_seal_identity` | `(VoterIdentityRef): vector<u8>` | Seal identity |

**public(package) functions** (chỉ modules trong package):

- `borrow_polls`, `borrow_polls_mut` — truy cập Table polls
- `borrow_data_assets`, `borrow_data_assets_mut` — truy cập Table data_assets
- `borrow_voter_refs`, `borrow_voter_refs_mut` — truy cập Table voter_refs
- `borrow_poll_ids`, `borrow_poll_ids_mut` — truy cập vector poll_ids
- `borrow_data_asset_ids`, `borrow_data_asset_ids_mut` — truy cập vector data_asset_ids
- `borrow_poll_voters`, `borrow_poll_voters_mut` — truy cập Table poll_voters
- `new_poll`, `new_data_asset`, `new_voter_ref_key`, `new_voter_identity_ref` — constructors
- `poll_set_status`, `poll_inc_yes`, `poll_inc_no`, `poll_insert_nullifier` — mutators
- `poll_pvk_*` — đọc 4 thành phần PVK
- `register_voter_ref` — đăng ký voter (assertion logic tập trung)
- `emit_*` — emit events
- `is_prefix`, `slice` — byte helpers

### 5.2 data_asset.move

| Function | Requires | Mô tả |
|----------|----------|-------|
| `register(registry, walrus_blob_id, seal_identity, name, ctx)` | — | Đăng ký dataset mới (permissionless) |
| `count(registry): u64` | — | Số lượng data assets |
| `id_at(registry, index): ID` | — | Asset ID theo index |
| `get(registry, asset_id): (blob_id, seal_identity, owner, name)` | — | Chi tiết asset |

### 5.3 governance.move

| Function | Requires | Mô tả |
|----------|----------|-------|
| `create_poll(registry, ...)` | — | Tạo poll mới (permissionless, caller = poll admin) |
| `register_voter(registry, poll_id, voter, blob_id, seal_id, ctx)` | Poll admin | Đăng ký 1 voter |
| `register_voters(registry, poll_id, voters, blob_ids, seal_ids, ctx)` | Poll admin | Batch đăng ký |
| `start_voting(registry, poll_id, ctx)` | Poll admin | Setup → Voting |
| `finalize(registry, poll_id, clock)` | — | Permissionless finalize (sau deadline) |
| `admin_finalize(registry, poll_id, ctx)` | Poll admin | Force finalize (bất kỳ lúc nào) |

> **Poll admin** = `ctx.sender() == poll.admin` (người tạo poll). Không cần AdminCap.

**Query functions:**

| Function | Return | Mô tả |
|----------|--------|-------|
| `poll_count(registry)` | `u64` | Tổng số polls |
| `poll_id_at(registry, index)` | `ID` | Poll ID theo index |
| `poll_status(registry, poll_id)` | `u8` | Status (0/1/2/3) |
| `poll_tally(registry, poll_id)` | `(u64, u64)` | (yes_count, no_count) |
| `poll_threshold(registry, poll_id)` | `u64` | Threshold |
| `poll_voting_end(registry, poll_id)` | `u64` | Deadline ms |
| `poll_title(registry, poll_id)` | `vector<u8>` | Tiêu đề |
| `poll_total_voters(registry, poll_id)` | `u64` | Tổng voter |
| `poll_council_root(registry, poll_id)` | `vector<u8>` | Merkle root |
| `poll_data_blob_id(registry, poll_id)` | `vector<u8>` | Dataset blob ID |
| `poll_data_seal_identity(registry, poll_id)` | `vector<u8>` | Dataset seal identity |
| `is_voter_registered(registry, poll_id, voter)` | `bool` | Voter đã đăng ký? |
| `get_voter_ref(registry, poll_id, voter)` | `(blob_id, seal_id)` | Identity ref |
| `poll_voter_list(registry, poll_id)` | `vector<address>` | Danh sách voter |

### 5.4 zk_vote.move

| Function | Requires | Mô tả |
|----------|----------|-------|
| `submit_vote(registry, poll_id, proof_bytes, public_inputs_bytes, nullifier, choice, clock)` | — | Submit vote + ZK proof |
| `is_nullifier_used(registry, poll_id, nullifier)` | — | Check nullifier |

**submit_vote validation order:**
1. Poll status == Voting
2. `clock.timestamp_ms() <= voting_end`
3. `choice` == 0 (NO) hoặc 1 (YES)
4. Nullifier chưa dùng
5. Merkle root trong public inputs == poll's `council_root`
6. Groth16 proof valid (BN254)

### 5.5 seal_policy.move

| Entry Function | Mô tả |
|----------------|-------|
| `seal_approve_identity(id, registry, ctx)` | Voter decrypt identity.json |
| `seal_approve_dataset(id, registry)` | Requester decrypt dataset sau Approved |

Cả hai đều là `entry` functions — chỉ gọi được qua transaction, không composable. Seal key server gọi chúng qua dry-run.

---

## 6. Error codes

| Code | Constant | Module(s) | Mô tả |
|------|----------|-----------|-------|
| 1 | `EPollNotVoting` | zk_vote, seal_policy | Poll không ở trạng thái Voting |
| 2 | `EPollExpired` | zk_vote | Đã quá deadline |
| 3 | `EPollNotExpired` | governance | Chưa hết deadline (finalize) |
| 4 | `EDuplicateNullifier` | zk_vote | Nullifier đã dùng (double-vote) |
| 5 | `EInvalidProof` | zk_vote | Groth16 proof không hợp lệ |
| 6 | `EInvalidMerkleRoot` | zk_vote | Merkle root không khớp council_root |
| 7 | `EPollAlreadyFinalized` | governance | Poll đã finalize rồi |
| 8 | `ENoAccess` | seal_policy | Caller không phải voter đã đăng ký |
| 9 | `EInvalidSealId` | seal_policy | Seal ID không bắt đầu bằng registry ID |
| 10 | `EPollNotApproved` | seal_policy | Poll chưa Approved (dataset release) |
| 11 | `EVoterAlreadyRegistered` | registry | Voter đã đăng ký cho poll này |
| 12 | `EInvalidChoice` | zk_vote | Choice không phải 0 hoặc 1 |
| 13 | `EPollNotFound` | registry | Poll ID không tồn tại |
| 14 | `ENotPollAdmin` | governance | Caller không phải poll admin |

---

## 7. Events

### PollCreated
```
{ poll_id: ID, title: vector<u8>, threshold: u64, voting_end: u64, admin: address }
```
Emit khi: `governance::create_poll`

### VoterRegistered
```
{ poll_id: ID, voter: address, walrus_blob_id: vector<u8> }
```
Emit khi: `governance::register_voter`

### VoteCast
```
{ poll_id: ID, nullifier: vector<u8>, choice: u8, yes_count: u64, no_count: u64 }
```
Emit khi: `zk_vote::submit_vote`

Lưu ý: `nullifier` là public (dùng để verify on-chain), nhưng không link được tới voter identity.

### PollFinalized
```
{ poll_id: ID, status: u8, yes_count: u64, no_count: u64 }
```
Emit khi: `governance::finalize` hoặc `governance::admin_finalize`

### DataAssetRegistered
```
{ asset_id: ID, owner: address, name: vector<u8> }
```
Emit khi: `data_asset::register`

---

## 8. Seal integration

### 8.1 Seal ID format

Cả hai entry functions dùng chung format cho tham số `id`:

```
id = registry_object_id (32 bytes) ++ poll_id (32 bytes)
```

- `registry_object_id`: Object ID của shared Registry, dùng làm prefix validation.
- `poll_id`: ID của poll liên quan.

### 8.2 seal_approve_identity

**Mục đích:** Cho phép voter decrypt identity.json của mình.

**Logic:**
1. Validate `id` bắt đầu bằng `registry.id`
2. Extract `poll_id` từ bytes 32..64
3. Check `VoterRefKey { poll_id, caller }` tồn tại trong `voter_refs`
4. Check poll status == Setup (0) hoặc Voting (1)

**Khi nào dùng:** Voter gọi Seal SDK `requestKey()` → key server dry-run function này.

### 8.3 seal_approve_dataset

**Mục đích:** Cho phép bất kỳ ai decrypt dataset sau khi poll Approved.

**Logic:**
1. Validate `id` bắt đầu bằng `registry.id`
2. Extract `poll_id` từ bytes 32..64
3. Check poll status == Approved (2)

**Khi nào dùng:** Requester gọi Seal SDK `requestKey()` sau khi poll finalize thành Approved.

### 8.4 Client-side Seal ID construction

```typescript
// TypeScript example
function buildSealId(registryId: string, pollId: string): Uint8Array {
  const registryBytes = fromHex(registryId);  // 32 bytes
  const pollBytes = fromHex(pollId);           // 32 bytes
  const id = new Uint8Array(64);
  id.set(registryBytes, 0);
  id.set(pollBytes, 32);
  return id;
}
```

---

## 9. ZK Circuit & vk_bytes

### 9.1 Circuit overview

File: `circuits/orcavote.circom`

Circuit kiểu Semaphore trên BN254, chứng minh 3 điều:
1. Voter biết `identity_secret` là leaf trong Merkle tree (membership)
2. `nullifier_hash` được derive deterministic từ secret + poll context (chống double-vote)
3. `signal_hash` commit vào vote choice (YES/NO)

```
┌──────────────────────────────────────────────────────────┐
│  OrcaVote Circuit (BN254, Groth16)                        │
│                                                           │
│  Private inputs:                                          │
│    identity_secret          ← từ identity.json            │
│    path_elements[20]        ← Merkle siblings             │
│    path_indices[20]         ← Merkle directions (0/1)     │
│                                                           │
│  Public inputs:                                           │
│    merkle_root              ← poll's council_root         │
│    nullifier_hash           ← Poseidon(secret, ext_null)  │
│    signal_hash              ← Poseidon(vote_choice)       │
│    external_nullifier       ← Poseidon(poll_id)           │
│                                                           │
│  Constraints: 5314                                        │
│  Tree depth: 20 (supports ~1M voters)                     │
│  Hash: Poseidon (circomlib)                               │
└──────────────────────────────────────────────────────────┘
```

### 9.2 Circuit logic

```
1. identity_commitment = Poseidon(identity_secret)
2. Merkle inclusion: recompute root from commitment + path
   → assert computed_root == merkle_root (public)
3. nullifier = Poseidon(identity_secret, external_nullifier)
   → assert computed_nullifier == nullifier_hash (public)
4. signal_hash² (constraint to bind signal_hash to circuit)
```

### 9.3 Build pipeline

Prerequisites: `circom` (Rust), `snarkjs` (npm)

```bash
cd circuits
npm install          # circomlib
make all             # compile → setup → export → copy to public/
```

Các bước chi tiết:

| Step | Command | Output |
|------|---------|--------|
| Compile | `circom orcavote.circom --r1cs --wasm --sym` | `build/orcavote.r1cs` + `build/orcavote_js/orcavote.wasm` |
| Download ptau | `curl ...powersOfTau28_hez_final_14.ptau` | `build/pot14_final.ptau` |
| Groth16 setup | `snarkjs groth16 setup` | `build/orcavote_0000.zkey` |
| Contribute | `snarkjs zkey contribute` | `build/orcavote_final.zkey` |
| Export VK | `snarkjs zkey export verificationkey` | `build/verification_key.json` |
| Export vk_bytes | `node export-vk-bytes.mjs` | `build/vk_bytes.bin` (384 bytes) |
| Copy | `cp ... public/zk-circuit/` | Browser-ready artifacts |

### 9.4 Browser artifacts

Sau `make all`, thư mục `public/zk-circuit/` chứa:

| File | Size | Mục đích |
|------|------|----------|
| `circuit.wasm` | ~2 MB | Witness calculator — snarkjs dùng trong browser để tính witness |
| `circuit_final.zkey` | ~3.2 MB | Proving key — snarkjs dùng để sinh proof |
| `verification_key.json` | ~3.5 KB | Human-readable VK (dùng cho debug/verify offline) |
| `vk_bytes.bin` | 384 bytes | Arkworks-serialized VK cho `governance::create_poll` |

Các file này là **static** — build 1 lần, ship cùng app, dùng chung cho tất cả polls.

### 9.5 vk_bytes — Verifying Key cho Sui contract

#### Định dạng

`vk_bytes` là Arkworks canonical compressed serialization của Groth16 verifying key (BN254):

```
┌─────────────────────────────────────────────────────┐
│  vk_bytes layout (384 bytes total)                   │
│                                                      │
│  [0..32]     alpha_g1      G1 compressed (32 bytes)  │
│  [32..96]    beta_g2       G2 compressed (64 bytes)  │
│  [96..160]   gamma_g2      G2 compressed (64 bytes)  │
│  [160..224]  delta_g2      G2 compressed (64 bytes)  │
│  [224..256]  IC[0]         G1 compressed (32 bytes)  │
│  [256..288]  IC[1]         G1 compressed (32 bytes)  │
│  [288..320]  IC[2]         G1 compressed (32 bytes)  │
│  [320..352]  IC[3]         G1 compressed (32 bytes)  │
│  [352..384]  IC[4]         G1 compressed (32 bytes)  │
└─────────────────────────────────────────────────────┘

IC points = nPublic + 1 = 4 + 1 = 5
Total = 32 + 64×3 + 32×5 = 384 bytes
```

#### Encoding rules

- **G1 compressed (32 bytes):** x-coordinate in little-endian. Bit 255 (MSB of byte 31) = 1 nếu y > P/2.
- **G2 compressed (64 bytes):** x = (c0, c1) trong Fp2. c0 (32 bytes LE) + c1 (32 bytes LE). Bit 255 (MSB of byte 63) = 1 nếu y.c1 > P/2.
- **P** = 21888242871839275222246405745257275088696311157297823662689037894645226208583 (BN254 base field)

#### Cách sử dụng

`vk_bytes` là tham số cố định khi tạo poll. Contract gọi:

```move
let curve = groth16::bn254();
let pvk = groth16::prepare_verifying_key(&curve, &vk_bytes);
```

Và lưu 4 thành phần PVK trong Poll struct để dùng khi verify vote.

#### Load trong TypeScript

```typescript
import { loadVkBytes } from './zk-prove'

// Load vk_bytes (cached after first call)
const vkBytes = await loadVkBytes()
// → Uint8Array(384) — ready for create_poll

// Trong transaction:
tx.moveCall({
  target: `${PACKAGE_ID}::governance::create_poll`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.pure.vector('u8', dataBlobId),
    tx.pure.vector('u8', dataSealIdentity),
    tx.pure.vector('u8', councilRoot),
    tx.pure.u64(threshold),
    tx.pure.u64(votingEndMs),
    tx.pure.vector('u8', Array.from(vkBytes)),  // ← vk_bytes
    tx.pure.vector('u8', titleBytes),
  ],
})
```

#### Tạo lại vk_bytes

Nếu cần rebuild (thay đổi circuit hoặc trusted setup):

```bash
cd circuits
make clean
make all    # compile → setup → export → copy
```

Script `export-vk-bytes.mjs` convert `verification_key.json` (snarkjs format) → `vk_bytes.bin` (Arkworks format).

### 9.6 Proof format (submit_vote)

#### Public inputs

4 public inputs, mỗi input 32 bytes LE, concatenated = 128 bytes:

| Offset | Field | Mô tả |
|--------|-------|-------|
| 0..32 | `merkle_root` | Poseidon Merkle root (BN254 scalar, LE) |
| 32..64 | `nullifier_hash` | `Poseidon(identity_secret, external_nullifier)` |
| 64..96 | `signal_hash` | `Poseidon(vote_choice)` — YES=1, NO=0 |
| 96..128 | `external_nullifier` | `Poseidon(poll_id)` — context cho nullifier |

#### Proof points

Arkworks compressed: A (G1, 32 bytes) + B (G2, 64 bytes) + C (G1, 32 bytes) = 128 bytes.

#### On-chain verification flow

```
submit_vote(registry, poll_id, proof_bytes, public_inputs_bytes, nullifier, choice, clock):
  1. Assert poll.status == Voting
  2. Assert clock <= voting_end
  3. Assert choice == 0 or 1
  4. Assert nullifier not in poll.nullifiers
  5. Extract merkle_root from public_inputs[0..32]
  6. Assert merkle_root == poll.council_root
  7. Reconstruct PVK from poll fields
  8. groth16::verify_groth16_proof(bn254(), pvk, public_inputs, proof)
  9. Assert proof valid
  10. Insert nullifier into VecSet
  11. Increment yes_count or no_count
```

#### Nullifier

- `nullifier` param (32 bytes) = `nullifier_hash` trong public inputs (bytes 32..64)
- Contract lưu nullifier vào `VecSet<vector<u8>>` để chống double-vote
- Client phải đảm bảo 2 giá trị này khớp nhau

### 9.7 Browser proof generation

File: `src/zk-prove.ts`

```typescript
import { generateProof, formatForSui, hashSignal, hashExternalNullifier } from './zk-prove'

// 1. Prepare inputs from identity.json
const signalHash = await hashSignal(1)              // 1 = YES
const extNullifier = await hashExternalNullifier(pollId)

// 2. Generate proof (snarkjs fullProve in browser)
const result = await generateProof({
  identity_secret: identity.identity_secret,         // from identity.json
  path_elements: identity.merkle_path.map(n => n.hash),
  path_indices: identity.merkle_path.map(n => parseInt(n.position)),
  merkle_root: identity.groth16_inputs.merkle_root_decimal,
  external_nullifier: extNullifier,
  signal_hash: signalHash,
})

// 3. Format for Sui contract
const { proofBytes, publicInputsBytes, nullifier } = formatForSui(result)

// 4. Submit vote transaction
tx.moveCall({
  target: `${PACKAGE_ID}::zk_vote::submit_vote`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.pure.id(pollId),
    tx.pure.vector('u8', Array.from(proofBytes)),
    tx.pure.vector('u8', Array.from(publicInputsBytes)),
    tx.pure.vector('u8', Array.from(nullifier)),
    tx.pure.u8(1),           // 1 = YES, 0 = NO
    tx.object('0x6'),        // Clock
  ],
})
```

### 9.8 Trusted setup notes

Hiện tại dùng **dev ceremony** (1 contribution). Cho production:

1. Dùng powers of tau từ Hermez ceremony (đã có sẵn, trusted)
2. Thêm nhiều contributions vào zkey (multi-party ceremony)
3. Verify zkey: `snarkjs zkey verify build/orcavote.r1cs build/pot14_final.ptau build/orcavote_final.zkey`

Nếu thay đổi circuit → phải rebuild toàn bộ pipeline và redeploy contract (vì vk_bytes thay đổi).

---

## 10. Hướng dẫn deploy

### 10.1 Prerequisites

```bash
# Sui CLI
sui --version

# Active environment
sui client active-env
sui client active-address
```

### 10.2 Build

```bash
cd move/orcavote
sui move build
```

### 10.3 Test

```bash
sui move test
```

### 10.4 Publish (testnet)

```bash
sui client switch --env testnet
sui client publish --gas-budget 100000000
```

Output sẽ chứa:
- **Package ID** — dùng cho tất cả function calls
- **Registry object ID** — shared object, dùng cho mọi transaction
- **AdminCap object ID** — owned object, dùng cho admin functions

Lưu lại cả 3 giá trị này.

### 10.5 Post-deploy verification

```bash
# Check Registry object
sui client object <REGISTRY_ID>

# Check AdminCap
sui client object <ADMIN_CAP_ID>
```

---

## 11. Client integration

### 11.1 Sui TypeScript SDK

```typescript
import { Transaction } from '@mysten/sui/transactions';
import { loadVkBytes } from './zk-prove';

const PACKAGE_ID = '0x5d53be76...';
const REGISTRY_ID = '0xa9d9a72b...';

// Register data asset (permissionless)
const tx = new Transaction();
tx.moveCall({
  target: `${PACKAGE_ID}::data_asset::register`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.pure.vector('u8', walrusBlobIdBytes),
    tx.pure.vector('u8', sealIdentityBytes),
    tx.pure.vector('u8', nameBytes),
  ],
});

// Create poll (permissionless — caller becomes poll admin)
const vkBytes = await loadVkBytes();
tx.moveCall({
  target: `${PACKAGE_ID}::governance::create_poll`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.pure.vector('u8', dataBlobId),
    tx.pure.vector('u8', dataSealIdentity),
    tx.pure.vector('u8', councilRoot),
    tx.pure.u64(threshold),
    tx.pure.u64(votingEndMs),
    tx.pure.vector('u8', Array.from(vkBytes)),
    tx.pure.vector('u8', titleBytes),
  ],
});

// Submit vote (no special permission needed)
tx.moveCall({
  target: `${PACKAGE_ID}::zk_vote::submit_vote`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.pure.id(pollId),
    tx.pure.vector('u8', Array.from(proofBytes)),
    tx.pure.vector('u8', Array.from(publicInputsBytes)),
    tx.pure.vector('u8', Array.from(nullifier)),
    tx.pure.u8(choice),  // 0=NO, 1=YES
    tx.object('0x6'),    // Clock shared object
  ],
});

// Finalize (permissionless, after deadline)
tx.moveCall({
  target: `${PACKAGE_ID}::governance::finalize`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.pure.id(pollId),
    tx.object('0x6'),
  ],
});
```

### 11.2 Query state (devInspect / read)

```typescript
// Read poll count
const result = await client.devInspectTransactionBlock({
  sender: '0x0',
  transactionBlock: (() => {
    const tx = new Transaction();
    tx.moveCall({
      target: `${PACKAGE_ID}::governance::poll_count`,
      arguments: [tx.object(REGISTRY_ID)],
    });
    return tx;
  })(),
});

// Read poll tally
tx.moveCall({
  target: `${PACKAGE_ID}::governance::poll_tally`,
  arguments: [tx.object(REGISTRY_ID), tx.pure.id(pollId)],
});

// Check voter registration
tx.moveCall({
  target: `${PACKAGE_ID}::governance::is_voter_registered`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.pure.id(pollId),
    tx.pure.address(voterAddress),
  ],
});
```

### 11.3 Event subscription

```typescript
// Subscribe to VoteCast events
client.subscribeEvent({
  filter: {
    MoveEventType: `${PACKAGE_ID}::registry::VoteCast`,
  },
  onMessage: (event) => {
    const { poll_id, nullifier, choice, yes_count, no_count } = event.parsedJson;
    console.log(`Vote cast: ${choice === 1 ? 'YES' : 'NO'}, tally: ${yes_count}/${no_count}`);
  },
});
```

---

## Appendix: Poll Status State Machine

```
  ┌───────┐   start_voting   ┌─────────┐
  │ Setup │ ───────────────→ │ Voting  │
  │  (0)  │   poll admin     │   (1)   │
  └───────┘                  └────┬────┘
                                  │
                    finalize / admin_finalize
                                  │
                    ┌─────────────┼─────────────┐
                    │                           │
                    ▼                           ▼
             ┌──────────┐               ┌──────────┐
             │ Approved │               │ Rejected │
             │   (2)    │               │   (3)    │
             └──────────┘               └──────────┘
          yes >= threshold            yes < threshold
```

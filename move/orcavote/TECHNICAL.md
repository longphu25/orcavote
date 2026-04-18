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
9. [ZK proof format](#9-zk-proof-format)
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

Owned object, transfer cho deployer lúc init. Ai giữ AdminCap mới gọi được các hàm admin.

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

### 4.1 Admin flow

```
1. Deploy package
   → init() tạo Registry (shared) + AdminCap (owned by deployer)

2. Register dataset
   → data_asset::register(registry, cap, walrus_blob_id, seal_identity, name)
   → emit DataAssetRegistered

3. Off-chain: gen identities + Merkle tree (WASM)
   → council_root, identity.json per voter

4. Off-chain: encrypt identity.json bằng Seal, upload Walrus
   → identity_blob_id, seal_identity per voter

5. Create poll
   → governance::create_poll(registry, cap, data_blob_id, data_seal_identity,
                              council_root, threshold, voting_end, vk_bytes, title)
   → emit PollCreated
   → Poll status = Setup

6. Register voters
   → governance::register_voter(registry, cap, poll_id, voter, walrus_blob_id, seal_identity)
   → hoặc governance::register_voters(...) cho batch
   → emit VoterRegistered per voter

7. Start voting
   → governance::start_voting(registry, cap, poll_id)
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
   → hoặc governance::admin_finalize(registry, cap, poll_id)  # admin, bất kỳ lúc nào

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
| `register(registry, cap, walrus_blob_id, seal_identity, name, ctx)` | AdminCap | Đăng ký dataset mới |
| `count(registry): u64` | — | Số lượng data assets |
| `id_at(registry, index): ID` | — | Asset ID theo index |
| `get(registry, asset_id): (blob_id, seal_identity, owner, name)` | — | Chi tiết asset |

### 5.3 governance.move

| Function | Requires | Mô tả |
|----------|----------|-------|
| `create_poll(registry, cap, ...)` | AdminCap | Tạo poll mới (Setup) |
| `register_voter(registry, cap, poll_id, voter, blob_id, seal_id)` | AdminCap | Đăng ký 1 voter |
| `register_voters(registry, cap, poll_id, voters, blob_ids, seal_ids)` | AdminCap | Batch đăng ký |
| `start_voting(registry, cap, poll_id)` | AdminCap | Setup → Voting |
| `finalize(registry, poll_id, clock)` | — | Permissionless finalize (sau deadline) |
| `admin_finalize(registry, cap, poll_id)` | AdminCap | Force finalize (bất kỳ lúc nào) |

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

## 9. ZK proof format

### 9.1 Circuit (Semaphore-style)

**Private inputs:**
- `identity_secret` — voter's secret (leaf of Merkle tree)
- `merkle_path` — siblings + indices

**Public inputs (3 × 32 bytes LE, concatenated = 96 bytes):**

| Offset | Field | Mô tả |
|--------|-------|-------|
| 0..32 | `merkle_root` | Poseidon Merkle root (BN254 scalar, LE) |
| 32..64 | `nullifier_hash` | `Poseidon(identity_secret, poll_context)` |
| 64..96 | `signal_hash` | `Poseidon(choice)` — YES=1, NO=0 |

### 9.2 Proof format

- **Curve:** BN254
- **Proof system:** Groth16
- **proof_bytes:** Arkworks canonical compressed serialization (A, B, C points)
- **public_inputs_bytes:** 96 bytes (3 scalars × 32 bytes LE)

### 9.3 Verifying key

Admin cung cấp `vk_bytes` khi tạo poll — đây là Arkworks canonical compressed serialization của verifying key. Contract gọi `groth16::prepare_verifying_key(bn254(), vk_bytes)` và lưu 4 thành phần PVK trong Poll.

### 9.4 On-chain verification

```
submit_vote:
  1. Extract merkle_root từ public_inputs[0..32]
  2. Assert merkle_root == poll.council_root
  3. Reconstruct PVK từ poll fields
  4. groth16::verify_groth16_proof(bn254(), pvk, public_inputs, proof)
  5. Assert proof valid
  6. Insert nullifier vào VecSet
  7. Increment yes_count hoặc no_count
```

### 9.5 Nullifier

- `nullifier` được pass riêng (ngoài `public_inputs_bytes`) để contract lưu vào `VecSet`.
- `nullifier_hash` trong public inputs (bytes 32..64) là giá trị mà circuit commit.
- Client phải đảm bảo `nullifier` param == `nullifier_hash` trong public inputs.

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

const PACKAGE_ID = '0x...';
const REGISTRY_ID = '0x...';
const ADMIN_CAP_ID = '0x...';

// Register data asset
const tx = new Transaction();
tx.moveCall({
  target: `${PACKAGE_ID}::data_asset::register`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.object(ADMIN_CAP_ID),
    tx.pure.vector('u8', walrusBlobIdBytes),
    tx.pure.vector('u8', sealIdentityBytes),
    tx.pure.vector('u8', nameBytes),
  ],
});

// Create poll
tx.moveCall({
  target: `${PACKAGE_ID}::governance::create_poll`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.object(ADMIN_CAP_ID),
    tx.pure.vector('u8', dataBlobId),
    tx.pure.vector('u8', dataSealIdentity),
    tx.pure.vector('u8', councilRoot),
    tx.pure.u64(threshold),
    tx.pure.u64(votingEndMs),
    tx.pure.vector('u8', vkBytes),
    tx.pure.vector('u8', titleBytes),
  ],
});

// Submit vote (no AdminCap needed)
tx.moveCall({
  target: `${PACKAGE_ID}::zk_vote::submit_vote`,
  arguments: [
    tx.object(REGISTRY_ID),
    tx.pure.id(pollId),
    tx.pure.vector('u8', proofBytes),
    tx.pure.vector('u8', publicInputsBytes),
    tx.pure.vector('u8', nullifier),
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
  │  (0)  │    AdminCap      │   (1)   │
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

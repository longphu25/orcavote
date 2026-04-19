# OrcaVote — On-Chain Architecture

## Package Structure

```
move/orcavote/sources/
├── registry.move       Core types, shared singleton, init
├── governance.move     Poll lifecycle management
├── zk_vote.move        ZK proof verification + tally
├── seal_policy.move    Seal encryption access control (3 policies)
└── data_asset.move     Encrypted dataset registration
```

---

## Registry (Shared Singleton)

```move
struct Registry has key {
    id: UID,
    polls:        Table<ID, Poll>,
    data_assets:  Table<ID, DataAsset>,
    voter_refs:   Table<VoterRefKey, VoterIdentityRef>,
    poll_ids:     vector<ID>,
    data_asset_ids: vector<ID>,
    poll_voters:  Table<ID, vector<address>>,
}
```

Tất cả state nằm trong 1 shared object. Mọi transaction đều tương tác qua Registry.

---

## Poll Lifecycle

```
                create_poll
    ┌──────────────────────────────┐
    │                              ▼
    │                         ┌─────────┐
    │                         │  Setup  │ status = 0
    │                         └────┬────┘
    │                              │ start_voting
    │                              ▼
    │                         ┌─────────┐
    │    register_voters ───► │ Voting  │ status = 1
    │    set_data_blob ──────►└────┬────┘
    │                              │
    │              ┌───────────────┼───────────────┐
    │              │ finalize      │               │ admin_finalize
    │              │ (after        │               │ (anytime)
    │              │  deadline)    │               │
    │              ▼               │               ▼
    │         ┌──────────┐        │          ┌──────────┐
    │         │ Approved │        │          │ Rejected │
    │         │ status=2 │        │          │ status=3 │
    │         └──────────┘        │          └──────────┘
    │              │               │
    │              ▼               │
    │    Dataset unlocked          │
    │    (seal_approve_dataset)    │
    └──────────────────────────────┘
```

### Status Constants

| Value | Label | Ý nghĩa |
|-------|-------|---------|
| 0 | Setup | Poll mới tạo, chưa bắt đầu vote |
| 1 | Voting | Đang nhận vote |
| 2 | Approved | yes_count >= threshold |
| 3 | Rejected | yes_count < threshold |

---

## Poll Struct

```move
struct Poll has store {
    poll_id: ID,
    data_blob_id: vector<u8>,          // Walrus blob ID (dataset)
    data_seal_identity: vector<u8>,    // Seal identity reference
    council_root: vector<u8>,          // Merkle root (LE, 32 bytes)
    threshold: u64,                    // Min YES votes for Approved
    total_voters: u64,                 // Registered voter count
    voting_end: u64,                   // Deadline (ms timestamp)
    status: u8,                        // 0-3
    yes_count: u64,
    no_count: u64,
    nullifiers: VecSet<vector<u8>>,    // Used nullifiers (prevent double-vote)
    pvk_vk_gamma_abc_g1: vector<u8>,   // Prepared verifying key part 1
    pvk_alpha_g1_beta_g2: vector<u8>,  // Prepared verifying key part 2
    pvk_gamma_g2_neg_pc: vector<u8>,   // Prepared verifying key part 3
    pvk_delta_g2_neg_pc: vector<u8>,   // Prepared verifying key part 4
    title: vector<u8>,                 // UTF-8 encoded title
    admin: address,                    // Poll creator
}
```

---

## Governance Functions

### create_poll

```move
public fun create_poll(
    registry: &mut Registry,
    data_blob_id: vector<u8>,
    data_seal_identity: vector<u8>,
    council_root: vector<u8>,
    threshold: u64,
    voting_end: u64,
    vk_bytes: vector<u8>,        // Arkworks VK → prepare_verifying_key
    title: vector<u8>,
    ctx: &mut TxContext,
): ID
```

Permissionless — ai cũng tạo được. Caller = admin.

### register_voters / register_voter

```move
public fun register_voters(
    registry, poll_id,
    voters: vector<address>,
    walrus_blob_ids: vector<vector<u8>>,
    seal_identities: vector<vector<u8>>,
    ctx,
)
```

Chỉ admin. Lưu mapping `(poll_id, voter) → VoterIdentityRef`.

### set_data_blob

```move
public fun set_data_blob(
    registry, poll_id,
    data_blob_id: vector<u8>,
    data_seal_identity: vector<u8>,
    ctx,
)
```

Chỉ admin. Update dataset blob reference sau khi Seal encrypt với poll identity.

### start_voting

```move
public fun start_voting(registry, poll_id, ctx)
```

Chỉ admin. Setup → Voting.

### finalize

```move
public fun finalize(registry, poll_id, clock)
```

Permissionless. Yêu cầu: `clock.timestamp_ms() > voting_end`.

### admin_finalize

```move
public fun admin_finalize(registry, poll_id, ctx)
```

Chỉ admin. Có thể gọi bất cứ lúc nào (early termination).

---

## ZK Vote

### submit_vote

```move
public fun submit_vote(
    registry, poll_id,
    proof_bytes: vector<u8>,           // 128 bytes Arkworks
    public_inputs_bytes: vector<u8>,   // 128 bytes (4 × 32 LE)
    nullifier: vector<u8>,             // 32 bytes LE
    choice: u8,                        // 0=NO, 1=YES
    clock: &Clock,
)
```

Verification order:
1. `status == Voting` → else abort 1
2. `clock <= voting_end` → else abort 2
3. `choice == 0 || choice == 1` → else abort 12
4. `nullifier not in nullifiers` → else abort 4 (double-vote)
5. `public_inputs[0..32] == council_root` → else abort 6 (root mismatch)
6. `groth16::verify_groth16_proof(...)` → else abort 5 (invalid proof)

### Error Codes

| Code | Constant | Ý nghĩa |
|------|----------|---------|
| 1 | EPollNotVoting | Poll không ở trạng thái Voting |
| 2 | EPollExpired | Đã quá deadline |
| 4 | EDuplicateNullifier | Voter đã vote rồi |
| 5 | EInvalidProof | Groth16 proof không hợp lệ |
| 6 | EInvalidMerkleRoot | Root trong proof ≠ council_root on-chain |
| 12 | EInvalidChoice | Choice không phải 0 hoặc 1 |

---

## Seal Policies

Tất cả nằm trong `seal_policy.move`. Seal key servers gọi các function này qua dry-run.

### seal_approve_data_asset (owner-only)

```move
entry fun seal_approve_data_asset(
    id: vector<u8>,       // registry_id(32) ++ owner_address(32)
    registry: &Registry,
    ctx: &TxContext,
)
```

Check: `sender == owner_address` (extracted từ id bytes 32..64).

Dùng cho: Data Asset tab — owner encrypt/decrypt file cá nhân.

### seal_approve_dataset (post-approval, anyone)

```move
entry fun seal_approve_dataset(
    id: vector<u8>,       // registry_id(32) ++ poll_id(32)
    registry: &Registry,
)
```

Check: `poll.status == Approved`.

Dùng cho: Decrypt dataset sau khi poll được approve. Ai cũng decrypt được.

### seal_approve_identity (voter-only)

```move
entry fun seal_approve_identity(
    id: vector<u8>,       // registry_id(32) ++ poll_id(32)
    registry: &Registry,
    ctx: &TxContext,
)
```

Check: sender là registered voter + poll status == Setup hoặc Voting.

Dùng cho: Voter decrypt identity blob của mình (hiện tại không dùng vì identity upload plaintext).

### Seal ID Format

Tất cả Seal IDs có prefix = `registry_object_id` (32 bytes). Đảm bảo:
- Seal key servers chỉ approve cho đúng Registry instance
- Không thể dùng ID từ Registry khác

---

## Data Asset

### register

```move
public fun register(
    registry, walrus_blob_id, seal_identity, name, ctx,
)
```

Permissionless. Lưu metadata dataset on-chain.

---

## Query Functions (devInspect)

Frontend gọi qua `devInspectTransactionBlock` (read-only, không cần gas):

| Function | Returns |
|----------|---------|
| `poll_count(registry)` | u64 |
| `poll_id_at(registry, index)` | ID |
| `poll_status(registry, poll_id)` | u8 |
| `poll_tally(registry, poll_id)` | (u64, u64) — yes, no |
| `poll_threshold(registry, poll_id)` | u64 |
| `poll_voting_end(registry, poll_id)` | u64 |
| `poll_title(registry, poll_id)` | vector<u8> |
| `poll_total_voters(registry, poll_id)` | u64 |
| `poll_data_blob_id(registry, poll_id)` | vector<u8> |
| `poll_voter_list(registry, poll_id)` | vector<address> |
| `is_voter_registered(registry, poll_id, voter)` | bool |
| `get_voter_ref(registry, poll_id, voter)` | (vector<u8>, vector<u8>) |

---

## Events

| Event | Fields | Khi nào |
|-------|--------|---------|
| PollCreated | poll_id, title, threshold, voting_end, admin | create_poll |
| VoterRegistered | poll_id, voter, walrus_blob_id | register_voter(s) |
| VoteCast | poll_id, nullifier, choice, yes_count, no_count | submit_vote |
| PollFinalized | poll_id, status, yes_count, no_count | finalize / admin_finalize |
| DataAssetRegistered | asset_id, owner, name | data_asset::register |

Frontend dùng `queryEvents(MoveEventType: PollCreated)` để list tất cả polls.

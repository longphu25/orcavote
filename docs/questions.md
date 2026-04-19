# OrcaVote — Câu hỏi thường gặp

## 1. Merkle Tree là gì?

Merkle Tree trong OrcaVote là cây hash Poseidon dùng để chứng minh "tôi là thành viên hợp lệ" mà không lộ mình là ai.

Mỗi voter có 1 leaf = `commitment = Poseidon(identity_nullifier, identity_secret)`. Tất cả commitments xếp thành cây nhị phân, hash từ dưới lên → ra 1 root duy nhất. Root này lưu on-chain trong Poll struct.

Khi vote, voter chứng minh "commitment của tôi nằm trong cây" bằng cách cung cấp path (10 sibling hashes). ZK proof verify path đúng mà không lộ vị trí leaf → không ai biết voter là ai trong danh sách.

```
           root (lưu on-chain)
          /                   \
        h01                   h23
       /    \                /    \
     c0      c1            c2     0     ← zero-padded
   voter0   voter1       voter2
```

- Tree depth = 10 → hỗ trợ tối đa 1024 voters
- Vị trí trống được pad bằng zero hash
- Hash function: Poseidon (BN254-friendly, hiệu quả trong ZK circuit)
- Root là "fingerprint" của toàn bộ danh sách voters — thay đổi 1 voter → root khác hoàn toàn

---

## 2. Identity Blobs là gì? Ví dùng như thế nào?

Identity Blob là file JSON chứa "chìa khóa bí mật" của mỗi voter, được tạo khi build Merkle tree:

```json
{
  "identity_secret": "1441ae57...",      // random 32 bytes — input chính cho ZK proof
  "identity_nullifier": "09ef46f4...",   // random 32 bytes — tạo nullifier chống double-vote
  "identity_commitment": "09704b7e...",  // Poseidon(nullifier, secret) — leaf trong tree
  "address": "0x3411...",                // Sui wallet address của voter
  "leaf_index": 0                        // vị trí trong Merkle tree
}
```

**Flow khi ví dùng:**

1. **Poll creator** tạo identity blob cho mỗi voter (WASM) → upload lên Walrus → on-chain lưu mapping:
   ```
   (poll_id, voter_address) → walrus_blob_id
   ```

2. **Khi voter mở poll**, app tự động:
   - Gọi on-chain `get_voter_ref(poll_id, my_address)` → lấy `walrus_blob_id`
   - Fetch blob từ Walrus aggregator → parse JSON
   - Dùng `identity_secret` + `identity_nullifier` để generate ZK proof

3. **Voter không cần biết blob ở đâu** — app tự tìm dựa trên on-chain mapping

**Tại sao upload plaintext?**
Identity blob upload dạng plaintext vì `poll_id` chưa tồn tại lúc upload (poll chưa tạo). Bảo mật vẫn đảm bảo vì: dù ai đọc được blob, họ không thể vote thay bạn — transaction cần wallet signature.

---

## 3. snarkjs là gì? Làm sao tạo ZK proof?

**snarkjs** là thư viện JavaScript/TypeScript cho Groth16 zero-knowledge proof system. Chạy hoàn toàn trong browser, không cần server.

### Tạo proof gồm 2 giai đoạn:

**Giai đoạn 1 — Build circuit (1 lần duy nhất, offline):**

```bash
# 1. Viết circuit bằng Circom
circuits/orcavote.circom    # 2911 constraints, BN254

# 2. Compile
circom orcavote.circom --wasm --r1cs
# → circuit.wasm (witness calculator, ~2 MB)
# → circuit.r1cs (constraint system)

# 3. Trusted setup (Powers of Tau + phase 2)
snarkjs groth16 setup circuit.r1cs pot14.ptau circuit_0000.zkey
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey
# → circuit_final.zkey (proving key, ~1.7 MB)

# 4. Export verifying key
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
node export-vk-bytes.mjs  # → vk_bytes.bin (392 bytes, Arkworks format cho Move)
```

**Giai đoạn 2 — Generate proof (mỗi lần vote, trong browser, ~3 giây):**

```javascript
const { proof, publicSignals } = await snarkjs.groth16.fullProve(
  {
    // Private inputs (chỉ voter biết, KHÔNG lên chain)
    identity_secret: "...",
    identity_nullifier: "...",
    path_elements: [...],       // 10 sibling hashes từ Merkle tree
    path_indices: [...],        // 10 bits (0=left, 1=right)

    // Public inputs (lên chain, ai cũng thấy)
    merkle_root: "...",         // root của tree — phải match on-chain
    nullifier_hash: "...",      // Poseidon(secret, ext_nullifier) — chống double-vote
    signal_hash: "...",         // Poseidon(choice) — ẩn YES/NO
    external_nullifier: "...",  // Poseidon(poll_id) — scope theo poll
  },
  "circuit.wasm",               // witness calculator (~2 MB, cached)
  "circuit_final.zkey",         // proving key (~1.7 MB, cached)
)
```

**Output:**
- `proof`: 3 elliptic curve points (A, B, C) → 128 bytes sau khi encode Arkworks
- `publicSignals`: 4 scalar values → 128 bytes (4 × 32 bytes LE)

---

## 4. Khi ký sẽ truyền cái gì lên?

Transaction `submit_vote` gửi lên chain **6 arguments** (không có `choice`!):

| # | Argument | Size | Nội dung |
|---|----------|------|----------|
| 0 | Registry | object | Shared singleton chứa tất cả polls |
| 1 | poll_id | 32 bytes | ID của poll đang vote |
| 2 | proof_bytes | 128 bytes | Groth16 proof: A(G1, 32B) + B(G2, 64B) + C(G1, 32B) |
| 3 | public_inputs_bytes | 128 bytes | 4 × 32 bytes LE (xem bảng dưới) |
| 4 | nullifier | 32 bytes | Hash duy nhất per voter per poll |
| 5 | Clock | object | Sui system clock (check deadline) |

**Layout của public_inputs_bytes (128 bytes):**

| Offset | Field | Ý nghĩa |
|--------|-------|---------|
| 0–31 | merkle_root | Root của Merkle tree — phải match on-chain `council_root` |
| 32–63 | nullifier_hash | Hash chống double-vote |
| 64–95 | signal_hash | **Poseidon(choice)** — ẩn YES/NO bên trong |
| 96–127 | external_nullifier | Poseidon(poll_id) — scope nullifier theo poll |

**Tại sao không có `choice` parameter?**
Choice ẩn trong `signal_hash` (bytes 64–95). Contract so sánh signal_hash với 2 hằng số precomputed:
- `Poseidon(0)` = NO
- `Poseidon(1)` = YES

Ai xem transaction trên SuiScan chỉ thấy proof bytes + public inputs bytes — không biết voter chọn gì.

---

## 5. Client-side vs On-chain — ai làm gì?

### Client-side (browser — không cần server):

| Thao tác | Công cụ | Khi nào |
|----------|---------|---------|
| Build Merkle tree | WASM (`zk_merkle_wasm`) | Tạo poll |
| Upload identity blobs | Walrus Publisher API | Tạo poll |
| Seal encrypt dataset | `@mysten/seal` SDK | Tạo poll (sau khi có poll_id) |
| Fetch identity blob | Walrus Aggregator | Khi vote |
| Fetch tất cả voters' blobs | Walrus Aggregator | Khi vote (rebuild tree) |
| Rebuild Merkle tree | `poseidon-lite` (JS) | Khi vote |
| Generate ZK proof | `snarkjs` (~3 giây) | Khi vote |
| Format proof → Arkworks | `formatForSui()` | Khi vote |
| Ký transaction | Sui wallet (dapp-kit) | Khi vote |
| Seal decrypt dataset | `@mysten/seal` SDK | Sau khi poll Approved |

### On-chain (Sui Move contract — verify + state update):

| Thao tác | Module | Verify bằng gì |
|----------|--------|----------------|
| Check poll status == Voting | `zk_vote` | `assert!(status == 1)` |
| Check deadline chưa hết | `zk_vote` | `assert!(clock <= voting_end)` |
| Check chưa vote (double-vote) | `zk_vote` | `assert!(!nullifiers.contains(nullifier))` |
| Check Merkle root khớp | `zk_vote` | `assert!(public_inputs[0..32] == council_root)` |
| Extract choice từ signal_hash | `zk_vote` | So sánh bytes 64–95 với `SIGNAL_HASH_YES` / `SIGNAL_HASH_NO` |
| **Verify ZK proof** | `zk_vote` | **`sui::groth16::verify_groth16_proof(bn254(), pvk, inputs, proof)`** |
| Update tally (YES/NO count) | `zk_vote` | `poll_inc_yes()` hoặc `poll_inc_no()` |
| Lưu nullifier | `zk_vote` | `poll_insert_nullifier(nullifier)` |
| Emit event (không có choice) | `zk_vote` | `VoteCast { nullifier, yes_count, no_count }` |

### Verify on-chain bằng gì?

**`sui::groth16`** — module native của Sui blockchain, hỗ trợ:
- Đường cong BN254 (bn254 pairing)
- `prepare_verifying_key()` — chuẩn bị VK từ Arkworks bytes (gọi 1 lần khi `create_poll`)
- `verify_groth16_proof()` — verify proof với prepared VK + public inputs (gọi mỗi lần vote)

Đây là Sui built-in, không cần thư viện bên ngoài. Verify nhanh, gas thấp (~0.01 SUI per vote).

Prepared verifying key (4 parts) được lưu trong Poll struct từ lúc `create_poll`:
```move
pvk_vk_gamma_abc_g1: vector<u8>,
pvk_alpha_g1_beta_g2: vector<u8>,
pvk_gamma_g2_neg_pc: vector<u8>,
pvk_delta_g2_neg_pc: vector<u8>,
```

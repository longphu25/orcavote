# OrcaVote — Presentation Script

> Thời lượng: 10–15 phút
> Format: Demo-driven, giải thích kỹ thuật xen kẽ demo live

---

## Slide 1: Opening (1 phút)

Xin chào mọi người. Hôm nay mình sẽ trình bày **OrcaVote** — một protocol trên Sui blockchain cho phép **bỏ phiếu ẩn danh để mở khóa dữ liệu nhạy cảm**.

Tagline của dự án: **"Vote-to-unlock private data."**

Hãy tưởng tượng: một DAO có bộ dữ liệu doanh thu quý — dữ liệu này nhạy cảm, không thể public. Nhưng đối tác muốn xem để đánh giá hợp tác. Thay vì 1 người quyết định, cả hội đồng bỏ phiếu. Nếu đủ phiếu đồng ý → dữ liệu tự động được mở khóa. Không ai biết ai vote YES, ai vote NO.

Đó là OrcaVote.

---

## Slide 2: Vấn đề (1 phút)

Hiện tại, việc chia sẻ dữ liệu nhạy cảm trong Web3 gặp 3 vấn đề:

**1. Không có governance cho data access**
Dữ liệu hoặc public hoàn toàn, hoặc locked hoàn toàn. Không có cơ chế "mở khóa có điều kiện" dựa trên quyết định tập thể.

**2. Voting không ẩn danh**
Hầu hết hệ thống voting on-chain đều lộ ai vote gì. Điều này tạo áp lực xã hội, bỏ phiếu theo đám đông, hoặc bị mua chuộc.

**3. Data release không trustless**
Sau khi vote xong, ai đó vẫn phải manually gửi dữ liệu. Không có cơ chế tự động, verifiable.

---

## Slide 3: Giải pháp — OrcaVote (2 phút)

OrcaVote giải quyết cả 3 vấn đề bằng cách kết hợp 3 công nghệ trên Sui:

**ZK Proof (Groth16)** — Bỏ phiếu ẩn danh. Voter chứng minh "tôi là thành viên hợp lệ" mà không tiết lộ mình là ai. Không ai biết bạn vote YES hay NO.

**Seal Encryption** — Dữ liệu luôn được mã hóa. Chỉ khi poll Approved, Seal key server mới cấp key giải mã. Hoàn toàn tự động, không cần trust bên thứ 3.

**Walrus Storage** — Dữ liệu mã hóa được lưu trữ phi tập trung trên Walrus. Không ai có thể xóa hay thay đổi.

Flow tổng quan:

```
Encrypt dataset → Upload Walrus → Tạo poll on-chain
→ Voters bỏ phiếu ẩn danh (ZK proof)
→ Đủ phiếu → Approved → Dataset tự động unlock
```

---

## Slide 4: Architecture (2 phút)

*[Hiện sơ đồ architecture]*

Hệ thống gồm 4 layer:

**Layer 1 — Off-chain: ZK Circuit**
- Circuit Groth16 trên BN254, kiểu Semaphore
- Poseidon Merkle tree depth 10 (hỗ trợ 1024 voters)
- Proof generation trong browser (~3 giây)

**Layer 2 — Off-chain: Seal + Walrus**
- Dataset encrypted bằng Seal, lưu trên Walrus
- Identity blobs cho mỗi voter cũng lưu trên Walrus
- 3 Seal policies: data asset (owner), dataset (post-approval), identity (voter)

**Layer 3 — On-chain: Move Smart Contracts**
- 5 modules: registry, governance, zk_vote, seal_policy, data_asset
- Groth16 proof verification on-chain
- Nullifier dedup ngăn double-vote
- Poll lifecycle: Setup → Voting → Approved/Rejected

**Layer 4 — Frontend: React + Vite**
- 3 tabs: Data Asset, Tạo Poll, Polls
- Wallet connect via @mysten/dapp-kit
- ZK proof generation via snarkjs trong browser

---

## Slide 5: Demo — Tạo Poll (3 phút)

*[Chuyển sang demo live]*

Mình sẽ demo full flow. Đầu tiên, connect wallet.

**Bước 1: Upload Dataset**
- Vào tab Data Asset
- Chọn file → hiện cost estimate (WAL)
- Click "Seal Encrypt & Upload to Walrus"
- File được Seal encrypt → upload lên Walrus → blob thuộc wallet

**Bước 2: Build Merkle Tree**
- Vào tab Tạo Poll
- Nhập 3 wallet addresses của voters
- Click "Build Merkle Tree"
- WASM tạo identity cho mỗi voter + Poseidon Merkle root

**Bước 3: Upload Identity Blobs**
- Click "Upload All" → mỗi identity blob upload lên Walrus
- On-chain sẽ lưu mapping: voter address → blob ID

**Bước 4: Create Poll**
- Chọn dataset blob đã upload
- Set threshold = 2 (cần 2/3 YES)
- Set deadline
- Click "Create Poll" → 1 transaction: create + register voters + start voting

**Bước 5: Seal Encrypt Dataset cho Poll**
- Sau khi tạo poll, hiện nút "Seal Encrypt & Upload Dataset"
- App decrypt blob cũ (owner key) → encrypt lại cho poll (poll key) → upload blob mới → update on-chain
- Bước này đảm bảo: sau khi Approved, AI CŨNG decrypt được dataset

---

## Slide 6: Demo — Vote (2 phút)

*[Chuyển sang wallet voter]*

Giờ mình switch sang wallet của voter.

**Bước 1:** Vào tab Polls → thấy poll vừa tạo → click vào

**Bước 2:** App tự kiểm tra wallet có phải registered voter không

**Bước 3:** Chọn YES → Click "Submit Anonymous Vote"

Phía sau, app thực hiện 4 bước tự động:
1. Fetch identity blob từ Walrus (dựa trên on-chain mapping)
2. Fetch TẤT CẢ voters' blobs → rebuild Merkle tree
3. Generate Groth16 ZK proof trong browser (~3 giây)
4. Submit proof + nullifier + choice on-chain

On-chain contract:
- Verify Groth16 proof → voter hợp lệ
- Check nullifier → chưa vote
- Update tally: yes_count + 1

Quan trọng: **on-chain chỉ thấy nullifier hash + tổng YES/NO. Không biết voter nào chọn gì.**

---

## Slide 7: Demo — Finalize & Decrypt (2 phút)

Sau khi đủ phiếu (2/3 YES):

**Finalize:** Ai cũng có thể gọi Finalize sau deadline. Hoặc admin gọi sớm.
- yes_count >= threshold → **Approved**

**Decrypt Dataset:**
- Hiện section "Shared Dataset" với nút "Decrypt Dataset"
- Click → Seal key server verify on-chain: poll status == Approved → trả key
- App decrypt → hiển thị nội dung file gốc
- Download file plaintext

Đây là điểm mấu chốt: **dữ liệu chỉ được mở khóa khi governance đồng ý, hoàn toàn tự động, không cần trust ai.**

---

## Slide 8: ZK Proof — Tại sao ẩn danh? (2 phút)

*[Hiện sơ đồ circuit]*

Nhiều người hỏi: "Voter ký transaction bằng wallet, sao mà ẩn danh?"

Câu trả lời: **biết ai đã vote, nhưng KHÔNG biết vote gì.**

ZK proof chứng minh 3 điều:
1. "Tôi là thành viên hợp lệ" (Merkle membership) — mà không lộ mình ở vị trí nào trong tree
2. "Tôi chưa vote" (nullifier) — nullifier là hash 1 chiều, không reverse ra address
3. "Tôi commit vào lựa chọn này" (signal) — proof chỉ valid cho đúng YES hoặc NO đã chọn

On-chain chỉ lưu: nullifier hash + tổng YES/NO count. Không có mapping nullifier → address.

---

## Slide 9: Seal Policies (1 phút)

OrcaVote dùng 3 Seal policies, tất cả trong 1 package:

| Policy | Ai decrypt? | Khi nào? |
|--------|------------|----------|
| `seal_approve_data_asset` | Chỉ owner | Bất cứ lúc nào |
| `seal_approve_dataset` | Ai cũng được | Sau khi poll Approved |
| `seal_approve_identity` | Chỉ voter đã đăng ký | Khi poll đang Voting |

Seal key server gọi dry-run các function này trên full node. Nếu function không abort → cấp key. Hoàn toàn on-chain verifiable.

---

## Slide 10: Tech Stack (30 giây)

| Component | Technology |
|-----------|-----------|
| Blockchain | Sui (Move) |
| ZK Circuit | Circom + Groth16 (BN254) |
| Hash | Poseidon (BN254-friendly) |
| Encryption | Seal (threshold encryption) |
| Storage | Walrus (decentralized blob store) |
| Frontend | React + Vite + @mysten/dapp-kit |
| Proof in browser | snarkjs + poseidon-lite |

---

## Slide 11: Challenges & Lessons (1 phút)

Trong quá trình build, mình gặp và fix 11 bugs. Một số đáng chú ý:

**Double encryption:** Dataset bị encrypt 2 lần — Seal decrypt chỉ bóc 1 lớp → output vẫn là ciphertext. Fix: detect + decrypt lớp đầu trước khi re-encrypt.

**Merkle root mismatch:** Vote handler chỉ dùng 1 commitment thay vì tất cả → root khác → proof fail. Fix: fetch tất cả voters' blobs, rebuild full tree.

**Seal identity mismatch:** Encrypt dùng package A + id X, decrypt dùng package B + id Y → key khác → garbage. Fix: unify tất cả Seal operations dưới 1 package.

Bài học: **Seal encrypt/decrypt PHẢI dùng cùng package + cùng id. Không có ngoại lệ.**

---

## Slide 12: Use Cases (30 giây)

- **DAO Governance:** Vote để release báo cáo tài chính cho đối tác
- **Healthcare:** Hội đồng y khoa vote để chia sẻ dữ liệu nghiên cứu
- **AI/ML:** Vote để release training dataset cho researcher
- **Audit:** Vote để cấp quyền truy cập log hệ thống cho auditor
- **Legal:** Vote để release tài liệu pháp lý trong tranh chấp

---

## Slide 13: Closing (30 giây)

OrcaVote chứng minh rằng trên Sui, chúng ta có thể xây dựng hệ thống governance hoàn chỉnh:
- **Ẩn danh** nhờ ZK proof
- **Trustless** nhờ on-chain verification
- **Tự động** nhờ Seal encryption policies

Dữ liệu chỉ được mở khóa khi tập thể đồng ý. Không ai có thể bypass. Không ai biết bạn vote gì.

**Vote-to-unlock private data.**

Cảm ơn mọi người. Mình sẵn sàng nhận câu hỏi.

---

## Q&A — Câu hỏi thường gặp

**Q: Nếu chỉ có 3 voters, có thể suy ra ai vote gì không?**
A: Biết ai đã vote (transaction public), nhưng không biết vote gì. Tuy nhiên với ít voters + realtime tally, có thể suy luận theo thứ tự. Giải pháp production: chỉ reveal tally sau deadline.

**Q: Identity blob upload plaintext, có an toàn không?**
A: Identity secret chỉ dùng locally để generate ZK proof. Dù ai đọc được blob, họ không thể vote thay bạn vì transaction cần wallet signature.

**Q: Seal key server có phải trusted third party không?**
A: Seal dùng threshold encryption — cần nhiều key servers đồng ý. Mỗi server chỉ dry-run Move function on-chain để verify. Không server nào có toàn quyền.

**Q: Gas cost cho 1 vote?**
A: Groth16 verify on-chain ~0.01 SUI. Rất rẻ nhờ Sui native support cho BN254 pairing.

**Q: Có thể scale lên bao nhiêu voters?**
A: Circuit hiện tại depth 10 = 1024 voters. Tăng lên depth 20 = 1M voters, nhưng proof generation chậm hơn (~10-15 giây trong browser).

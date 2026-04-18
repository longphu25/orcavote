# OrcaVote PRD

## 1. Overview

**Tên sản phẩm:** OrcaVote  
**Tagline:** Vote-to-unlock private data.

OrcaVote là một protocol trên Sui giúp **release dữ liệu nhạy cảm** (dataset, log, báo cáo, AI training data…) chỉ khi một nhóm stakeholder bỏ phiếu đồng ý. Dữ liệu luôn được mã hóa bằng **Seal** và lưu trên **Walrus**, còn logic bỏ phiếu, tally, và điều kiện release được thực thi on-chain bằng Move.

Trong phiên bản cập nhật:

- **Admin** tạo poll và danh sách ví voter, kèm `blob_id` của dataset đã được mã hóa bằng Seal (ciphertext nằm trên Walrus).  
- `identity.json` cho mỗi voter được sinh **off-chain** bằng wasm (`zk_merkle_wasm_bg.wasm`) dựa trên Merkle tree ZK, sau đó được **mã hóa bằng Seal** và upload lên Walrus dưới dạng ciphertext.  
- Trên Sui lưu metadata `VoterIdentityRef` để allowlist: chỉ đúng ví voter mới có thể request key từ Seal để giải mã blob identity.json tương ứng.  
- Khi voter connect ví vào UI, họ có thể tải xuống và giải mã `identity.json` của mình, lưu local, dùng để sinh ZK proof và ký vote.

MVP tập trung vào:

- Ẩn danh voter (không lộ identity, không link được ví → vote).  
- Deterministic on-chain tally.  
- Policy‑driven data release thông qua Seal + Walrus.

---

## 2. Goals & Non‑Goals

### Goals (MVP)

1. **Data luôn được bảo vệ**: chỉ tồn tại ở dạng ciphertext trên Walrus; on-chain chỉ lưu metadata.  
2. **Data release có governance**: mọi truy cập dataset phải đi qua một vòng vote được định nghĩa on-chain (threshold YES/NO, deadline).  
3. **Anonymous voting**: mỗi phiếu là một ZK proof chứng minh membership & non‑double‑vote, không lộ identity.  
4. **On-chain tally**: kết quả được đếm và lưu trực tiếp trên Sui, code minh bạch.  
5. **Hackable trong 2–3 ngày**: chỉ 1–2 dataset demo, 1 nhóm voter tĩnh, 1 loại poll đơn giản (YES/NO).

### Non‑Goals (MVP)

- Không hỗ trợ group voter động (join/leave) on-chain, chỉ group tĩnh tạo off-chain.  
- Không xây full MACI (anti‑collusion, re‑voting), chỉ anonymous voting + non‑double‑vote.  
- Không build UI phức tạp cho admin upload file trực tiếp lên Walrus/Seal (có thể dùng CLI).  
- Không thiết kế policy Seal hoàn toàn generic, chỉ 1–2 pattern release cơ bản.

---

## 3. Personas

1. **Data Owner / Provider**  
   - Tổ chức sở hữu dataset (báo cáo doanh thu, log hệ thống, medical dataset…).  
   - Encrypt + upload dataset, đăng ký lên OrcaVote.

2. **Requester**  
   - Bên muốn truy cập dataset (đối tác, auditor, DAO, nhà nghiên cứu…).  
   - Tạo `AccessRequest`, chờ hội đồng bỏ phiếu.

3. **Data Council Member (Voter)**  
   - Thành viên hội đồng có quyền vote YES/NO cho mỗi request.  
   - Có ví Sui và ZK identity tương ứng với poll, tải `identity.json` của mình qua Seal + Walrus, sau đó cast vote qua OrcaVote UI.

4. **Observer / Community**  
   - Đọc trạng thái các request, kết quả vote; không xem được phiếu cá nhân.

---

## 4. Core Use Case MVP

**Scenario:**  
DAO có dataset `Q1_Revenue_By_Region` đã encrypt bằng Seal và lưu trên Walrus. Đối tác X muốn truy cập dataset này để đánh giá hợp tác:

1. Data Owner cung cấp `blob_id` dataset cho admin OrcaVote.  
2. Admin tạo poll mới với `blob_id`, `seal_identity` của dataset và danh sách ví Data Council.  
3. Hệ thống tạo `identity.json` cho từng ví voter bằng wasm, mã hóa mỗi file bằng Seal, upload Walrus, tạo `VoterIdentityRef` on-chain.  
4. Requester (partner X) gắn poll này với request của mình (`AccessRequest`).  
5. Data Council connect ví, tải identity.json của họ qua UI, sau đó bỏ phiếu ẩn danh YES/NO.  
6. On-chain tally: nếu `yes_weight >= threshold` → request Approved.  
7. Seal key server cấp key cho X để decrypt dataset từ Walrus.

---

## 5. Functional Requirements

### 5.1. Đăng ký dataset (`DataAsset`) và tạo poll

- Admin thực hiện:
  - Nhận `blob_id` + `seal_identity` (`id_data`) từ Data Owner (sau khi Data Owner encrypt + upload bằng Seal + Walrus).  
  - Nhập danh sách ví voter dùng cho poll này.  
  - Gọi `create_poll` trên Sui:
    - Tạo `AccessRequest`/`Poll` với:
      - `data_asset_blob_id = blob_id`,  
      - `data_asset_seal_identity = id_data`,  
      - `threshold`, `voting_end`,  
      - trạng thái `Voting`.

### 5.2. Gen identities + Merkle root với wasm

- Backend/script admin sử dụng `zk_merkle_wasm_bg.wasm` để:
  - Generate `identity_secret` và `identity_commitment` cho từng ví voter.  
  - Build Merkle tree commitments → `council_root`.  
  - Với mỗi voter, sinh Merkle path (siblings + indices) tương ứng.

### 5.3. Tạo identity.json + encrypt bằng Seal

Cho mỗi ví `voter_addr`, backend tạo:

```json
{
  "poll_id": "<POLL_ID_OR_REQUEST_ID>",
  "voter_address": "<SUI_ADDRESS>",
  "identity_secret": "<hex>",
  "path": {
    "siblings": ["0x...", "..."],
    "indices": [0, 1, ...]
  },
  "council_root": "<root_hex>"
}
```

- Chọn Seal identity cho identity.json, ví dụ:  
  `seal_identity = "orcavote|identity|poll_id|" + voter_address`.  
- Encrypt identity.json bằng Seal SDK với `seal_identity`.  
- Upload ciphertext identity.json lên Walrus → `identity_blob_id`.  
- Gọi Move để tạo `VoterIdentityRef`:

```text
VoterIdentityRef {
  poll_id,
  voter: voter_address,
  walrus_blob_id: identity_blob_id,
  seal_identity,
}
```

- Backend phải xóa plaintext identity sau khi encrypt + upload.

### 5.4. Seal allowlist cho identity.json

- Policy Seal cho domain `"orcavote|identity|poll_id|voter_addr"`:
  - Chỉ cấp key nếu `caller_address == voter_addr`.  
  - Có thể giới hạn trong thời gian poll còn `Setup`/`Voting`.  
- Khi UI voter gọi Seal SDK để request key:
  - Key server đọc on-chain `VoterIdentityRef`, check `voter == caller`.  
  - Nếu pass → trả key để decrypt identity blob từ Walrus.

### 5.5. Voter tải identity.json và bỏ phiếu

1. Voter mở OrcaVote UI và connect ví.  
2. UI query `VoterIdentityRef` với `voter == current_address`, hiển thị các poll liên quan.  
3. Voter chọn poll → bấm `Download identity`:
   - UI gọi Seal SDK `requestKey(seal_identity)` để lấy key decrypt.  
   - Tải ciphertext từ Walrus (`walrus_blob_id`), decrypt local thành `identity.json`.  
   - Lưu local (file hoặc localStorage) để dùng cho bước vote.
4. Khi voter bấm `Vote YES/NO`:
   - UI dùng `identity.json` + `council_root` + `poll_id` + choice để sinh ZK proof (Groth16) bằng wasm + prover.  
   - Gửi tx `submit_vote` chứa proof + public inputs.  
   - On-chain verify proof, check nullifier, cập nhật `yes_weight`/`no_weight`.

### 5.6. Finalize & data release

- Khi hết hạn hoặc có trigger manual, gọi `finalize_request`:
  - Nếu `yes_weight >= threshold` → `status = Approved`.  
  - Ngược lại → `Rejected`.

- Khi Approved, Requester dùng Seal SDK `requestKey(id_data, poll_id)` để lấy key giải mã dataset tương ứng và đọc ciphertext từ Walrus.

---

## 6. Non‑Functional Requirements

- **Privacy**:
  - Không lưu identifier trực tiếp của voter trong vote (chỉ nullifier).  
  - identity.json chỉ tồn tại plaintext trên máy voter.

- **Verifiability**:
  - Logic verify ZK + tally là public trong Move.  
  - Ai cũng có thể audit state trên Sui.

- **Performance**:
  - Groth16 để proof nhỏ, verify nhanh.  
  - Số voter/poll hạn chế trong MVP.

- **Developer Experience**:
  - Có CLI để automate: gen identities + Merkle tree, encrypt identity blob, đăng ký dataset, tạo poll, vote.

---

## 7. High‑Level Architecture

- Off-chain:
  - `zk_merkle_wasm_bg.wasm` để gen Merkle tree & identity.  
  - Circom + Groth16 để build circuit & proof.  
  - Seal SDK để encrypt dataset & identity.json, request key.  
  - Walrus để lưu ciphertext.

- On-chain (Sui Move):
  - `data_asset` / `poll` / `access_request` modules: lưu blob_id, seal_identity, thresholds.  
  - `zk_vote` module: verify proof, manage nullifiers & tallies.  
  - Seal policy code: kiểm tra trạng thái poll/request trước khi cấp key cho dataset.

---

## 8. MVP Deliverables

- Move package `orcavote` với module cho DataAsset, Poll/AccessRequest, ZK voting.  
- wasm `zk_merkle_wasm_bg.wasm` + scripts gen identity & Merkle root.  
- Circuit Groth16 cho membership + non‑double‑vote.  
- CLI scripts: `admin` (gen + publish identities), `asset`, `request`, `vote`.  
- Basic React UI: admin tạo poll + add voters, voter tải identity.json và bỏ phiếu.

---

## 9. Implementation Status

### ✅ ĐÃ LÀM

#### UI — Landing Page (`index.html`)
- Dark mode OLED landing page (Orbitron + Exo 2 typography)
- Sections: Hero, How It Works (4 steps), Features (6 cards), Use Cases (3 cards), CTA, Footer
- Nội dung đúng PRD: ZK voting, Seal encryption, Walrus storage, on-chain governance
- "Get Started" và "Launch App" buttons link sang `orcavote.html`
- Design system từ ui-ux-pro-max: Dark Mode OLED + Trust & Authority style

#### UI — App Dashboard (`orcavote.html`)
- Sui DAppKit integration: `SuiClientProvider` + `WalletProvider` + `QueryClientProvider`
- Network config: testnet (default) + mainnet via `getJsonRpcFullnodeUrl`
- **Connect Wallet**: `ConnectModal` popup chọn ví Sui (Sui Wallet, Suiet, etc.)
- **Network Selector**: dropdown switch testnet/mainnet via `useSuiClientContext`
- **Wallet Panel**: click wallet icon hiện dropdown với:
  - Full address + copy button
  - SuiNS name (nếu có) via `useResolveSuiNSName`
  - Token list via `useSuiClientQuery('getAllBalances')`
  - Disconnect button
- `autoConnect` enabled cho returning users

#### ZK Merkle Identity Builder (WASM)
- Load `zk_merkle_wasm` từ `public/sui-zk-merkle/` via script injection (bypass Vite public/ restriction)
- UI panel trong dashboard khi wallet connected:
  - Input: wallet addresses, poll ID, title, signal
  - Build Poseidon Merkle tree (BN254) via WASM
  - Output: Merkle root, tree depth, leaf count
  - Identity blobs với Groth16 public inputs (merkle_root_le, nullifier_hash_le, etc.)
  - Download individual `identity.json` hoặc full tree JSON
  - Verify Merkle proof per identity
  - Auto-fill connected wallet address
  - WASM status badge (loading/ready/error)

#### Seal Encryption + Walrus Upload
- `seal-walrus.ts`: Seal encrypt + Walrus Publisher HTTP API upload
  - `encryptIdentityBlob()`: Seal encrypt với voter address làm identity
  - `uploadToWalrus()`: PUT to Publisher API với fallback publishers
  - `encryptAndUpload()`: single blob flow
  - `encryptAndUploadAll()`: batch với progress callback
- Per-identity "Seal & Upload" button
- "Seal Encrypt & Upload All to Walrus" batch button với progress (done/total)
- Upload full Merkle tree JSON lên Walrus (không Seal — public metadata)
- Uploaded blobs hiện: blob ID, encrypted size, "View on Walrus" link
- Upload summary card: network, aggregator URL, upload count

#### Build & Infra
- Vite multi-page build: `index.html` + `orcavote.html` output riêng biệt
- TypeScript 6 compatibility: `ignoreDeprecations`, `allowArbitraryExtensions`
- CSS type declarations (`vite-env.d.ts`)
- Shared design tokens (`theme.ts`)

---

### ❌ CHƯA LÀM

#### Move Smart Contracts (on-chain)
- [ ] `data_asset.move`: quản lý `DataAsset` (walrus_blob_id, seal_identity, owner, meta)
- [ ] `governance.move`: quản lý `AccessRequest`/`Poll`, finalize logic, threshold
- [ ] `zk_vote.move`: verify Groth16 proof, manage nullifiers, update tally YES/NO
- [ ] Seal policy Move module: check trạng thái poll trước khi cấp key
- [ ] `VoterIdentityRef` struct on-chain (poll_id, voter, walrus_blob_id, seal_identity)
- [ ] Deploy lên testnet

#### ZK Circuit (Circom + Groth16)
- [ ] Circom circuit kiểu Semaphore (Merkle membership + nullifier + signal)
- [ ] Groth16 trusted setup (powers of tau + phase 2)
- [ ] Export verifying key cho Move contract
- [ ] WASM prover cho browser (snarkjs hoặc custom)

#### Voter Flow UI
- [ ] Query `VoterIdentityRef` cho connected wallet → hiện danh sách polls
- [ ] "Download Identity" button: Seal decrypt + Walrus fetch → lưu local
- [ ] "Vote YES/NO" button: sinh ZK proof từ identity.json → submit tx on-chain
- [ ] Hiện trạng thái vote realtime (yes/no count, threshold, deadline)
- [ ] Hiện kết quả finalize (Approved/Rejected)

#### Admin Flow UI
- [ ] Form tạo poll mới (blob_id, seal_identity, voter list, threshold, deadline)
- [ ] Batch gen identities + encrypt + upload (hiện tại chỉ có gen + upload, chưa gắn vào poll on-chain)
- [ ] Tạo `VoterIdentityRef` on-chain cho mỗi voter
- [ ] Finalize poll button

#### Requester Flow UI
- [ ] Form tạo `AccessRequest` (data_asset_id, purpose, threshold)
- [ ] Hiện trạng thái request (Voting/Approved/Rejected)
- [ ] Sau khi Approved: Seal decrypt dataset button

#### CLI Scripts
- [ ] `identity.ts`: gen identities + Merkle tree (hiện có WASM nhưng chưa có CLI wrapper)
- [ ] `asset.ts`: register dataset on-chain
- [ ] `request.ts`: create + finalize access request
- [ ] `vote.ts`: cast vote with ZK proof
- [ ] `admin.ts`: encrypt identity.json + publish refs

#### Observer/Community UI
- [ ] Dashboard hiện tất cả polls/requests public
- [ ] Hiện vote tally (không lộ voter identity)
- [ ] Hiện trạng thái dataset (encrypted, pending vote, released)

---

### 📊 Tổng kết tiến độ

| Layer | Status | Chi tiết |
|-------|--------|----------|
| Landing Page | ✅ Done | Dark mode, đúng nội dung PRD |
| Wallet Connect | ✅ Done | DAppKit, network switch, SuiNS, token list |
| ZK Merkle WASM | ✅ Done | Build tree, gen identities, verify proof |
| Seal + Walrus | ✅ Done | Encrypt identity blobs, upload to Walrus, upload tree JSON |
| Move Contracts | ❌ Not started | Scaffold only, no logic |
| ZK Circuit | ❌ Not started | No Circom circuit yet |
| Voter UI | ❌ Not started | No poll list, no vote button |
| Admin UI | 🟡 Partial | Gen + upload identities works, but not tied to on-chain poll |
| Requester UI | ❌ Not started | No access request flow |
| CLI Scripts | ❌ Not started | No CLI wrappers |

# OrcaVote PRD

## 1. Overview

**Tên sản phẩm:** OrcaVote  
**Tagline:** Vote-to-unlock private data.

OrcaVote là một protocol trên Sui giúp **release dữ liệu nhạy cảm** (dataset, log, báo cáo, AI training data…) chỉ khi một nhóm stakeholder bỏ phiếu đồng ý. Dữ liệu luôn được mã hóa bằng **Seal** và lưu trên **Walrus**, còn logic bỏ phiếu, tally, và điều kiện release được thực thi on-chain bằng Move.

- Dữ liệu được encrypt client-side bằng Seal, upload lên Walrus dưới dạng ciphertext.  
- DataOwner đăng ký `DataAsset` trên Sui, chứa `walrus_blob_id` + `seal_identity` (identity IBE cho dataset).  
- Requester tạo `AccessRequest` để xin truy cập dataset.  
- Data Council bỏ phiếu YES/NO bằng **ZK proof** (membership + non‑double‑vote) để quyết định có cho phép truy cập không.  
- Move contract verify proof bằng Groth16, update tally YES/NO.  
- Nếu YES đạt `threshold`, Seal key server cấp key cho Requester để giải mã dataset từ Walrus.

MVP tập trung vào:

- Ẩn danh voter (không lộ identity, không link được ví → vote).  
- Deterministic on-chain tally.  
- Policy‑driven data release thông qua Seal.

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
   - Có ZK identity + Merkle path, cast vote qua OrcaVote UI.

4. **Observer / Community**  
   - Đọc trạng thái các request, kết quả vote; không xem được phiếu cá nhân.

---

## 4. Core Use Case MVP

**Scenario:**  
DAO có dataset `Q1_Revenue_By_Region` đã encrypt bằng Seal và lưu trên Walrus. Đối tác X muốn truy cập dataset này để đánh giá hợp tác:

1. Data Owner đăng ký dataset thành `DataAsset` trên OrcaVote.  
2. Requester (partner X) tạo `AccessRequest` với lý do, threshold, deadline.  
3. Data Council (ví dụ 5 thành viên) bỏ phiếu ẩn danh YES/NO.  
4. On-chain tally: nếu `yes_weight >= threshold` → request Approved.  
5. Seal key server cấp key cho X, X decrypt dataset từ Walrus.

---

## 5. Functional Requirements

### 5.1. Đăng ký dataset (`DataAsset`)

- DataOwner có thể:
  - Encrypt dataset bằng Seal SDK với identity `id_data`.  
  - Upload ciphertext lên Walrus và nhận `BlobId`.  
  - Gọi `create_data_asset(walrus_blob_id, id_data, meta)` trên Sui:
    - Lưu `DataAsset { walrus_blob_id, seal_identity = id_data, owner, meta }`.

### 5.2. Tạo & quản lý `AccessRequest`

- Requester có thể tạo request:
  - `create_access_request(data_asset_id, purpose, voting_end, threshold)`  
  - Kết quả: `AccessRequest` mới với:
    - `status = Voting`,  
    - `yes_weight = 0`, `no_weight = 0`,  
    - `threshold` (tổng YES weight cần để chấp thuận).

- Bất kỳ ai có thể đọc state `AccessRequest`:
  - `data_asset_id`, `requester`, `status`, `yes_weight`, `no_weight`, `threshold`, `voting_end`.

### 5.3. ZK anonymous voting

- Voter sở hữu ZK identity (gen off-chain) có thể:
  - Sinh proof chứng minh:  
    - Identity của mình nằm trong Merkle tree root `council_root`,  
    - Chưa vote cho `AccessRequest` này (nullifier unique),  
    - Vote choice thuộc set hợp lệ (YES/NO).  
- Circuit kiểu Semaphore:
  - Public inputs: `root`, `signal_hash`, `external_nullifier`, `nullifier_hash`.  
  - Private inputs: `identity_secret`, Merkle path.

- On-chain `submit_vote` sẽ:
  - Nhận `proof` + public inputs.  
  - Verify proof bằng Groth16 verifier trong Move.  
  - Check:
    - `root` khớp `council_root` của poll,  
    - `external_nullifier` khớp `request_id`,  
    - `nullifier_hash` chưa tồn tại trong bảng `nullifiers_used`.  
  - Nếu hợp lệ:
    - Mark `nullifier_hash` là used,  
    - Decode `signal` (YES/NO) từ `signal_hash`,  
    - Cập nhật `yes_weight` hoặc `no_weight`.

### 5.4. Finalize & release data

- Khi hết hạn hoặc có trigger manual, có thể gọi `finalize_request`:
  - Nếu `yes_weight >= threshold` → `status = Approved`.  
  - Ngược lại → `Rejected`.

- Khi `AccessRequest` ở trạng thái Approved, Requester có thể:
  - Gọi Seal SDK `requestKey(id_data, request_id)` tới key server.  
  - Key server check state trên Sui, nếu policy pass → cấp key cho `id_data`.  
  - Requester tải ciphertext từ Walrus và decrypt local.

### 5.5. Admin: bootstrap identities & council

- Admin có thể:
  - Nhập danh sách địa chỉ Sui của voter.  
  - Off-chain script:
    - Generate `identity_secret` + `identity_commitment` cho từng voter,
    - Build Merkle tree → `council_root`,  
    - Tạo `identity.json` cho từng voter (secret + path + root).  
  - Encrypt từng `identity.json` bằng Seal với identity IBE gắn với `voter_addr`, upload Walrus, tạo `VoterIdentityRef` trên Sui.  
- Seal policy ensure chỉ đúng `voter_addr` mới decrypt được identity của mình.

---

## 6. Non‑Functional Requirements

- **Privacy**:
  - Không lưu bất kỳ identifier trực tiếp của voter (địa chỉ, identity) trong dữ liệu vote, chỉ lưu `nullifier_hash`.  
  - `identity.json` chỉ tồn tại plaintext trên client của voter.

- **Verifiability**:
  - Logic verify ZK + tally được code public trong Move.  
  - Bất kỳ ai có thể audit trên Sui explorer / SDK.

- **Performance**:
  - Groth16 chọn vì proof nhỏ, verify nhanh.  
  - MVP giới hạn số cử tri/poll (ví dụ <= 100) để prove/time chấp nhận được.

- **Developer Experience**:
  - Cung cấp CLI scripts (Node/TS) để:
    - Gen identities + Merkle tree,  
    - Register dataset,  
    - Create request,  
    - Vote.

---

## 7. High‑Level Architecture

- Off-chain:
  - Circom circuit + Groth16 setup.  
  - Script Node/TS để tạo identity, Merkle tree, proof.  
  - Seal SDK để encrypt dataset + identity.json, request key.  
  - Walrus để lưu ciphertext (dataset + identity blob).

- On-chain (Sui Move):
  - `data_asset.move`: quản lý `DataAsset`.  
  - `governance.move`: quản lý `AccessRequest`, finalize.  
  - `zk_vote.move`: verify proof, update tally, quản lý `nullifiers_used`.  
  - Policy Seal đọc state Sui để quyết định có cấp key cho `id_data` hay không.

---

## 8. MVP Deliverables

- Move package `orcavote` với 3 module: `data_asset`, `governance`, `zk_vote`.  
- Circuit Groth16 cho vote membership + non‑double‑vote.  
- CLI scripts: `identity.ts`, `asset.ts`, `request.ts`, `vote.ts`.  
- Basic React UI: dashboard dataset + request, màn hình vote, màn hình admin bootstrap identities.


---

# OrcaVote README

## OrcaVote 🐋  
_vote-to-unlock private data_

OrcaVote là một **privacy-preserving oracle / data-release protocol** trên Sui.

Datasets được mã hóa bằng **Seal** và lưu trên **Walrus**, chỉ được giải mã khi một nhóm stakeholder bỏ phiếu đồng ý, với việc tally và điều kiện release được thực thi on-chain. ZK proofs (Groth16) được dùng để chứng minh quyền vote mà không lộ danh tính.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Use Cases](#use-cases)
- [Repository Structure](#repository-structure)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
- [Quick Start](#quick-start)
  - [1. Deploy OrcaVote Move package](#1-deploy-orcavote-move-package)
  - [2. Register a encrypted dataset](#2-register-a-encrypted-dataset)
  - [3. Create an access request](#3-create-an-access-request)
  - [4. Voter casts an anonymous vote](#4-voter-casts-an-anonymous-vote)
  - [5. Finalize and release data](#5-finalize-and-release-data)
- [Concepts](#concepts)
  - [DataAsset](#dataasset)
  - [AccessRequest](#accessrequest)
  - [ZK Voting (Groth16)](#zk-voting-groth16)
  - [Seal & Walrus Integration](#seal--walrus-integration)
- [CLI Reference](#cli-reference)
- [Development](#development)
- [Limitations (MVP)](#limitations-mvp)
- [Roadmap](#roadmap)
- [License](#license)

---

## Overview

OrcaVote giải quyết bài toán: **cho phép đối tác / oracle truy cập dữ liệu nhạy cảm** (báo cáo tài chính, log, dataset AI…) mà vẫn có governance rõ ràng và bảo vệ privacy.

- Data được mã hóa local bằng Seal và lưu ciphertext trên Walrus.  
- DataOwner đăng ký `DataAsset` trên Sui.  
- Requester tạo `AccessRequest` để xin quyền truy cập dataset.  
- Data Council bỏ phiếu ẩn danh (ZK proof) để quyết định cho phép hay không.  
- Move contract verify proof bằng Groth16, tally YES/NO.  
- Nếu đủ YES, Seal key server cấp key giải mã dataset cho requester.

---

## Architecture

- **Sui Move**
  - `orcavote::data_asset` – quản lý `DataAsset` (dataset đã mã hóa).  
  - `orcavote::governance` – quản lý `AccessRequest`, finalize, threshold logic.  
  - `orcavote::zk_vote` – verify Groth16 proof và cập nhật tally.

- **ZK Off-chain**
  - Circom circuit kiểu Semaphore (Merkle membership + nullifier + signal).  
  - SNARK prover (snarkjs hoặc Rust) sinh Groth16 proof + public inputs.

- **Seal**
  - Encrypt dataset & identity.json.  
  - Sau khi request được Approved, cấp key giải mã cho requester.

- **Walrus**
  - Lưu ciphertext dataset và ciphertext identity blob.

---

## Use Cases

- DAO vote để cho phép đối tác được xem báo cáo doanh thu chi tiết.  
- Data DAO cho phép nhóm nghiên cứu truy cập dataset AI training.  
- Bên thứ ba (auditor, regulator) truy cập log bảo mật sau khi hội đồng approve.

---

## Repository Structure

```text
orcavote/
  README.md              # This file
  move/
    sources/
      data_asset.move    # DataAsset, create_data_asset
      governance.move    # AccessRequest, finalize_request
      zk_vote.move       # submit_vote, tally, ZK verify
    Move.toml
  circuits/
    orcavote.circom      # Semaphore-like circuit (membership + nullifier)
    build/
      orcavote.r1cs
      orcavote.wasm
      orcavote.zkey
      vk.json            # verifying key (for Move)
  cli/
    package.json
    src/
      identity.ts        # generate identities & Merkle tree
      prove.ts           # generate proof for a vote
      vote.ts            # send vote tx to Sui
      asset.ts           # register dataset
      request.ts         # create & finalize access request
      admin.ts           # (optional) encrypt identity.json with Seal + publish refs
  ui/
    package.json
    src/
      App.tsx           # basic React UI (dashboard + voting)
      ...
  docs/
    PRD.md
    diagrams/
```

---

## Getting Started

### Prerequisites

- Node.js >= 18  
- pnpm / npm / yarn  
- Sui CLI & localnet/devnet  
- circom + snarkjs (nếu dùng Groth16 toolchain này)  
- Seal & Walrus SDK (hoặc HTTP API) cho encrypt/upload

### Installation

```bash
git clone https://github.com/your-org/orcavote.git
cd orcavote

# Install CLI deps
cd cli
pnpm install
cd ..

# (optional) compile circuits
cd circuits
# See circuits/README.md for detailed steps
cd ..
```

---

## Quick Start

### 1. Deploy OrcaVote Move package

```bash
cd move
sui client publish --gas-budget 100000000
```

Lưu lại `packageId` để sử dụng cho CLI/UI.

### 2. Register a encrypted dataset

1. Encrypt dataset bằng Seal SDK → nhận `ciphertext` + `id_data`.  
2. Upload ciphertext lên Walrus → nhận `BlobId`.  
3. Dùng CLI để đăng ký:

```bash
cd cli
pnpm tsx src/asset.ts create \
  --package-id <ORCAVOTE_PACKAGE_ID> \
  --blob-id <WALRUS_BLOB_ID> \
  --seal-identity <ID_DATA_HEX> \
  --description "Q1 revenue by region"
```

### 3. Create an access request

```bash
pnpm tsx src/request.ts create \
  --package-id <ORCAVOTE_PACKAGE_ID> \
  --data-asset-id <DATA_ASSET_ID> \
  --purpose "Partner X due diligence" \
  --threshold 3
```

CLI sẽ in ra `access_request_id`.

### 4. Voter casts an anonymous vote

Giả sử mỗi voter đã có `identity.json` (secret + Merkle path + root) được lấy qua Seal.

```bash
pnpm tsx src/vote.ts \
  --package-id <ORCAVOTE_PACKAGE_ID> \
  --access-request-id <ACCESS_REQUEST_ID> \
  --identity ./identities/voter1.json \
  --choice yes
```

Bên trong `vote.ts`:

- Load `identity.json`.  
- Gọi `prove.ts` để sinh Groth16 proof + public inputs.  
- Gửi transaction `submit_vote(proof, inputs)` lên Sui.

### 5. Finalize and release data

Sau khi đủ phiếu hoặc hết hạn:

```bash
pnpm tsx src/request.ts finalize \
  --package-id <ORCAVOTE_PACKAGE_ID> \
  --access-request-id <ACCESS_REQUEST_ID>
```

Nếu YES weight ≥ threshold → request chuyển sang `Approved`.  
Requester dùng Seal SDK để request key và decrypt dataset từ Walrus.

---

## Concepts

### DataAsset

- Đại diện cho dataset đã mã hóa:
  - `walrus_blob_id` – blob ciphertext trên Walrus.  
  - `seal_identity` – identity IBE cho dataset.

### AccessRequest

- Một lần xin truy cập dataset.  
- Chứa requester, purpose, deadline, YES/NO tally, threshold, status.

### ZK Voting (Groth16)

- Circuit kiểu Semaphore:
  - Public inputs: `root`, `signal_hash`, `external_nullifier`, `nullifier_hash`.  
  - Private inputs: `identity_secret`, Merkle path.  
- Move contract dùng Groth16 verifier để check proof và cập nhật tally.

### Seal & Walrus Integration

- Seal:
  - Encrypt dataset & identity.json.  
  - Cấp key cho dataset chỉ khi `AccessRequest` được Approved.  
- Walrus:
  - Lưu ciphertext dataset + identity blob, liên kết bằng `BlobId`.

---

## CLI Reference (skeleton)

```bash
# Generate council identities & Merkle root
pnpm tsx src/identity.ts gen \
  --count 5 \
  --out ./identities/ \
  --out-root ./council_root.json

# Encrypt & publish identities via Seal + Walrus
pnpm tsx src/admin.ts publish-identities \
  --package-id <ORCAVOTE_PACKAGE_ID> \
  --council-root ./council_root.json \
  --addresses ./voters.csv

# Register dataset
pnpm tsx src/asset.ts create ...

# Create access request
pnpm tsx src/request.ts create ...

# Vote YES/NO
pnpm tsx src/vote.ts --choice yes|no ...

# Finalize request
pnpm tsx src/request.ts finalize ...
```

---

## Development

- Move:
  - Build: `sui move build`  
  - Test: `sui move test`

- Circuits:
  - Compile: `circom orcavote.circom --r1cs --wasm`  
  - Groth16 setup + export verifying key (theo docs Sui Groth16).

- CLI:
  - `cd cli && pnpm dev` hoặc `pnpm tsx src/...`.

- UI:
  - `cd ui && pnpm dev`.

---

## Limitations (MVP)

- Group cử tri là tĩnh, tạo off-chain.  
- Chỉ hỗ trợ poll YES/NO, weight = 1.  
- Không có MACI / anti‑collusion, chỉ anonymous voting + non‑double‑vote.  
- UI cơ bản, chủ yếu phục vụ demo.

---

## Roadmap

- Hỗ trợ nhiều council, nhiều poll song song.  
- Multi-option polls, weighted voting, quadratic voting.  
- UI dashboard đầy đủ cho DataOwner / Requester / Council.  
- Advanced Seal policy: time‑limited keys, multi‑sig release, audit mode.  
- zkVM integration (SP1/Risc0) để viết logic ZK phức tạp hơn.

---

## License

MIT (có thể thay đổi tùy dự án).

# OrcaVote — Hướng dẫn vận hành UI

## Giao diện chính

App có 3 tab chính trên navbar:

| Tab | Chức năng |
|-----|-----------|
| **Data Asset** | Upload file → Seal encrypt → Lưu trên Walrus. Quản lý blobs. |
| **Tạo Poll** | Nhập voters → Build Merkle Tree → Upload identities → Tạo poll on-chain |
| **Polls** | Xem danh sách polls → Vote → Finalize → Decrypt dataset |

Yêu cầu: kết nối Sui wallet (Sui Wallet, Suiet, Ethos, ...) trước khi sử dụng.

---

## Tab 1: Data Asset

### Upload file encrypted

1. Nhập **Dataset Name** (tùy chọn)
2. Click vùng drop zone → chọn file bất kỳ
3. Sau khi chọn file, hiện:
   - **Storage Epochs**: chọn thời gian lưu trữ (1–53 epochs, mỗi epoch ~14 ngày)
   - **Deletable**: Yes/No — có cho phép xóa blob sau này không
   - **Cost Estimate**: hiển thị chi phí WAL ước tính
4. Click **Seal Encrypt & Upload to Walrus**
5. App thực hiện 5 bước:
   - Seal Encrypting (encrypt file bằng `seal_approve_data_asset` policy)
   - Encoding blob (WASM RedStuff encoding)
   - Sign Register Tx (ký transaction đăng ký blob)
   - Uploading to nodes (upload slivers lên Walrus nodes)
   - Sign Certify Tx (ký transaction xác nhận blob)
6. Blob thuộc sở hữu wallet của bạn on-chain

### My Walrus Blobs

Hiển thị tất cả Walrus Blob objects thuộc wallet (paginated, không giới hạn 50).

Mỗi blob hiển thị:
- Blob ID (base64url)
- Size, Registered epoch, Expires epoch
- Deletable status
- **View on Walrus**: mở blob trên aggregator
- **Fetch & Decrypt**: decrypt blob bằng Seal (chỉ owner mới decrypt được)

### Decrypt by Blob ID

Nhập blob ID thủ công → Fetch & Decrypt. Dùng khi blob không thuộc wallet nhưng bạn có quyền decrypt.

---

## Tab 2: Tạo Poll

Flow gồm 4 bước tuần tự:

### Bước 1: Build Merkle Tree

1. Nhập **Poll Title** (tên poll)
2. Nhập **Voter Addresses** — mỗi dòng 1 Sui address (0x...)
3. Click **Build Merkle Tree**
4. WASM module tạo:
   - 1 `IdentityBlob` cho mỗi voter (chứa identity_secret, identity_nullifier, commitment)
   - Poseidon Merkle Tree từ tất cả commitments → `council_root`

### Bước 2: Upload Identity Blobs

Mỗi voter có 1 IdentityBlob cần upload lên Walrus:

- Click **Upload All** để upload tất cả cùng lúc
- Hoặc upload từng cái một
- Identity blobs được upload dạng plaintext (không Seal encrypt)
- Mỗi blob nhận được `blobId` — lưu on-chain để voter fetch khi vote

### Bước 3: Chọn Data Asset

Click **Select Data Asset** → mở picker chọn blob từ wallet.
Đây là dataset sẽ được unlock khi poll Approved.

### Bước 4: Create Poll On-Chain

1. Thiết lập:
   - **Threshold**: số YES votes tối thiểu để Approved
   - **Voting Deadline**: thời hạn vote
2. Click **Create Poll + Register Voters + Start Voting**
3. Một transaction duy nhất thực hiện 3 bước:
   - `create_poll` → tạo poll với council_root, threshold, deadline
   - `register_voters` → đăng ký mapping voter_address → walrus_blob_id
   - `start_voting` → chuyển poll sang trạng thái Voting

### Bước 5: Seal Encrypt Dataset (sau khi tạo poll)

Sau khi poll được tạo (có poll_id), hiện nút **Seal Encrypt & Upload Dataset**:

1. Fetch dataset gốc từ Walrus
2. Seal encrypt với identity = `registry_id + poll_id` (cho `seal_approve_dataset` policy)
3. Upload encrypted blob mới lên Walrus
4. Update `data_blob_id` on-chain qua `set_data_blob`

Bước này bắt buộc để dataset có thể decrypt sau khi poll Approved.

---

## Tab 3: Polls

### Danh sách Polls

Hiển thị tất cả polls đã tạo on-chain (query từ PollCreated events).

Mỗi poll hiển thị:
- Title, Status (Setup / Voting / Approved / Rejected)
- YES/NO count, Threshold
- Voting deadline
- Admin address

Click vào poll → mở Poll Detail.

### Poll Detail — Vote

Khi poll đang Voting và chưa hết hạn:

1. App kiểm tra wallet có phải registered voter không
2. Nếu có → hiện 2 nút **YES** / **NO**
3. Chọn rồi click **Submit Anonymous Vote**
4. App thực hiện 4 bước tự động:
   - **Fetching identity reference**: gọi `get_voter_ref` on-chain → lấy walrus_blob_id
   - **Decrypting identity**: fetch IdentityBlob từ Walrus
   - **Generating ZK proof**: fetch TẤT CẢ voters' blobs → rebuild Merkle tree → generate Groth16 proof
   - **Submitting vote**: gửi proof + nullifier + choice on-chain
5. On-chain verify proof → update tally → lưu nullifier (ngăn vote 2 lần)

### Poll Detail — Finalize

Khi voting deadline đã qua:

- **Finalize Poll**: ai cũng có thể gọi (permissionless)
- **Admin Early Finalize**: chỉ poll creator, có thể gọi trước deadline
- Kết quả: `yes_count >= threshold` → Approved, ngược lại → Rejected

### Poll Detail — Decrypt Dataset

Khi poll Approved và có dataset blob:

1. Hiện section **Shared Dataset** với blob ID
2. Click **Decrypt Dataset**
3. App gọi `seal_approve_dataset` → Seal key server verify poll Approved → trả key → decrypt
4. Hiển thị nội dung + nút Download

---

## Luồng hoàn chỉnh (End-to-End)

```
Poll Creator                          Voters                         Anyone
───────────                          ──────                         ──────

1. Upload dataset (Data Asset tab)
   File → Seal encrypt → Walrus
   
2. Build Merkle Tree (Tạo Poll tab)
   Nhập voter addresses
   WASM → IdentityBlobs + root
   
3. Upload Identity Blobs → Walrus

4. Create Poll on-chain
   create_poll + register_voters
   + start_voting (1 tx)

5. Seal Encrypt Dataset for poll
   Re-encrypt với poll_id
   Update on-chain blob reference
                                     
                                     6. Mở poll (Polls tab)
                                        Fetch identity blob
                                        Rebuild Merkle tree
                                        Generate ZK proof
                                        Submit vote on-chain
                                     
                                     7. (Repeat cho mỗi voter)

                                                                    8. Finalize poll
                                                                       (sau deadline)

                                                                    9. Decrypt dataset
                                                                       (nếu Approved)
```

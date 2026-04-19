# OrcaVote — Bug Log

Danh sách tất cả bugs đã gặp trong quá trình phát triển, nguyên nhân gốc, và cách fix.

---

## Bug #1: Seal encrypt/decrypt dùng sai package + sai id

**Triệu chứng:** Fetch & Decrypt trong DataAssetPanel không đọc được dữ liệu.

**Nguyên nhân:**
- Encrypt dùng Seal demo package (`0x2b54...`) với `private_seal` pattern (id = owner address)
- Decrypt gọi module `whitelist::seal_approve` — module này không tồn tại trong package đó (tên đúng là `allowlist`)
- Thêm nữa, `tx.object(encObj.id)` truyền sai — `encObj.id` là hex string, không phải object ID

**Fix:** (`763627f`)
- Encrypt: dùng `toHex(bcs.Address.serialize(address))` làm id (đúng format BCS)
- Decrypt: gọi `private_seal::seal_approve` (đúng module name), chỉ truyền `id` vector (không cần object argument)

---

## Bug #2: Merkle root mismatch khi vote (abort code 6)

**Triệu chứng:**
- `MoveAbort abort code: 6` trong `zk_vote::submit_vote` (= `EInvalidMerkleRoot`)
- Hoặc `Assert Failed line: 91` trong circuit (`tree.root === merkle_root`)

**Nguyên nhân:**
Vote handler chỉ dùng **1 commitment** (của voter hiện tại) để build Merkle tree:
```ts
const commitmentBigints = [hexToBigInt(identity.identity_commitment)]
```
Nhưng poll được tạo với 3 voters → Merkle tree có 3 leaves → root khác.

**Fix:** (`5d44dc8`)
1. Fetch `poll_voter_list` on-chain → danh sách tất cả voter addresses
2. Fetch mỗi voter's IdentityBlob từ Walrus → extract `identity_commitment`
3. Build Merkle tree với TẤT CẢ commitments → root match on-chain `council_root`

---

## Bug #3: Dataset Seal encrypt/decrypt identity mismatch

**Triệu chứng:** Dataset decrypt sau poll approval trả về file rác (ciphertext).

**Nguyên nhân:**
- Dataset encrypt trong DataAssetPanel dùng `SEAL_PACKAGE_ID` (demo) + `ownerAddress` làm id
- Dataset decrypt trong PollDetailPanel gọi `seal_approve_dataset` trên orcavote package + `registry_id + poll_id` làm id
- Hai Seal identity hoàn toàn khác nhau → key server trả key cho id khác → decrypt ra garbage

**Fix:** (`b5903d0`, `b6c0aba`)
- Thêm `encryptForPoll(plaintext, pollId)` — encrypt với orcavote package + `registry_id + poll_id`
- Thêm `set_data_blob()` trong Move contract để update blob reference sau khi tạo poll
- CreatePollPanel: thêm bước "Seal Encrypt & Upload Dataset" sau khi poll được tạo
- Loại bỏ hoàn toàn dependency vào Seal demo package

---

## Bug #4: Double encryption

**Triệu chứng:** Dataset decrypt "thành công" (không lỗi) nhưng file download vẫn là ciphertext.

**Debug log:**
```
decrypted size: 9355  ciphertext size: 9671
First 20 decrypted:  [0, 17, 80, 99, ...]  ← Seal header!
First 20 ciphertext: [0, 17, 80, 99, ...]  ← Same header!
Same bytes? false  ← Sizes differ, so sanity check passes
```

**Nguyên nhân:**
CreatePollPanel "Seal Encrypt & Upload Dataset" flow:
1. Fetch blob từ Walrus → nhận bytes đã Seal-encrypted (từ DataAssetPanel)
2. `encryptForPoll(encrypted_bytes)` → encrypt lần 2!
3. Upload double-encrypted blob

Khi decrypt: Seal chỉ bóc 1 lớp → output vẫn là Seal EncryptedObject (lớp encrypt đầu tiên).

**Fix:** (`42e8839`)
CreatePollPanel giờ:
1. Fetch blob từ Walrus
2. Detect nếu Seal-encrypted (`EncryptedObject.parse()` thành công)
3. Decrypt bằng `seal_approve_data_asset` (owner key) → lấy plaintext
4. Encrypt plaintext bằng `encryptForPoll` → 1 lần duy nhất

---

## Bug #5: Blob list chỉ hiện 50 blobs (không paginate)

**Triệu chứng:** Wallet có >50 Walrus Blob objects nhưng UI chỉ hiện 50. Blob cụ thể không xuất hiện trong danh sách.

**Nguyên nhân:**
`getOwnedObjects` có `limit: 50` nhưng không check `hasNextPage` / `nextCursor`.

**Fix:** (`763627f`, `41b736f`)
- Thêm pagination loop: `while (hasNext) { fetch page → cursor = nextCursor }`
- Extract logic vào `useWalrusBlobs` hook — cả DataAssetPanel và BlobIdPicker dùng chung

---

## Bug #6: Download file dùng sai buffer

**Triệu chứng:** File download có size lớn hơn expected hoặc chứa garbage bytes ở cuối.

**Nguyên nhân:**
```ts
new Blob([dataDecrypted.raw.buffer])  // ← BUG
```
`Uint8Array.buffer` trả về toàn bộ underlying `ArrayBuffer`, có thể lớn hơn actual data nếu `Uint8Array` là slice.

**Fix:** (`a37c6d0`)
```ts
new Blob([dataDecrypted.raw])  // ← Dùng Uint8Array trực tiếp
```

---

## Bug #7: Decrypt fail silently — trả ciphertext thay vì báo lỗi

**Triệu chứng:** UI hiện "Decrypted" nhưng nội dung là ciphertext.

**Nguyên nhân:**
```ts
} catch {
  decrypted = ciphertext  // ← Swallow error, return garbage
}
```

**Fix:** (`42c83d9`, `a37c6d0`)
- Thêm sanity check: nếu `decrypted == ciphertext` → throw error
- Không swallow error — hiển thị error message rõ ràng
- Thêm console.log chi tiết để debug

---

## Bug #8: Decrypt dùng hardcoded id thay vì id từ encrypted object

**Triệu chứng:** Decrypt dataset trả garbage khi blob được encrypt cho poll khác.

**Nguyên nhân:**
Decrypt tự construct Seal id = `registry + poll_id` hiện tại, nhưng blob có thể được encrypt với poll_id khác (ví dụ từ contract cũ).

**Fix:** (`11d9f3d`)
Đọc `packageId` và `id` trực tiếp từ `EncryptedObject.parse(ciphertext)` thay vì tự construct. Đảm bảo decrypt luôn dùng đúng identity mà blob đã encrypt.

---

## Bug #9: GitHub Actions workflow dùng version không tồn tại

**Triệu chứng:** Deploy workflow fail.

**Nguyên nhân:**
- `actions/checkout@v6` — chưa có stable release
- `actions/configure-pages@v6` — chưa có stable release

**Fix:** (`763627f`)
- Hạ về `actions/checkout@v4` và `actions/configure-pages@v4`

---

## Bug #10: Vite base path sai khi deploy GitHub Pages

**Triệu chứng:** App trắng trang khi truy cập `https://longphu25.github.io/orcavote/`.

**Nguyên nhân:**
Không có `base` config → browser request JS/CSS từ `/assets/...` thay vì `/orcavote/assets/...`.

**Fix:** (`763627f`)
```ts
base: process.env.NODE_ENV === 'production' ? '/orcavote/' : '/',
```

---

## Bug #11: Broken JSX sau refactor

**Triệu chứng:** Vite build error `Unexpected token (554:13)`.

**Nguyên nhân:**
String replacement để lại JSX fragment không hoàn chỉnh — old IIFE pattern mixed với new code.

**Fix:** (`240b66d`)
Xóa leftover broken JSX fragments.

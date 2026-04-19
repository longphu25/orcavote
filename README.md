# OrcaVote

**Vote-to-unlock private data** — A protocol on Sui for governance-driven release of encrypted data using ZK anonymous voting, Seal encryption, and Walrus storage.

## Deployed Contracts (Testnet)

| Item | ID |
|------|----|
| **Package ID** | `0x115063746a65dce6e68997b5116af16188a164f724de111d87f9be6e085225f0` |
| **Registry** (shared) | `0x04d714c372105c024a7b99d2d3fb9d8e79f159e335894c158dae11668b9a233e` |
| **AdminCap** (owned) | `0x5f479fc0740adce56aaed5e2daa1480c15bbe54202de2f45b623eeb9bbf02877` |
| **UpgradeCap** | `0xe8de9984ab77446dc82d7ec7a307715793b93847fe3f79a04b19959e39ae595d` |
| **Network** | Sui Testnet |
| **Deployer** | `0xdfdd6484f7f94c80daefbfee06728f60236fde6bc229e30453306166a6b5691e` |
| **Tx Digest** | `FWGbcCoM3W28SNY597XwDPBLHkUjLwoB4a1fj8aNNh7M` |

Explorer: [View on SuiScan](https://suiscan.xyz/testnet/object/0x115063746a65dce6e68997b5116af16188a164f724de111d87f9be6e085225f0)

> **Note:** Poll creation is permissionless — anyone can create a poll. The poll creator becomes the admin of that poll (register voters, start voting, force-finalize).

## Seal Policies (Unified)

All Seal encryption/decryption uses the **orcavote package** — no external Seal demo packages.

| Policy | Function | Who can decrypt? | Seal ID format |
|--------|----------|-------------------|----------------|
| Data Asset | `seal_approve_data_asset` | Owner only | `registry_id(32) ++ owner_address(32)` |
| Dataset (post-vote) | `seal_approve_dataset` | Anyone (after Approved) | `registry_id(32) ++ poll_id(32)` |
| Identity Blob | `seal_approve_identity` | Registered voter only | `registry_id(32) ++ poll_id(32)` |

## Move Modules

```
move/orcavote/sources/
├── registry.move      # Core types, Registry singleton, AdminCap, init
├── data_asset.move    # Register encrypted datasets (Walrus + Seal)
├── governance.move    # Poll lifecycle, voter registration, finalize, set_data_blob
├── zk_vote.move       # Groth16 BN254 proof verification, nullifier, tally
└── seal_policy.move   # Seal key-server approval (3 policies)
```

See [docs/voting-flow.md](docs/voting-flow.md) for the end-to-end flow documentation.

## ZK Circuit

Semaphore-style Groth16 circuit on BN254 — Poseidon Merkle membership + nullifier + signal.

```
circuits/
├── orcavote.circom        # Circuit source (2911 constraints, tree depth 10)
├── Makefile               # compile → setup → export pipeline
└── export-vk-bytes.mjs    # Convert snarkjs VK → Arkworks vk_bytes

public/zk-circuit/         # Browser-ready artifacts (shipped with app)
├── circuit.wasm           # Witness calculator (~2 MB)
├── circuit_final.zkey     # Proving key (~1.7 MB)
├── verification_key.json  # Human-readable VK
└── vk_bytes.bin           # Arkworks VK for create_poll (392 bytes)
```

### Build circuit

```bash
cd circuits
npm install
make all
```

## Quick Start

### Deploy contract

```bash
cd move/orcavote
sui move build
sui client publish --gas-budget 500000000
```

### Frontend

```bash
bun install
bun run dev
```

## Architecture

```
Off-chain                          On-chain (Sui)
─────────                          ──────────────
WASM: gen Merkle tree    ────→     Registry (shared singleton)
      + identities                   ├── polls: Table<ID, Poll>
                                     ├── data_assets: Table<ID, DataAsset>
Seal SDK: encrypt        ────→      ├── voter_refs: Table<Key, VoterIdentityRef>
  (orcavote package)                 └── poll_voters: Table<ID, vector<address>>

Walrus: store ciphertext            Modules:
                                     ├── governance   → create poll, register voters, finalize
Circom + Groth16:        ────→       ├── zk_vote      → verify proof, update tally
  browser prover                     ├── seal_policy   → 3 Seal approval policies
                                     └── data_asset    → register datasets
```

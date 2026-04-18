# OrcaVote

**Vote-to-unlock private data** — A protocol on Sui for governance-driven release of encrypted data using ZK anonymous voting, Seal encryption, and Walrus storage.

## Deployed Contracts (Testnet)

| Item | ID |
|------|----|
| **Package ID** | `0x5d53be7618415cf787af2bb41c311f534c5285f71a73d0e11fa451a6185069fe` |
| **Registry** (shared) | `0xa9d9a72bcc4f0017fdc3368049109e70e3f9eedcb9b81c1aeadeaa56562a6df3` |
| **AdminCap** (owned) | `0x3905d5cfcf61b85409e431521e8e0bc6cdcae6d0b13ddb620c6468b021425221` |
| **UpgradeCap** | `0x733095bec17c51792999b3a463ae8f149b65277ea61f710d1257bff7f6f6547e` |
| **Network** | Sui Testnet |
| **Deployer** | `0xdfdd6484f7f94c80daefbfee06728f60236fde6bc229e30453306166a6b5691e` |
| **Tx Digest** | `FCdWJ9Q3g2FeP9Zdfxy9QErBB5WA8UER7XMQMVr5qTWm` |

Explorer: [View on SuiScan](https://suiscan.xyz/testnet/object/0x5d53be7618415cf787af2bb41c311f534c5285f71a73d0e11fa451a6185069fe)

> **Note:** Poll creation is permissionless — anyone can create a poll. The poll creator becomes the admin of that poll (register voters, start voting, force-finalize).

## Move Modules

```
move/orcavote/sources/
├── registry.move      # Core types, Registry singleton, AdminCap, init
├── data_asset.move    # Register encrypted datasets (Walrus + Seal)
├── governance.move    # Poll lifecycle, voter registration, finalize
├── zk_vote.move       # Groth16 BN254 proof verification, nullifier, tally
└── seal_policy.move   # Seal key-server approval (identity + dataset)
```

See [move/orcavote/TECHNICAL.md](move/orcavote/TECHNICAL.md) for full technical documentation.

## Quick Start

### Build & Test

```bash
cd move/orcavote
sui move build
sui move test
```

### Frontend

```bash
npm install
npm run dev
```

## Architecture

```
Off-chain                          On-chain (Sui)
─────────                          ──────────────
WASM: gen Merkle tree    ────→     Registry (shared singleton)
      + identities                   ├── polls: Table<ID, Poll>
                                     ├── data_assets: Table<ID, DataAsset>
Seal SDK: encrypt        ────→      ├── voter_refs: Table<Key, VoterIdentityRef>
          identity.json              └── poll_voters: Table<ID, vector<address>>

Walrus: store ciphertext            Modules:
                                     ├── governance  → create poll, register voters, finalize
Circom + Groth16:        ────→       ├── zk_vote     → verify proof, update tally
  browser prover                     ├── seal_policy  → Seal dry-run approval
                                     └── data_asset   → register datasets
```

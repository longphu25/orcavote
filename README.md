# OrcaVote

**Vote-to-unlock private data** — A protocol on Sui for governance-driven release of encrypted data using ZK anonymous voting, Seal encryption, and Walrus storage.

## Deployed Contracts (Testnet)

| Item | ID |
|------|----|
| **Package ID** | `0xc3c9950da569376b982e5e7e64b493e09771f50a0dc1c7d5e03771c093c95a19` |
| **Registry** (shared) | `0xa676ee02e4b84353971f4e362b63b0ff7be3ea483b3701226e1e6450e450e4e6` |
| **AdminCap** (owned) | `0x3b2f3af7cd71fc77a795ac37296ce2b9b0e9a9fbd64cac606728e6607107c0ac` |
| **UpgradeCap** | `0x2269844292ece5b7517f3db5be4cc196434ba479e664f670c89fc3b89dac4c9b` |
| **Network** | Sui Testnet |
| **Deployer** | `0xdfdd6484f7f94c80daefbfee06728f60236fde6bc229e30453306166a6b5691e` |
| **Tx Digest** | `7o71FagQ7toF63VqRbD564sFEKSm1bGJWKKMjPZz8sNA` |

Explorer: [View on SuiScan](https://suiscan.xyz/testnet/object/0xc3c9950da569376b982e5e7e64b493e09771f50a0dc1c7d5e03771c093c95a19)

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

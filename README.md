# OrcaVote

**Vote-to-unlock private data** — A protocol on Sui for governance-driven release of encrypted data using ZK anonymous voting, Seal encryption, and Walrus storage.

## Deployed Contracts (Testnet)

| Item | ID |
|------|----|
| **Package ID** | `0xcaa9a44de1bcf23f63f904800f3c9c5acb69dd9cf45071835c47d004392ce82c` |
| **Registry** (shared) | `0x96c9df61147c5adc893281064fa5400692f51265bd0585d3a99738eb8855cf21` |
| **AdminCap** (owned) | `0x7058d45df6ba2cd0eabb72439033c8cd5b89e9151a18bfb0f10479c70fd1845d` |
| **UpgradeCap** | `0x464cf0889bce247d2387bc9c28f6aa545ad8f67aadd7947245deb4dbd4ec804f` |
| **Network** | Sui Testnet |
| **Deployer** | `0xdfdd6484f7f94c80daefbfee06728f60236fde6bc229e30453306166a6b5691e` |
| **Tx Digest** | `3H3M1NMGCYSS8YTXeYu3aAVm64eTdfoZuFPNihpXvPa4` |

Explorer: [View on SuiScan](https://suiscan.xyz/testnet/object/0xcaa9a44de1bcf23f63f904800f3c9c5acb69dd9cf45071835c47d004392ce82c)

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

## ZK Circuit

Semaphore-style Groth16 circuit on BN254 — Poseidon Merkle membership + nullifier + signal.

```
circuits/
├── orcavote.circom        # Circuit source (5314 constraints, tree depth 20)
├── Makefile               # compile → setup → export pipeline
├── export-vk-bytes.mjs    # Convert snarkjs VK → Arkworks vk_bytes
└── build/                 # Compiled artifacts (gitignored)

public/zk-circuit/         # Browser-ready artifacts (shipped with app)
├── circuit.wasm           # Witness calculator (2 MB)
├── circuit_final.zkey     # Proving key (3.2 MB)
├── verification_key.json  # Human-readable VK
└── vk_bytes.bin           # Arkworks VK for create_poll (384 bytes)

src/zk-prove.ts            # Browser helper: loadVkBytes, generateProof, formatForSui
```

### Build circuit

```bash
cd circuits
npm install        # circomlib
make all           # compile → trusted setup → export → copy to public/
```

### Key concept

`vk_bytes` (384 bytes) is a **static file** — built once from the circuit, used for all polls. It's the Arkworks-serialized Groth16 verifying key passed to `governance::create_poll`. The contract calls `groth16::prepare_verifying_key(bn254(), &vk_bytes)` and stores the prepared key in the Poll struct.

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

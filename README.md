# OrcaVote

**Vote-to-unlock private data** — A protocol on Sui for governance-driven release of encrypted data using ZK anonymous voting, Seal encryption, and Walrus storage.

## Deployed Contracts (Testnet)

| Item | ID |
|------|----|
| **Package ID** | `0x982f507de25cb88c8fd29b8a10d2375c81d39aa90b380956156aef61b0ab6eec` |
| **Registry** (shared) | `0xf2a5b3f0ff9f0c53086060a396dc55bb95bc4ce4945201f0fc5217f82dfd8507` |
| **AdminCap** (owned) | `0xc7582671147651922b465b736300bc0adc7a2fb088ebe0aa68c600ab6aee679e` |
| **UpgradeCap** | `0x5ba21b910daf2cae72be725bcfadb7fd7b8577e21d262bc899e1c1caf28a8ebd` |
| **Network** | Sui Testnet |
| **Deployer** | `0xdfdd6484f7f94c80daefbfee06728f60236fde6bc229e30453306166a6b5691e` |
| **Tx Digest** | `3TWabhnS4JCSftkZzqankccgghWv2KZk5eZW1uBWSFPc` |

Explorer: [View on SuiScan](https://suiscan.xyz/testnet/object/0x982f507de25cb88c8fd29b8a10d2375c81d39aa90b380956156aef61b0ab6eec)

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

See [docs/FLOW.md](docs/FLOW.md) for the end-to-end flow, data formats, and bug log.

## ZK Circuit

Semaphore-style Groth16 circuit on BN254 — Poseidon Merkle membership + nullifier + signal.

```
circuits/
├── orcavote.circom        # Circuit source (2911 constraints, tree depth 10)
├── Makefile               # compile → setup → export pipeline
├── export-vk-bytes.mjs    # Convert snarkjs VK → Arkworks vk_bytes
└── build/                 # Compiled artifacts (gitignored)

public/zk-circuit/         # Browser-ready artifacts (shipped with app)
├── circuit.wasm           # Witness calculator (~2 MB)
├── circuit_final.zkey     # Proving key (~1.7 MB)
├── verification_key.json  # Human-readable VK
└── vk_bytes.bin           # Arkworks VK for create_poll (392 bytes)

src/zk-prove.ts            # Browser helper: loadVkBytes, generateProof, formatForSui
src/merkle-pad.ts          # Full depth-10 Merkle tree builder (poseidon-lite)
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

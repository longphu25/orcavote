<p align="center">
  <img src="public/favicon.svg" width="80" alt="OrcaVote" />
</p>

<h1 align="center">OrcaVote</h1>

<p align="center">
  <strong>Vote-to-unlock private data</strong><br/>
  Privacy-preserving governance protocol on Sui — ZK anonymous voting, Seal encryption, Walrus storage.
</p>

<p align="center">
  <a href="https://suiscan.xyz/testnet/object/0xc1ce937ce57cae994b643a320c092953d41298d924ca6f37ec0e100ff2abdd17">
    <img src="https://img.shields.io/badge/Sui-Testnet-4DA2FF?style=flat-square&logo=data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48Y2lyY2xlIGN4PSIxMiIgY3k9IjEyIiByPSIxMCIgZmlsbD0id2hpdGUiLz48L3N2Zz4=" alt="Sui Testnet" />
  </a>
  <img src="https://img.shields.io/badge/ZK-Groth16%20BN254-10B981?style=flat-square" alt="ZK Groth16" />
  <img src="https://img.shields.io/badge/Encryption-Seal-F59E0B?style=flat-square" alt="Seal" />
  <img src="https://img.shields.io/badge/Storage-Walrus-3B82F6?style=flat-square" alt="Walrus" />
</p>

---

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  ① Encrypt dataset → Upload to Walrus                          │
│  ② Build Merkle tree → Register voters on-chain                │
│  ③ Voters cast anonymous ballots (ZK proof in browser)         │
│  ④ Threshold reached → Poll Approved → Dataset auto-unlocked   │
└─────────────────────────────────────────────────────────────────┘
```

Data stays encrypted until a group collectively votes to release it. No single party can bypass governance. No one knows who voted what.

---

## Deployed Contracts

> **Network:** Sui Testnet

| Object | ID |
|--------|----|
| Package | [`0xc1ce…dd17`](https://suiscan.xyz/testnet/object/0xc1ce937ce57cae994b643a320c092953d41298d924ca6f37ec0e100ff2abdd17) |
| Registry (shared) | `0xa19f49c2ec3d5fb158680bf8ca62c661dc1e87960aec421bdb551efb4d5e1b6d` |
| Tx Digest | [`3PAr4qzYHCUmVPKHqXzRG6pvXAqhH87wfmS9KBwh7fBh`](https://suiscan.xyz/testnet/tx/3PAr4qzYHCUmVPKHqXzRG6pvXAqhH87wfmS9KBwh7fBh) |

Poll creation is permissionless — anyone can create a poll and becomes its admin.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Blockchain | **Sui** (Move smart contracts) |
| ZK Proof | **Groth16** on BN254 (Circom + snarkjs) |
| Hash Function | **Poseidon** (BN254-friendly, circuit + on-chain) |
| Encryption | **Seal** (threshold encryption, on-chain access control) |
| Storage | **Walrus** (decentralized blob store) |
| Frontend | React + Vite + `@mysten/dapp-kit` |

---

## Architecture

```
Off-chain (Browser)                    On-chain (Sui Move)
───────────────────                    ────────────────────

WASM: Poseidon Merkle tree    ───→     Registry (shared singleton)
      + identity generation              ├── polls
                                         ├── voter_refs
Seal SDK: encrypt/decrypt     ───→       ├── data_assets
  (orcavote package)                     └── poll_voters

Walrus: encrypted blob store           Modules:
                                         ├── governance    create / finalize polls
snarkjs: Groth16 prover      ───→       ├── zk_vote       verify proof, tally
  (~3s in browser)                       ├── seal_policy   3 access control policies
                                         └── data_asset    dataset registration
```

---

## Seal Policies

All encryption uses the **orcavote package** — no external dependencies.

| Policy | Who can decrypt | Seal ID |
|--------|----------------|---------|
| `seal_approve_data_asset` | Owner only | `registry(32) + owner(32)` |
| `seal_approve_dataset` | Anyone (after Approved) | `registry(32) + poll_id(32)` |
| `seal_approve_identity` | Registered voter only | `registry(32) + poll_id(32)` |

---

## Privacy Model

| On-chain (visible) | Off-chain (hidden) |
|--------------------|--------------------|
| Who submitted a vote tx | What they voted (YES/NO) |
| Nullifier hash | Which nullifier → which voter |
| Total YES / NO count | Individual choices |
| Vote timestamp | Identity secret |

Vote choice is encoded as `signal_hash = Poseidon(choice)` inside the ZK proof. The contract extracts YES/NO by comparing against precomputed hashes — `choice` is never passed as a plaintext parameter or emitted in events.

---

## Project Structure

```
orcavote/
├── move/orcavote/sources/       Move smart contracts (5 modules)
│   ├── registry.move            Core types, shared singleton
│   ├── governance.move          Poll lifecycle, voter registration
│   ├── zk_vote.move             Groth16 verification, nullifier, tally
│   ├── seal_policy.move         3 Seal approval policies
│   └── data_asset.move          Dataset registration
│
├── circuits/                    ZK circuit (Circom)
│   ├── orcavote.circom          Semaphore-style, 2911 constraints
│   └── Makefile                 Build pipeline
│
├── public/zk-circuit/           Browser artifacts
│   ├── circuit.wasm             Witness calculator (~2 MB)
│   ├── circuit_final.zkey       Proving key (~1.7 MB)
│   └── vk_bytes.bin             Arkworks VK (392 B)
│
├── src/                         React frontend
│   ├── OrcaVoteApp.tsx          Main app (3 tabs)
│   ├── DataAssetPanel.tsx       Upload + encrypt + decrypt
│   ├── ZkMerklePanel.tsx        Build tree + upload identities
│   ├── CreatePollPanel.tsx      Create poll + Seal encrypt dataset
│   ├── PollListPanel.tsx        Browse polls
│   ├── PollDetailPanel.tsx      Vote + finalize + decrypt
│   ├── seal-walrus.ts           Seal + Walrus operations
│   ├── zk-prove.ts              Browser ZK proof generation
│   └── poll-transactions.ts     Move transaction builders
│
├── docs/                        Documentation
│   ├── PRD.md                   Product requirements
│   ├── voting-flow.md           End-to-end flow
│   ├── ui-guide.md              UI walkthrough
│   ├── zk-proof.md              ZK proof system
│   ├── on-chain.md              On-chain architecture
│   └── bug-log.md               11 bugs documented
│
└── scripts/                     Debug utilities
```

---

## Quick Start

### Prerequisites

- [Sui CLI](https://docs.sui.io/build/install) + testnet wallet with SUI
- [Bun](https://bun.sh/) (or Node.js 18+)

### Deploy Contract

```bash
cd move/orcavote
sui move build
sui client publish --gas-budget 500000000
```

### Run Frontend

```bash
bun install
bun run dev          # http://localhost:5173
```

### Build ZK Circuit (optional — artifacts included)

```bash
cd circuits
npm install
make all             # compile → trusted setup → export → copy to public/
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [PRD](docs/PRD.md) | Product requirements + implementation status |
| [Voting Flow](docs/voting-flow.md) | End-to-end flow with diagrams |
| [UI Guide](docs/ui-guide.md) | Step-by-step UI walkthrough |
| [ZK Proof](docs/zk-proof.md) | Circuit architecture, inputs, encoding |
| [On-Chain](docs/on-chain.md) | Move modules, error codes, events |
| [Bug Log](docs/bug-log.md) | 11 bugs with root cause + fix |
| [Presentation](docs/presentation-script.md) | 10-15 min demo script |

---

## License

MIT

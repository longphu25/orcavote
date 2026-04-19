/// ZK Vote — Groth16 BN254 proof verification, nullifier dedup, tally update.
///
/// Vote choice is encoded inside the ZK proof as signal_hash = Poseidon1(choice).
/// The contract extracts choice by comparing signal_hash against known hashes.
/// This ensures choice is NEVER passed as a plaintext parameter or emitted in events.
module orcavote::zk_vote;

use sui::clock::Clock;
use sui::groth16;
use orcavote::registry::{Self, Registry};

// ═══════════════════════════════════════════════════════════════════
// Error codes
// ═══════════════════════════════════════════════════════════════════

const EPollNotVoting: u64 = 1;
const EPollExpired: u64 = 2;
const EDuplicateNullifier: u64 = 4;
const EInvalidProof: u64 = 5;
const EInvalidMerkleRoot: u64 = 6;
const EInvalidSignalHash: u64 = 12;

// Status
const STATUS_VOTING: u8 = 1;

// Precomputed Poseidon1 hashes of vote choices (32 bytes LE)
// These MUST match the poseidon-lite output used by the frontend.
//   Poseidon1(0) = 19014214495641488759237505126948346942972912379615652741039992445865937985820
//   Poseidon1(1) = 18586133768512220936620570745912940619677854269274689475585506675881198879027

const SIGNAL_HASH_NO: vector<u8> = vector[
    0x1c, 0xe1, 0x65, 0xcb, 0x11, 0x24, 0xed, 0x3a,
    0x0a, 0x94, 0xb4, 0xe2, 0x12, 0xaa, 0xf7, 0xe8,
    0x07, 0x9f, 0x49, 0xb2, 0xfb, 0xef, 0x91, 0x6b,
    0xc2, 0x90, 0xc5, 0x93, 0xfd, 0xa9, 0x09, 0x2a,
];

const SIGNAL_HASH_YES: vector<u8> = vector[
    0x33, 0x01, 0x82, 0x02, 0xc5, 0x7d, 0x89, 0x8b,
    0x84, 0x33, 0x8b, 0x16, 0xd1, 0xa4, 0x96, 0x0e,
    0x13, 0x3c, 0x6a, 0x4d, 0x65, 0x6c, 0xfe, 0xc1,
    0xbd, 0x62, 0xa9, 0xea, 0x00, 0x61, 0x17, 0x29,
];

// ═══════════════════════════════════════════════════════════════════
// Submit Vote
// ═══════════════════════════════════════════════════════════════════

/// Submit an anonymous vote with a Groth16 ZK proof.
///
/// Vote choice is NOT a parameter — it is extracted from the ZK proof's
/// signal_hash public input. This ensures the choice is never visible
/// as plaintext in the transaction or events.
///
/// Public inputs layout (concatenated, each 32 bytes LE):
///   [0..32]   merkle_root       — must match poll's council_root
///   [32..64]  nullifier_hash    — unique per voter per poll
///   [64..96]  signal_hash       — Poseidon1(choice), determines YES/NO
///   [96..128] external_nullifier — Poseidon1(poll_id)
public fun submit_vote(
    registry: &mut Registry,
    poll_id: ID,
    proof_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    nullifier: vector<u8>,
    clock: &Clock,
) {
    let poll = &mut registry.borrow_polls_mut()[poll_id];

    // Poll must be in Voting status
    assert!(registry::poll_status(poll) == STATUS_VOTING, EPollNotVoting);

    // Check deadline
    assert!(clock.timestamp_ms() <= registry::poll_voting_end(poll), EPollExpired);

    // Prevent double-voting
    assert!(!registry::poll_nullifiers_contains(poll, &nullifier), EDuplicateNullifier);

    // Verify merkle root in public inputs matches poll's council_root
    let root_from_proof = registry::slice(&public_inputs_bytes, 0, 32);
    assert!(root_from_proof == registry::poll_council_root(poll), EInvalidMerkleRoot);

    // Extract signal_hash from public inputs (bytes 64..96)
    let signal_hash = registry::slice(&public_inputs_bytes, 64, 96);

    // Determine choice from signal_hash
    let is_yes = signal_hash == SIGNAL_HASH_YES;
    let is_no = signal_hash == SIGNAL_HASH_NO;
    assert!(is_yes || is_no, EInvalidSignalHash);

    // Verify Groth16 proof (BN254)
    let curve = groth16::bn254();
    let pvk = groth16::pvk_from_bytes(
        registry::poll_pvk_vk_gamma_abc_g1(poll),
        registry::poll_pvk_alpha_g1_beta_g2(poll),
        registry::poll_pvk_gamma_g2_neg_pc(poll),
        registry::poll_pvk_delta_g2_neg_pc(poll),
    );
    let inputs = groth16::public_proof_inputs_from_bytes(public_inputs_bytes);
    let proof = groth16::proof_points_from_bytes(proof_bytes);

    assert!(
        groth16::verify_groth16_proof(&curve, &pvk, &inputs, &proof),
        EInvalidProof,
    );

    // Record nullifier
    registry::poll_insert_nullifier(poll, nullifier);

    // Update tally based on signal_hash (choice never exposed as plaintext)
    if (is_yes) {
        registry::poll_inc_yes(poll);
    } else {
        registry::poll_inc_no(poll);
    };

    // Event does NOT include choice — only nullifier + updated tally
    registry::emit_vote_cast(
        poll_id,
        nullifier,
        registry::poll_yes_count(poll),
        registry::poll_no_count(poll),
    );
}

// ═══════════════════════════════════════════════════════════════════
// Query
// ═══════════════════════════════════════════════════════════════════

/// Check if a nullifier has been used in a poll.
public fun is_nullifier_used(
    registry: &Registry,
    poll_id: ID,
    nullifier: vector<u8>,
): bool {
    registry::poll_nullifiers_contains(&registry.borrow_polls()[poll_id], &nullifier)
}

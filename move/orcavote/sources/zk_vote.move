/// ZK Vote — Groth16 BN254 proof verification, nullifier dedup, tally update.
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
const EInvalidChoice: u64 = 12;

// Vote choice constants
const CHOICE_NO: u8 = 0;
const CHOICE_YES: u8 = 1;

// Status
const STATUS_VOTING: u8 = 1;

// ═══════════════════════════════════════════════════════════════════
// Submit Vote
// ═══════════════════════════════════════════════════════════════════

/// Submit an anonymous vote with a Groth16 ZK proof.
///
/// Public inputs (concatenated, each 32 bytes LE):
///   [0] merkle_root    — must match poll's council_root
///   [1] nullifier_hash — unique per voter per poll
///   [2] signal_hash    — encodes vote choice
///
/// The proof demonstrates:
///   - Voter knows a secret that is a leaf in the Merkle tree.
///   - Nullifier is deterministically derived from secret + poll context.
///   - Signal hash commits to the voter's choice.
public fun submit_vote(
    registry: &mut Registry,
    poll_id: ID,
    proof_bytes: vector<u8>,
    public_inputs_bytes: vector<u8>,
    nullifier: vector<u8>,
    choice: u8,
    clock: &Clock,
) {
    let poll = &mut registry.borrow_polls_mut()[poll_id];

    // Poll must be in Voting status
    assert!(registry::poll_status(poll) == STATUS_VOTING, EPollNotVoting);

    // Check deadline
    assert!(clock.timestamp_ms() <= registry::poll_voting_end(poll), EPollExpired);

    // Validate choice
    assert!(choice == CHOICE_YES || choice == CHOICE_NO, EInvalidChoice);

    // Prevent double-voting
    assert!(!registry::poll_nullifiers_contains(poll, &nullifier), EDuplicateNullifier);

    // Verify merkle root in public inputs matches poll's council_root
    // Layout: [merkle_root(32) | nullifier_hash(32) | signal_hash(32)]
    let root_from_proof = registry::slice(&public_inputs_bytes, 0, 32);
    assert!(root_from_proof == registry::poll_council_root(poll), EInvalidMerkleRoot);

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

    // Update tally
    if (choice == CHOICE_YES) {
        registry::poll_inc_yes(poll);
    } else {
        registry::poll_inc_no(poll);
    };

    registry::emit_vote_cast(
        poll_id,
        nullifier,
        choice,
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

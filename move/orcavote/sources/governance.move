/// Governance — create polls, register voters, start voting, finalize.
///
/// Poll creation is permissionless — anyone can create a poll.
/// Poll management (register voters, start voting, force-finalize)
/// is restricted to the poll creator (stored as `admin` in Poll).
module orcavote::governance;

use sui::clock::Clock;
use sui::groth16;
use orcavote::registry::{Self, Registry};

// ═══════════════════════════════════════════════════════════════════
// Error codes
// ═══════════════════════════════════════════════════════════════════

const EPollAlreadyFinalized: u64 = 7;
const EPollNotExpired: u64 = 3;
const ENotPollAdmin: u64 = 14;

// Status constants (mirror registry)
const STATUS_SETUP: u8 = 0;
const STATUS_VOTING: u8 = 1;
const STATUS_APPROVED: u8 = 2;
const STATUS_REJECTED: u8 = 3;

// ═══════════════════════════════════════════════════════════════════
// Create Poll
// ═══════════════════════════════════════════════════════════════════

/// Create a new poll. Starts in `Setup` status.
/// Anyone can create a poll — the caller becomes the poll admin.
///
/// `vk_bytes`: Arkworks-serialized Groth16 verifying key (BN254).
public fun create_poll(
    registry: &mut Registry,
    data_blob_id: vector<u8>,
    data_seal_identity: vector<u8>,
    council_root: vector<u8>,
    threshold: u64,
    voting_end: u64,
    vk_bytes: vector<u8>,
    title: vector<u8>,
    ctx: &mut TxContext,
): ID {
    // Prepare verifying key on-chain
    let curve = groth16::bn254();
    let pvk = groth16::prepare_verifying_key(&curve, &vk_bytes);
    let pvk_parts = groth16::pvk_to_bytes(pvk);

    let poll = registry::new_poll(
        data_blob_id,
        data_seal_identity,
        council_root,
        threshold,
        voting_end,
        pvk_parts[0],
        pvk_parts[1],
        pvk_parts[2],
        pvk_parts[3],
        title,
        ctx,
    );

    let poll_id = registry::poll_id(&poll);

    registry.borrow_polls_mut().add(poll_id, poll);
    registry.borrow_poll_ids_mut().push_back(poll_id);
    registry.borrow_poll_voters_mut().add(poll_id, vector[]);

    registry::emit_poll_created(poll_id, title, threshold, voting_end, ctx.sender());

    poll_id
}

// ═══════════════════════════════════════════════════════════════════
// Register Voters
// ═══════════════════════════════════════════════════════════════════

/// Register a single voter's encrypted identity.json reference.
/// Only the poll creator can register voters.
public fun register_voter(
    registry: &mut Registry,
    poll_id: ID,
    voter: address,
    walrus_blob_id: vector<u8>,
    seal_identity: vector<u8>,
    ctx: &TxContext,
) {
    assert_poll_admin(registry, poll_id, ctx);
    registry::register_voter_ref(registry, poll_id, voter, walrus_blob_id, seal_identity);
    registry::emit_voter_registered(poll_id, voter, walrus_blob_id);
}

/// Batch register multiple voters. Only the poll creator can call.
public fun register_voters(
    registry: &mut Registry,
    poll_id: ID,
    voters: vector<address>,
    walrus_blob_ids: vector<vector<u8>>,
    seal_identities: vector<vector<u8>>,
    ctx: &TxContext,
) {
    assert_poll_admin(registry, poll_id, ctx);
    let mut i = 0;
    let len = voters.length();
    while (i < len) {
        registry::register_voter_ref(
            registry, poll_id,
            voters[i], walrus_blob_ids[i], seal_identities[i],
        );
        registry::emit_voter_registered(poll_id, voters[i], walrus_blob_ids[i]);
        i = i + 1;
    };
}

// ═══════════════════════════════════════════════════════════════════
// Update Data Blob (after Seal encrypt with poll_id)
// ═══════════════════════════════════════════════════════════════════

/// Update the dataset blob reference after Seal-encrypting with the poll's identity.
/// Only the poll admin can call. Must be called before or during Voting status.
public fun set_data_blob(
    registry: &mut Registry,
    poll_id: ID,
    data_blob_id: vector<u8>,
    data_seal_identity: vector<u8>,
    ctx: &TxContext,
) {
    assert_poll_admin(registry, poll_id, ctx);
    let poll = &mut registry.borrow_polls_mut()[poll_id];
    let status = registry::poll_status(poll);
    assert!(status == STATUS_SETUP || status == STATUS_VOTING, EPollAlreadyFinalized);
    registry::poll_set_data_blob(poll, data_blob_id);
    registry::poll_set_data_seal_identity(poll, data_seal_identity);
}

// ═══════════════════════════════════════════════════════════════════
// Start Voting
// ═══════════════════════════════════════════════════════════════════

/// Transition poll from Setup → Voting. Only the poll creator can call.
public fun start_voting(
    registry: &mut Registry,
    poll_id: ID,
    ctx: &TxContext,
) {
    assert_poll_admin(registry, poll_id, ctx);
    let poll = &mut registry.borrow_polls_mut()[poll_id];
    assert!(registry::poll_status(poll) == STATUS_SETUP, EPollAlreadyFinalized);
    registry::poll_set_status(poll, STATUS_VOTING);
}

// ═══════════════════════════════════════════════════════════════════
// Finalize
// ═══════════════════════════════════════════════════════════════════

/// Permissionless finalize after voting deadline.
public fun finalize(
    registry: &mut Registry,
    poll_id: ID,
    clock: &Clock,
) {
    let poll = &mut registry.borrow_polls_mut()[poll_id];
    assert!(registry::poll_status(poll) == STATUS_VOTING, EPollAlreadyFinalized);
    assert!(clock.timestamp_ms() > registry::poll_voting_end(poll), EPollNotExpired);

    let new_status = if (registry::poll_yes_count(poll) >= registry::poll_threshold(poll)) {
        STATUS_APPROVED
    } else {
        STATUS_REJECTED
    };
    registry::poll_set_status(poll, new_status);

    registry::emit_poll_finalized(
        poll_id, new_status,
        registry::poll_yes_count(poll),
        registry::poll_no_count(poll),
    );
}

/// Poll creator can force-finalize (early termination).
public fun admin_finalize(
    registry: &mut Registry,
    poll_id: ID,
    ctx: &TxContext,
) {
    assert_poll_admin(registry, poll_id, ctx);
    let poll = &mut registry.borrow_polls_mut()[poll_id];
    assert!(registry::poll_status(poll) == STATUS_VOTING, EPollAlreadyFinalized);

    let new_status = if (registry::poll_yes_count(poll) >= registry::poll_threshold(poll)) {
        STATUS_APPROVED
    } else {
        STATUS_REJECTED
    };
    registry::poll_set_status(poll, new_status);

    registry::emit_poll_finalized(
        poll_id, new_status,
        registry::poll_yes_count(poll),
        registry::poll_no_count(poll),
    );
}

// ═══════════════════════════════════════════════════════════════════
// Internal helpers
// ═══════════════════════════════════════════════════════════════════

/// Assert that the transaction sender is the poll creator.
fun assert_poll_admin(registry: &Registry, poll_id: ID, ctx: &TxContext) {
    let poll = &registry.borrow_polls()[poll_id];
    assert!(registry::poll_admin(poll) == ctx.sender(), ENotPollAdmin);
}

// ═══════════════════════════════════════════════════════════════════
// Query functions
// ═══════════════════════════════════════════════════════════════════

public fun poll_count(registry: &Registry): u64 {
    registry.borrow_poll_ids().length()
}

public fun poll_id_at(registry: &Registry, index: u64): ID {
    registry.borrow_poll_ids()[index]
}

public fun poll_status(registry: &Registry, poll_id: ID): u8 {
    registry::poll_status(&registry.borrow_polls()[poll_id])
}

public fun poll_tally(registry: &Registry, poll_id: ID): (u64, u64) {
    let poll = &registry.borrow_polls()[poll_id];
    (registry::poll_yes_count(poll), registry::poll_no_count(poll))
}

public fun poll_threshold(registry: &Registry, poll_id: ID): u64 {
    registry::poll_threshold(&registry.borrow_polls()[poll_id])
}

public fun poll_voting_end(registry: &Registry, poll_id: ID): u64 {
    registry::poll_voting_end(&registry.borrow_polls()[poll_id])
}

public fun poll_title(registry: &Registry, poll_id: ID): vector<u8> {
    registry::poll_title(&registry.borrow_polls()[poll_id])
}

public fun poll_total_voters(registry: &Registry, poll_id: ID): u64 {
    registry::poll_total_voters(&registry.borrow_polls()[poll_id])
}

public fun poll_council_root(registry: &Registry, poll_id: ID): vector<u8> {
    registry::poll_council_root(&registry.borrow_polls()[poll_id])
}

public fun poll_data_blob_id(registry: &Registry, poll_id: ID): vector<u8> {
    registry::poll_data_blob_id(&registry.borrow_polls()[poll_id])
}

public fun poll_data_seal_identity(registry: &Registry, poll_id: ID): vector<u8> {
    registry::poll_data_seal_identity(&registry.borrow_polls()[poll_id])
}

public fun is_voter_registered(registry: &Registry, poll_id: ID, voter: address): bool {
    let key = registry::new_voter_ref_key(poll_id, voter);
    registry.borrow_voter_refs().contains(key)
}

public fun get_voter_ref(
    registry: &Registry,
    poll_id: ID,
    voter: address,
): (vector<u8>, vector<u8>) {
    let key = registry::new_voter_ref_key(poll_id, voter);
    let ref = &registry.borrow_voter_refs()[key];
    (registry::voter_ref_walrus_blob_id(ref), registry::voter_ref_seal_identity(ref))
}

public fun poll_voter_list(registry: &Registry, poll_id: ID): vector<address> {
    *&registry.borrow_poll_voters()[poll_id]
}

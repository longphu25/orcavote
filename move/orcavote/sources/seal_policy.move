/// Seal Policy — entry functions for Seal key-server dry-run approval.
///
/// Two policies:
///   1. Identity blob: voter can decrypt their own identity.json
///   2. Dataset blob:  anyone can decrypt dataset after poll is Approved
module orcavote::seal_policy;

use orcavote::registry::{Self, Registry};

// ═══════════════════════════════════════════════════════════════════
// Error codes
// ═══════════════════════════════════════════════════════════════════

const EInvalidSealId: u64 = 9;
const ENoAccess: u64 = 8;
const EPollNotVoting: u64 = 1;
const EPollNotApproved: u64 = 10;

// Status constants
const STATUS_SETUP: u8 = 0;
const STATUS_VOTING: u8 = 1;
const STATUS_APPROVED: u8 = 2;

// ═══════════════════════════════════════════════════════════════════
// Identity Blob Approval
// ═══════════════════════════════════════════════════════════════════

/// Called by Seal key servers (dry-run) to check if caller can decrypt
/// their identity.json blob.
///
/// Approval: caller must be the registered voter for this poll.
/// `id` format: registry_object_id(32) ++ poll_id(32)
entry fun seal_approve_identity(
    id: vector<u8>,
    registry: &Registry,
    ctx: &TxContext,
) {
    // Validate id starts with registry object ID
    let registry_id_bytes = object::id(registry).to_bytes();
    assert!(registry::is_prefix(registry_id_bytes, id), EInvalidSealId);

    let caller = ctx.sender();

    // Extract poll_id from id bytes (bytes 32..64)
    let poll_id_bytes = registry::slice(&id, 32, 64);
    let poll_id = object::id_from_bytes(poll_id_bytes);

    // Caller must be a registered voter for this poll
    let key = registry::new_voter_ref_key(poll_id, caller);
    assert!(registry.borrow_voter_refs().contains(key), ENoAccess);

    // Poll must be in Setup or Voting status
    let poll = &registry.borrow_polls()[poll_id];
    let status = registry::poll_status(poll);
    assert!(status == STATUS_SETUP || status == STATUS_VOTING, EPollNotVoting);
}

// ═══════════════════════════════════════════════════════════════════
// Dataset Approval (post-vote release)
// ═══════════════════════════════════════════════════════════════════

/// Called by Seal key servers (dry-run) to check if dataset can be
/// decrypted after a poll is approved.
///
/// Approval: poll must be in Approved status.
/// `id` format: registry_object_id(32) ++ poll_id(32)
entry fun seal_approve_dataset(
    id: vector<u8>,
    registry: &Registry,
) {
    let registry_id_bytes = object::id(registry).to_bytes();
    assert!(registry::is_prefix(registry_id_bytes, id), EInvalidSealId);

    let poll_id_bytes = registry::slice(&id, 32, 64);
    let poll_id = object::id_from_bytes(poll_id_bytes);

    let poll = &registry.borrow_polls()[poll_id];
    assert!(registry::poll_status(poll) == STATUS_APPROVED, EPollNotApproved);
}

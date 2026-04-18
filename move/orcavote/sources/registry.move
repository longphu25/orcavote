/// Core types, Registry singleton, and init for OrcaVote.
///
/// This module owns all shared structs. Other modules in the package
/// access Registry internals via `public(package)` helpers.
module orcavote::registry;

use sui::table::{Self, Table};
use sui::vec_set::{Self, VecSet};

// ═══════════════════════════════════════════════════════════════════
// Error codes (shared across package)
// ═══════════════════════════════════════════════════════════════════

const EPollNotFound: u64 = 13;
const EVoterAlreadyRegistered: u64 = 11;

// Poll status constants
const STATUS_SETUP: u8 = 0;

// ═══════════════════════════════════════════════════════════════════
// One-time witness
// ═══════════════════════════════════════════════════════════════════

public struct REGISTRY has drop {}

// ═══════════════════════════════════════════════════════════════════
// Admin capability
// ═══════════════════════════════════════════════════════════════════

/// Whoever holds this can create polls, register voters, manage assets.
public struct AdminCap has key, store {
    id: UID,
}

// ═══════════════════════════════════════════════════════════════════
// Registry — shared singleton
// ═══════════════════════════════════════════════════════════════════

/// All on-chain queries go through this shared object.
public struct Registry has key {
    id: UID,
    polls: Table<ID, Poll>,
    data_assets: Table<ID, DataAsset>,
    voter_refs: Table<VoterRefKey, VoterIdentityRef>,
    poll_ids: vector<ID>,
    data_asset_ids: vector<ID>,
    poll_voters: Table<ID, vector<address>>,
}

// ═══════════════════════════════════════════════════════════════════
// DataAsset
// ═══════════════════════════════════════════════════════════════════

public struct DataAsset has store, copy, drop {
    asset_id: ID,
    walrus_blob_id: vector<u8>,
    seal_identity: vector<u8>,
    owner: address,
    name: vector<u8>,
}

// ═══════════════════════════════════════════════════════════════════
// Poll
// ═══════════════════════════════════════════════════════════════════

public struct Poll has store {
    poll_id: ID,
    data_blob_id: vector<u8>,
    data_seal_identity: vector<u8>,
    council_root: vector<u8>,
    threshold: u64,
    total_voters: u64,
    voting_end: u64,
    status: u8,
    yes_count: u64,
    no_count: u64,
    nullifiers: VecSet<vector<u8>>,
    pvk_vk_gamma_abc_g1: vector<u8>,
    pvk_alpha_g1_beta_g2: vector<u8>,
    pvk_gamma_g2_neg_pc: vector<u8>,
    pvk_delta_g2_neg_pc: vector<u8>,
    title: vector<u8>,
    admin: address,
}

// ═══════════════════════════════════════════════════════════════════
// VoterIdentityRef
// ═══════════════════════════════════════════════════════════════════

public struct VoterRefKey has store, copy, drop {
    poll_id: ID,
    voter: address,
}

public struct VoterIdentityRef has store, copy, drop {
    poll_id: ID,
    voter: address,
    walrus_blob_id: vector<u8>,
    seal_identity: vector<u8>,
}

// ═══════════════════════════════════════════════════════════════════
// Events
// ═══════════════════════════════════════════════════════════════════

public struct PollCreated has copy, drop {
    poll_id: ID,
    title: vector<u8>,
    threshold: u64,
    voting_end: u64,
    admin: address,
}

public struct VoterRegistered has copy, drop {
    poll_id: ID,
    voter: address,
    walrus_blob_id: vector<u8>,
}

public struct VoteCast has copy, drop {
    poll_id: ID,
    nullifier: vector<u8>,
    choice: u8,
    yes_count: u64,
    no_count: u64,
}

public struct PollFinalized has copy, drop {
    poll_id: ID,
    status: u8,
    yes_count: u64,
    no_count: u64,
}

public struct DataAssetRegistered has copy, drop {
    asset_id: ID,
    owner: address,
    name: vector<u8>,
}

// ═══════════════════════════════════════════════════════════════════
// Init
// ═══════════════════════════════════════════════════════════════════

fun init(_otw: REGISTRY, ctx: &mut TxContext) {
    let registry = Registry {
        id: object::new(ctx),
        polls: table::new(ctx),
        data_assets: table::new(ctx),
        voter_refs: table::new(ctx),
        poll_ids: vector[],
        data_asset_ids: vector[],
        poll_voters: table::new(ctx),
    };
    transfer::share_object(registry);

    let admin_cap = AdminCap { id: object::new(ctx) };
    transfer::transfer(admin_cap, ctx.sender());
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(REGISTRY {}, ctx);
}

// ═══════════════════════════════════════════════════════════════════
// public(package) accessors — used by sibling modules
// ═══════════════════════════════════════════════════════════════════

// ── Registry field access ──

public(package) fun borrow_polls(r: &Registry): &Table<ID, Poll> { &r.polls }
public(package) fun borrow_polls_mut(r: &mut Registry): &mut Table<ID, Poll> { &mut r.polls }

public(package) fun borrow_data_assets(r: &Registry): &Table<ID, DataAsset> { &r.data_assets }
public(package) fun borrow_data_assets_mut(r: &mut Registry): &mut Table<ID, DataAsset> { &mut r.data_assets }

public(package) fun borrow_voter_refs(r: &Registry): &Table<VoterRefKey, VoterIdentityRef> { &r.voter_refs }
public(package) fun borrow_voter_refs_mut(r: &mut Registry): &mut Table<VoterRefKey, VoterIdentityRef> { &mut r.voter_refs }

public(package) fun borrow_poll_ids(r: &Registry): &vector<ID> { &r.poll_ids }
public(package) fun borrow_poll_ids_mut(r: &mut Registry): &mut vector<ID> { &mut r.poll_ids }

public(package) fun borrow_data_asset_ids(r: &Registry): &vector<ID> { &r.data_asset_ids }
public(package) fun borrow_data_asset_ids_mut(r: &mut Registry): &mut vector<ID> { &mut r.data_asset_ids }

public(package) fun borrow_poll_voters(r: &Registry): &Table<ID, vector<address>> { &r.poll_voters }
public(package) fun borrow_poll_voters_mut(r: &mut Registry): &mut Table<ID, vector<address>> { &mut r.poll_voters }

// ── DataAsset constructors / accessors ──

public(package) fun new_data_asset(
    asset_id: ID,
    walrus_blob_id: vector<u8>,
    seal_identity: vector<u8>,
    owner: address,
    name: vector<u8>,
): DataAsset {
    DataAsset { asset_id, walrus_blob_id, seal_identity, owner, name }
}

public fun data_asset_blob_id(a: &DataAsset): vector<u8> { a.walrus_blob_id }
public fun data_asset_seal_identity(a: &DataAsset): vector<u8> { a.seal_identity }
public fun data_asset_owner(a: &DataAsset): address { a.owner }
public fun data_asset_name(a: &DataAsset): vector<u8> { a.name }

// ── Poll constructors / accessors ──

public(package) fun new_poll(
    data_blob_id: vector<u8>,
    data_seal_identity: vector<u8>,
    council_root: vector<u8>,
    threshold: u64,
    voting_end: u64,
    pvk_vk_gamma_abc_g1: vector<u8>,
    pvk_alpha_g1_beta_g2: vector<u8>,
    pvk_gamma_g2_neg_pc: vector<u8>,
    pvk_delta_g2_neg_pc: vector<u8>,
    title: vector<u8>,
    ctx: &mut TxContext,
): Poll {
    let uid = object::new(ctx);
    let poll_id = uid.to_inner();
    object::delete(uid);

    Poll {
        poll_id,
        data_blob_id,
        data_seal_identity,
        council_root,
        threshold,
        total_voters: 0,
        voting_end,
        status: STATUS_SETUP,
        yes_count: 0,
        no_count: 0,
        nullifiers: vec_set::empty(),
        pvk_vk_gamma_abc_g1,
        pvk_alpha_g1_beta_g2,
        pvk_gamma_g2_neg_pc,
        pvk_delta_g2_neg_pc,
        title,
        admin: ctx.sender(),
    }
}

public fun poll_id(p: &Poll): ID { p.poll_id }
public fun poll_data_blob_id(p: &Poll): vector<u8> { p.data_blob_id }
public fun poll_data_seal_identity(p: &Poll): vector<u8> { p.data_seal_identity }
public fun poll_council_root(p: &Poll): vector<u8> { p.council_root }
public fun poll_threshold(p: &Poll): u64 { p.threshold }
public fun poll_total_voters(p: &Poll): u64 { p.total_voters }
public fun poll_voting_end(p: &Poll): u64 { p.voting_end }
public fun poll_status(p: &Poll): u8 { p.status }
public fun poll_yes_count(p: &Poll): u64 { p.yes_count }
public fun poll_no_count(p: &Poll): u64 { p.no_count }
public fun poll_title(p: &Poll): vector<u8> { p.title }
public fun poll_admin(p: &Poll): address { p.admin }
public fun poll_nullifiers_contains(p: &Poll, n: &vector<u8>): bool { p.nullifiers.contains(n) }

public(package) fun poll_set_status(p: &mut Poll, s: u8) { p.status = s; }
public(package) fun poll_inc_total_voters(p: &mut Poll) { p.total_voters = p.total_voters + 1; }
public(package) fun poll_inc_yes(p: &mut Poll) { p.yes_count = p.yes_count + 1; }
public(package) fun poll_inc_no(p: &mut Poll) { p.no_count = p.no_count + 1; }
public(package) fun poll_insert_nullifier(p: &mut Poll, n: vector<u8>) { p.nullifiers.insert(n); }

public(package) fun poll_pvk_vk_gamma_abc_g1(p: &Poll): vector<u8> { p.pvk_vk_gamma_abc_g1 }
public(package) fun poll_pvk_alpha_g1_beta_g2(p: &Poll): vector<u8> { p.pvk_alpha_g1_beta_g2 }
public(package) fun poll_pvk_gamma_g2_neg_pc(p: &Poll): vector<u8> { p.pvk_gamma_g2_neg_pc }
public(package) fun poll_pvk_delta_g2_neg_pc(p: &Poll): vector<u8> { p.pvk_delta_g2_neg_pc }

// ── VoterRefKey / VoterIdentityRef constructors / accessors ──

public(package) fun new_voter_ref_key(poll_id: ID, voter: address): VoterRefKey {
    VoterRefKey { poll_id, voter }
}

public(package) fun new_voter_identity_ref(
    poll_id: ID,
    voter: address,
    walrus_blob_id: vector<u8>,
    seal_identity: vector<u8>,
): VoterIdentityRef {
    VoterIdentityRef { poll_id, voter, walrus_blob_id, seal_identity }
}

public fun voter_ref_walrus_blob_id(r: &VoterIdentityRef): vector<u8> { r.walrus_blob_id }
public fun voter_ref_seal_identity(r: &VoterIdentityRef): vector<u8> { r.seal_identity }

// ── Event constructors ──

public(package) fun emit_poll_created(poll_id: ID, title: vector<u8>, threshold: u64, voting_end: u64, admin: address) {
    sui::event::emit(PollCreated { poll_id, title, threshold, voting_end, admin });
}

public(package) fun emit_voter_registered(poll_id: ID, voter: address, walrus_blob_id: vector<u8>) {
    sui::event::emit(VoterRegistered { poll_id, voter, walrus_blob_id });
}

public(package) fun emit_vote_cast(poll_id: ID, nullifier: vector<u8>, choice: u8, yes_count: u64, no_count: u64) {
    sui::event::emit(VoteCast { poll_id, nullifier, choice, yes_count, no_count });
}

public(package) fun emit_poll_finalized(poll_id: ID, status: u8, yes_count: u64, no_count: u64) {
    sui::event::emit(PollFinalized { poll_id, status, yes_count, no_count });
}

public(package) fun emit_data_asset_registered(asset_id: ID, owner: address, name: vector<u8>) {
    sui::event::emit(DataAssetRegistered { asset_id, owner, name });
}

// ── Voter registration helper (keeps assertion logic centralized) ──

public(package) fun register_voter_ref(
    registry: &mut Registry,
    poll_id: ID,
    voter: address,
    walrus_blob_id: vector<u8>,
    seal_identity: vector<u8>,
) {
    assert!(registry.polls.contains(poll_id), EPollNotFound);

    let key = VoterRefKey { poll_id, voter };
    assert!(!registry.voter_refs.contains(key), EVoterAlreadyRegistered);

    let ref = VoterIdentityRef { poll_id, voter, walrus_blob_id, seal_identity };
    registry.voter_refs.add(key, ref);

    let poll = &mut registry.polls[poll_id];
    poll.total_voters = poll.total_voters + 1;

    let voters = &mut registry.poll_voters[poll_id];
    voters.push_back(voter);
}

// ═══════════════════════════════════════════════════════════════════
// Byte helpers (package-visible)
// ═══════════════════════════════════════════════════════════════════

public(package) fun is_prefix(prefix: vector<u8>, data: vector<u8>): bool {
    if (prefix.length() > data.length()) return false;
    let mut i = 0;
    while (i < prefix.length()) {
        if (prefix[i] != data[i]) return false;
        i = i + 1;
    };
    true
}

public(package) fun slice(data: &vector<u8>, start: u64, end: u64): vector<u8> {
    let mut result = vector[];
    let mut i = start;
    while (i < end) {
        result.push_back(data[i]);
        i = i + 1;
    };
    result
}

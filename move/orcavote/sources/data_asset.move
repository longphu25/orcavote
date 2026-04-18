/// DataAsset management — register encrypted datasets.
/// Registration is permissionless — anyone can register a dataset.
module orcavote::data_asset;

use orcavote::registry::{Self, Registry};

/// Register a new encrypted dataset. Emits `DataAssetRegistered`.
/// Anyone can register — the caller is recorded as the owner.
public fun register(
    registry: &mut Registry,
    walrus_blob_id: vector<u8>,
    seal_identity: vector<u8>,
    name: vector<u8>,
    ctx: &mut TxContext,
) {
    let uid = object::new(ctx);
    let asset_id = uid.to_inner();
    object::delete(uid);

    let asset = registry::new_data_asset(
        asset_id,
        walrus_blob_id,
        seal_identity,
        ctx.sender(),
        name,
    );

    registry.borrow_data_assets_mut().add(asset_id, asset);
    registry.borrow_data_asset_ids_mut().push_back(asset_id);

    registry::emit_data_asset_registered(asset_id, ctx.sender(), name);
}

// ═══════════════════════════════════════════════════════════════════
// Query functions
// ═══════════════════════════════════════════════════════════════════

/// Number of registered data assets.
public fun count(registry: &Registry): u64 {
    registry.borrow_data_asset_ids().length()
}

/// Get data asset ID by index.
public fun id_at(registry: &Registry, index: u64): ID {
    registry.borrow_data_asset_ids()[index]
}

/// Get data asset details: (walrus_blob_id, seal_identity, owner, name).
public fun get(
    registry: &Registry,
    asset_id: ID,
): (vector<u8>, vector<u8>, address, vector<u8>) {
    let asset = &registry.borrow_data_assets()[asset_id];
    (
        registry::data_asset_blob_id(asset),
        registry::data_asset_seal_identity(asset),
        registry::data_asset_owner(asset),
        registry::data_asset_name(asset),
    )
}

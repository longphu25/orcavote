pragma circom 2.0.0;

include "node_modules/circomlib/circuits/poseidon.circom";

/// OrcaVote Semaphore-style circuit (BN254)
///
/// Proves:
///   1. Voter knows identity_secret that is a leaf in the Merkle tree
///   2. Nullifier is deterministically derived (prevents double-vote)
///   3. Signal hash commits to the vote choice
///
/// Public inputs:  merkle_root, nullifier_hash, signal_hash, external_nullifier
/// Private inputs: identity_secret, path_elements[], path_indices[]

/// Hash left-right pair using Poseidon, selecting order based on a selector bit.
template HashLeftRight() {
    signal input left;
    signal input right;
    signal input selector; // 0 = (left, right), 1 = (right, left)

    // Constrain selector to be 0 or 1
    selector * (1 - selector) === 0;

    signal diff;
    diff <== left - right;

    component hasher = Poseidon(2);
    hasher.inputs[0] <== left - selector * diff;
    hasher.inputs[1] <== right + selector * diff;

    signal output hash;
    hash <== hasher.out;
}

/// Poseidon Merkle inclusion proof.
/// Verifies that a leaf is in a Merkle tree with the given root.
template MerkleTreeInclusionProof(nLevels) {
    signal input leaf;
    signal input path_elements[nLevels];
    signal input path_indices[nLevels]; // 0 = left, 1 = right

    signal output root;

    component hashers[nLevels];

    signal hashes[nLevels + 1];
    hashes[0] <== leaf;

    for (var i = 0; i < nLevels; i++) {
        hashers[i] = HashLeftRight();
        hashers[i].left <== hashes[i];
        hashers[i].right <== path_elements[i];
        hashers[i].selector <== path_indices[i];
        hashes[i + 1] <== hashers[i].hash;
    }

    root <== hashes[nLevels];
}

/// Main OrcaVote circuit.
/// TREE_DEPTH should match the Merkle tree depth used by the WASM identity builder.
template OrcaVote(TREE_DEPTH) {
    // Public inputs
    signal input merkle_root;
    signal input nullifier_hash;
    signal input signal_hash;
    signal input external_nullifier;

    // Private inputs
    signal input identity_secret;
    signal input path_elements[TREE_DEPTH];
    signal input path_indices[TREE_DEPTH];

    // 1. Compute identity_commitment = Poseidon(identity_secret)
    component commitHasher = Poseidon(1);
    commitHasher.inputs[0] <== identity_secret;
    signal identity_commitment;
    identity_commitment <== commitHasher.out;

    // 2. Verify Merkle inclusion: commitment is a leaf in the tree
    component tree = MerkleTreeInclusionProof(TREE_DEPTH);
    tree.leaf <== identity_commitment;
    for (var i = 0; i < TREE_DEPTH; i++) {
        tree.path_elements[i] <== path_elements[i];
        tree.path_indices[i] <== path_indices[i];
    }
    // Constrain: computed root must equal the public merkle_root
    tree.root === merkle_root;

    // 3. Compute nullifier = Poseidon(identity_secret, external_nullifier)
    //    This is deterministic per voter per poll — prevents double-voting
    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== identity_secret;
    nullifierHasher.inputs[1] <== external_nullifier;
    // Constrain: computed nullifier must equal the public nullifier_hash
    nullifierHasher.out === nullifier_hash;

    // 4. Square signal_hash to create a constraint on it
    //    (ensures signal_hash is actually used in the circuit)
    signal signal_hash_sq;
    signal_hash_sq <== signal_hash * signal_hash;
}

// Instantiate with tree depth 10 (supports up to 2^10 = 1024 voters)
// Sufficient for MVP. Increase to 15 or 20 for production if needed.
component main {public [merkle_root, nullifier_hash, signal_hash, external_nullifier]} = OrcaVote(10);

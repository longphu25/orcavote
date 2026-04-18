# OrcaVote ZK Circuit — Compile, Setup, Export
#
# Prerequisites: circom, snarkjs (npm)
# Output goes to build/ and is copied to ../public/zk-circuit/

CIRCUIT    := orcavote
TREE_DEPTH := 20
PTAU_POWER := 14
BUILD      := build
OUTPUT     := ../public/zk-circuit

.PHONY: all clean compile setup export copy info

## Full pipeline: compile → setup → export → copy to public/
all: copy

## 1. Compile circuit with circom
compile: $(BUILD)/$(CIRCUIT).r1cs

$(BUILD)/$(CIRCUIT).r1cs: $(CIRCUIT).circom
	@mkdir -p $(BUILD)
	circom $(CIRCUIT).circom \
		--r1cs --wasm --sym \
		-o $(BUILD) \
		-l node_modules
	@echo "✓ Compiled: $(BUILD)/$(CIRCUIT).r1cs + $(BUILD)/$(CIRCUIT)_js/$(CIRCUIT).wasm"

## 2. Trusted setup (powers of tau + Groth16 zkey)
setup: $(BUILD)/$(CIRCUIT)_final.zkey

# Download or generate powers of tau
$(BUILD)/pot$(PTAU_POWER)_final.ptau:
	@mkdir -p $(BUILD)
	@echo "Downloading powers of tau (2^$(PTAU_POWER))..."
	curl -L -o $(BUILD)/pot$(PTAU_POWER)_0000.ptau \
		"https://storage.googleapis.com/zkevm/ptau/powersOfTau28_hez_final_$(PTAU_POWER).ptau"
	@cp $(BUILD)/pot$(PTAU_POWER)_0000.ptau $(BUILD)/pot$(PTAU_POWER)_final.ptau
	@echo "✓ Powers of tau ready"

# Generate zkey
$(BUILD)/$(CIRCUIT)_final.zkey: $(BUILD)/$(CIRCUIT).r1cs $(BUILD)/pot$(PTAU_POWER)_final.ptau
	@echo "Generating initial zkey..."
	npx snarkjs groth16 setup \
		$(BUILD)/$(CIRCUIT).r1cs \
		$(BUILD)/pot$(PTAU_POWER)_final.ptau \
		$(BUILD)/$(CIRCUIT)_0000.zkey
	@echo "Contributing to ceremony..."
	npx snarkjs zkey contribute \
		$(BUILD)/$(CIRCUIT)_0000.zkey \
		$(BUILD)/$(CIRCUIT)_final.zkey \
		--name="OrcaVote Dev Ceremony" -v -e="orcavote-random-entropy-$(shell date +%s)"
	@echo "✓ Final zkey ready"

## 3. Export verification key
export: $(BUILD)/verification_key.json

$(BUILD)/verification_key.json: $(BUILD)/$(CIRCUIT)_final.zkey
	npx snarkjs zkey export verificationkey \
		$(BUILD)/$(CIRCUIT)_final.zkey \
		$(BUILD)/verification_key.json
	@echo "✓ Verification key exported"

## 4. Copy artifacts to public/ for browser use
copy: export
	@mkdir -p $(OUTPUT)
	cp $(BUILD)/$(CIRCUIT)_js/$(CIRCUIT).wasm $(OUTPUT)/circuit.wasm
	cp $(BUILD)/$(CIRCUIT)_final.zkey $(OUTPUT)/circuit_final.zkey
	cp $(BUILD)/verification_key.json $(OUTPUT)/verification_key.json
	node export-vk-bytes.mjs
	cp $(BUILD)/vk_bytes.bin $(OUTPUT)/vk_bytes.bin
	@echo ""
	@echo "═══════════════════════════════════════════"
	@echo "  ZK Circuit artifacts ready in $(OUTPUT)/"
	@echo ""
	@echo "  circuit.wasm            — witness calculator (browser)"
	@echo "  circuit_final.zkey      — proving key (browser)"
	@echo "  verification_key.json   — human-readable VK"
	@echo "  vk_bytes.bin            — Arkworks VK for create_poll"
	@echo "═══════════════════════════════════════════"

## Print circuit info
info: $(BUILD)/$(CIRCUIT).r1cs
	npx snarkjs r1cs info $(BUILD)/$(CIRCUIT).r1cs

## Clean build artifacts
clean:
	rm -rf $(BUILD) $(OUTPUT)

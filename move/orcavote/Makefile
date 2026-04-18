# OrcaVote Move Contract — Build, Test, Deploy

PACKAGE_DIR := .
GAS_BUDGET  := 200000000

.PHONY: build test deploy clean-publish deploy-fresh lint

## Build the Move package
build:
	sui move build

## Run unit tests
test:
	sui move test

## Lint / check without building artifacts
lint:
	sui move build --lint

## Deploy to the active Sui network (testnet/mainnet)
## Fails if already published — use `deploy-fresh` instead
deploy:
	sui client publish --gas-budget $(GAS_BUDGET)

## Remove Published.toml and deploy as a brand-new package
deploy-fresh:
	rm -f Published.toml
	sui client publish --gas-budget $(GAS_BUDGET)

## Remove Published.toml only (useful before manual deploy)
clean-publish:
	rm -f Published.toml
	@echo "Published.toml removed. You can now run 'make deploy'."

## Show active Sui environment and address
info:
	@echo "=== Environment ==="
	@sui client active-env
	@echo "=== Address ==="
	@sui client active-address
	@echo "=== Gas ==="
	@sui client gas

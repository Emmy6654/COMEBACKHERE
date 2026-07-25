.PHONY: update-abi-snapshots check-abi-snapshots dev test lint deploy-testnet abi-snapshot

# Regenerate committed ABI metadata under abis/ (deterministic; LC_ALL=C).
# Assumes COMEBACKHERE-contracts/ is a sibling directory.
update-abi-snapshots:
	@./scripts/generate_abi_metadata.sh abis

# Verify abis/ matches freshly generated metadata (no writes).
check-abi-snapshots:
	@./scripts/generate_abi_metadata.sh /tmp/comebackhere-abis-check
	@diff -ru abis/ /tmp/comebackhere-abis-check/

dev:
	docker-compose up -d

test:
	cargo test --manifest-path COMEBACKHERE-contracts/Cargo.toml

lint:
	@./scripts/lint-docs.sh && cargo clippy --manifest-path COMEBACKHERE-contracts/Cargo.toml -- -D warnings && (cd frontend && npx eslint src --ext ts,tsx --report-unused-disable-directives)

deploy-testnet:
	@test -n "$$STELLAR_NETWORK" || (echo "ERROR: STELLAR_NETWORK is not set" && exit 1)
	@test -n "$$DEPLOYER_SECRET" || (echo "ERROR: DEPLOYER_SECRET is not set" && exit 1)
	@./scripts/deploy_testnet.sh

abi-snapshot:
	@$(MAKE) update-abi-snapshots

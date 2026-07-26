#!/usr/bin/env bash
# scripts/check_abi_snapshots_precommit.sh
#
# Pre-commit wrapper around `make check-abi-snapshots`.
#
# Runs the same check CI runs to verify that the committed ABI metadata
# under abis/ matches what `COMEBACKHERE-contracts/` currently produces.
# On failure, prints a clear remediation message pointing the developer
# at `make update-abi-snapshots` instead of dumping a noisy diff.
#
# Skipped gracefully if the COMEBACKHERE-contracts sibling workspace is
# not present locally, since pre-commit hooks should not block unrelated
# commits when the environment lacks the prerequisites.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -d "$ROOT/COMEBACKHERE-contracts" && ! -d "$ROOT/../COMEBACKHERE-contracts" ]]; then
  echo "check-abi-snapshots: skipping (COMEBACKHERE-contracts/ sibling not found locally)."
  exit 0
fi

if ! command -v make >/dev/null 2>&1; then
  echo "check-abi-snapshots: skipping (make not installed in this environment)."
  exit 0
fi

if make -C "$ROOT" check-abi-snapshots; then
  exit 0
fi

cat >&2 <<'EOF'
ERROR: ABI snapshots in abis/ are out of sync with COMEBACKHERE-contracts/.

To fix this, abort the current commit attempt and re-commit after
regenerating the snapshots:

    # 1. Abort the in-flight commit attempt (this script is running as a
    #    pre-commit hook, so `git commit --amend` would not work here).
    git commit --no-verify

    # 2. Regenerate the snapshots.
    make update-abi-snapshots

    # 3. Re-stage and commit the regenerated files.
    git add abis/
    git commit -m '<your message>'

(Or, if you do not have the COMEBACKHERE-contracts sibling cloned, clone
it first: `git clone https://github.com/WHEELBACK/COMEBACKHERE-contracts ../COMEBACKHERE-contracts`.)
EOF
exit 1

#!/bin/bash
set -e

# Generate coverage report for COMEBACKHERE contract tests.
# Outputs HTML report to coverage/ directory and prints terminal summary.
# Run from inside COMEBACKHERE-contracts/ or pass CONTRACTS_DIR.

CONTRACTS_DIR="${CONTRACTS_DIR:-../COMEBACKHERE-contracts}"

echo "Generating coverage report for COMEBACKHERE contract tests..."

(cd "$CONTRACTS_DIR" && cargo llvm-cov --html --output-dir ../COMEBACKHERE/coverage)

echo ""
echo "✓ Coverage report generated"
echo "  HTML report: coverage/index.html"
echo "  LCOV file:   coverage/lcov.info"
echo ""
echo "Open coverage/index.html in a browser to view the detailed report."

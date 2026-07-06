#!/bin/bash
set -e

# Lint markdown documentation
# Enforces style rules: no trailing spaces, consistent heading levels, consistent list style

echo "Linting markdown documentation..."

npx markdownlint-cli2 "**/*.md" "#node_modules" || {
  echo "✗ Markdown linting failed"
  echo "  Fix issues or run: npx markdownlint-cli2 --fix \"**/*.md\" \"#node_modules\""
  exit 1
}

echo "✓ Markdown linting passed"

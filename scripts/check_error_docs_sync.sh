#!/usr/bin/env bash
# scripts/check_error_docs_sync.sh
#
# Verify that every error variant declared in `contracts/` and
# `COMEBACKHERE-contracts/` is documented in `docs/error-codes.md`.
#
# This is a deliberately small grep/regex-based check; it intentionally
# avoids a full Rust AST parser. It emits one CI failure category: a
# variant name in code that has no matching row in any error table of
# docs/error-codes.md.
#
# Ignore list (used in addition to the always-ignored test stub enum):
#
#   - Environment variable $CHECK_ERROR_DOCS_IGNORE may point to a file
#   - Default file is $ROOT/.check-error-codes-ignore
#
#   Each non-empty, non-comment line of the ignore file is prefixed:
#       enum:<EnumName>     # skip all variants of this enum (e.g. test stubs)
#       var:<VariantName>   # skip this variant by name (any enum)
#
# Pass: exits 0 with a success message.
# Fail: exits 1 and lists undocumented variant names with the enum(s) that
#       declare them.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCS="$ROOT/docs/error-codes.md"
IGNORE_FILE="${CHECK_ERROR_DOCS_IGNORE:-$ROOT/.check-error-codes-ignore}"

# -----------------------------------------------------------------------------
# 1. Parse ignore list.
# -----------------------------------------------------------------------------
declare -A IGNORE_ENUMS=()
declare -A IGNORE_VARIANTS=()

# Default: always skip the in-test stub enum.
IGNORE_ENUMS[StubError]=1

if [[ -f "$IGNORE_FILE" ]]; then
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    line="${raw%%#*}"
    line="${line## }"; line="${line%% }"
    [[ -z "$line" ]] && continue
    case "$line" in
      enum:*) IGNORE_ENUMS["${line#enum:}"]=1 ;;
      var:*)  IGNORE_VARIANTS["${line#var:}"]=1 ;;
      *)      echo "WARN: unrecognized ignore entry '$line' (expected enum:Name or var:Name)" >&2 ;;
    esac
  done < "$IGNORE_FILE"
fi

# -----------------------------------------------------------------------------
# 2. Scan contract sources for enum/variant tuples.
# -----------------------------------------------------------------------------
CODE_DIRS=(
  "$ROOT/contracts/invoice/src"
  "$ROOT/contracts/settlement/src"
  "$ROOT/COMEBACKHERE-contracts/contracts/invoice/src"
  "$ROOT/COMEBACKHERE-contracts/contracts/treasury/src"
  "$ROOT/COMEBACKHERE-contracts/contracts/compliance/src"
)

# Emit `<enum>\t<variant>` per line. Each Rust file is processed by awk.
TMP_CODE="$(mktemp)"
DOC_VARIANTS_TMP="$(mktemp)"
trap 'rm -f "$TMP_CODE" "$DOC_VARIANTS_TMP"' EXIT

for d in "${CODE_DIRS[@]}"; do
  [[ -d "$d" ]] || continue
  while IFS= read -r -d '' f; do
    awk '
      function emit(line,    n, parts, i, s, m, tok) {
        if (!in_enum) return
        n = split(line, parts, ",")
        for (i = 1; i <= n; i++) {
          s = parts[i]
          # Strip an enum-header token that could leak onto the opening line.
          sub(/^pub[[:space:]]+enum[[:space:]]+[A-Za-z][A-Za-z0-9_]*Error[[:space:]]*\{?[[:space:]]*/, "", s)
          gsub(/^[[:space:]]+|[[:space:]]+$/, "", s)
          if (s == "" || s == "}") continue
          # First whitespace-delimited token must be an UpperCamelCase
          # identifier for it to be a variant name (e.g. "Foo", "Bar = 5").
          m = split(s, toks, /[[:space:]]+/)
          if (m >= 1 && toks[1] ~ /^[A-Z][A-Za-z0-9_]*$/) {
            printf("%s\t%s\n", enum_name, toks[1])
          }
        }
      }

      BEGIN { in_enum = 0; depth = 0; enum_name = "" }

      {
        if (!in_enum) {
          # Match `enum XError {`, optionally preceded by `pub`.
          if (match($0, /enum[[:space:]]+[A-Za-z][A-Za-z0-9_]*Error[[:space:]]*\{/)) {
            s = substr($0, RSTART, RLENGTH)
            sub(/^enum[[:space:]]+/, "", s)
            sub(/[[:space:]]*\{.*$/, "", s)
            enum_name = s
            in_enum = 1
            # Count braces on the opening line for cross-line tracking.
            n_open  = gsub(/\{/, "&", $0)
            n_close = gsub(/\}/, "&", $0)
            depth = n_open - n_close
            emit($0)
            if (depth <= 0) in_enum = 0
          }
        } else {
          emit($0)
          n_open  = gsub(/\{/, "&", $0)
          n_close = gsub(/\}/, "&", $0)
          depth += n_open - n_close
          if (depth <= 0) in_enum = 0
        }
      }
    ' "$f" >> "$TMP_CODE"
  done < <(find "$d" -maxdepth 1 -name '*.rs' -type f -print0)
done

# -----------------------------------------------------------------------------
# 3. Parse docs/error-codes.md for documented variant names.
# -----------------------------------------------------------------------------
# Rows like: | 1 | `Unauthorized` | ...; capture the backticked identifier.
grep -oE '\|[[:space:]]*[0-9]+[[:space:]]*\|[[:space:]]*`[A-Z][A-Za-z0-9_]*`' "$DOCS" \
  | grep -oE '`[A-Z][A-Za-z0-9_]*`' \
  | tr -d '`' \
  | sort -u > "$DOC_VARIANTS_TMP"

declare -A DOC_SET=()
while IFS= read -r v; do
  [[ -z "$v" ]] && continue
  DOC_SET["$v"]=1
done < "$DOC_VARIANTS_TMP"

# -----------------------------------------------------------------------------
# 4. Compare code vs docs and report drift.
# -----------------------------------------------------------------------------
declare -A SEEN=()
declare -A SOURCE_ENUMS=()   # variant -> "EnumName, ..." (for error messages)

while IFS=$'\t' read -r enum variant || [[ -n "$enum$variant" ]]; do
  [[ -z "$variant" ]] && continue
  [[ -n "${IGNORE_ENUMS[$enum]:-}" ]] && continue
  [[ -n "${IGNORE_VARIANTS[$variant]:-}" ]] && continue
  # Only emit one entry per (variant) for visibility, but record all enums that use it.
  if [[ -z "${SEEN[$variant]:-}" ]]; then
    SEEN[$variant]=1
    if [[ -z "${DOC_SET[$variant]:-}" ]]; then
      SOURCE_ENUMS["$variant"]="$enum"
    fi
  elif [[ -z "${DOC_SET[$variant]:-}" ]]; then
    SOURCE_ENUMS["$variant"]="${SOURCE_ENUMS[$variant]}, $enum"
  fi
done < "$TMP_CODE"

if [[ "${#SOURCE_ENUMS[@]}" -gt 0 ]]; then
  {
    echo "ERROR: contract error variants in code are not documented in $DOCS:"
    # Sort by variant name so output is deterministic.
    for v in $(printf '%s\n' "${!SOURCE_ENUMS[@]}" | sort); do
      printf "  - %s (used by: %s)\n" "$v" "${SOURCE_ENUMS[$v]}"
    done
    echo ""
    echo "Fix: add a row to a table in $DOCS for each missing variant, or"
    echo "extend $IGNORE_FILE with 'enum:<Name>' or 'var:<Name>' entries for"
    echo "intentionally-undocumented variants."
  } >&2
  exit 1
fi

echo "OK: all contract error variants from contracts/ and COMEBACKHERE-contracts/ are documented in $DOCS"

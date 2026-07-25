#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-}"
ENV_LABEL="${2:-deployment}"

if [[ -n "$ENV_FILE" && -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a
  source "$ENV_FILE"
  set +a
fi

declare -a missing=()
declare -a invalid=()

require_var() {
  local name="$1"
  local hint="$2"
  local value="${!name:-}"

  if [[ -z "$value" ]]; then
    echo "Error: Required environment variable '$name' is missing or empty." >&2
    echo "Set it in your shell or in ${ENV_FILE:-the environment file} before running this ${ENV_LABEL}." >&2
    echo "Hint: $hint" >&2
    missing+=("$name")
    return 1
  fi

  case "$name" in
    ADMIN_PUBLIC_KEY|CONTRACT_ADMIN)
      if [[ "$value" != G* ]]; then
        echo "Error: '$name' must start with 'G' for a Stellar public key." >&2
        echo "Hint: use a valid public key such as G..." >&2
        invalid+=("$name")
        return 1
      fi
      ;;
    ADMIN_SECRET_KEY|SECRET_KEY)
      if [[ "$value" != S* ]]; then
        echo "Error: '$name' must start with 'S' for a Stellar secret key." >&2
        echo "Hint: use a valid secret key such as S..." >&2
        invalid+=("$name")
        return 1
      fi
      ;;
    SOROBAN_RPC_URL|RPC_URL)
      if [[ "$value" != http://* && "$value" != https://* ]]; then
        echo "Error: '$name' must be a valid HTTP(S) URL." >&2
        echo "Hint: use a value such as https://soroban-testnet.stellar.org" >&2
        invalid+=("$name")
        return 1
      fi
      ;;
  esac

  if [[ "$value" == *"..."* ]]; then
    echo "Error: '$name' still contains a placeholder value." >&2
    echo "Replace it with a real value before deploying." >&2
    invalid+=("$name")
    return 1
  fi
}

require_any_var() {
  local hint="$1"
  shift
  local names=("$@")
  local name
  local value

  for name in "${names[@]}"; do
    value="${!name:-}"
    if [[ -n "$value" ]]; then
      if [[ "$name" == "ADMIN_PUBLIC_KEY" || "$name" == "CONTRACT_ADMIN" ]]; then
        if [[ "$value" != G* ]]; then
          echo "Error: '$name' must start with 'G' for a Stellar public key." >&2
          echo "Hint: use a valid public key such as G..." >&2
          invalid+=("$name")
          return 1
        fi
      elif [[ "$name" == "ADMIN_SECRET_KEY" || "$name" == "SECRET_KEY" ]]; then
        if [[ "$value" != S* ]]; then
          echo "Error: '$name' must start with 'S' for a Stellar secret key." >&2
          echo "Hint: use a valid secret key such as S..." >&2
          invalid+=("$name")
          return 1
        fi
      elif [[ "$name" == "SOROBAN_RPC_URL" || "$name" == "RPC_URL" ]]; then
        if [[ "$value" != http://* && "$value" != https://* ]]; then
          echo "Error: '$name' must be a valid HTTP(S) URL." >&2
          echo "Hint: use a value such as https://soroban-testnet.stellar.org" >&2
          invalid+=("$name")
          return 1
        fi
      fi

      if [[ "$value" == *"..."* ]]; then
        echo "Error: '$name' still contains a placeholder value." >&2
        echo "Replace it with a real value before deploying." >&2
        invalid+=("$name")
        return 1
      fi

      return 0
    fi
  done

  echo "Error: Required environment variable(s) ${names[*]} are missing or empty." >&2
  echo "Set one of them in your shell or in ${ENV_FILE:-the environment file} before running this ${ENV_LABEL}." >&2
  echo "Hint: $hint" >&2
  for name in "${names[@]}"; do
    missing+=("$name")
  done
  return 1
}

if ! require_any_var "Set SOROBAN_RPC_URL (or RPC_URL) to your Soroban RPC endpoint." "SOROBAN_RPC_URL" "RPC_URL"; then
  :
fi

# Allow legacy/README env variable name for network passphrase.
if [[ -z "${SOROBAN_NETWORK_PASSPHRASE:-}" && -n "${NETWORK_PASSPHRASE:-}" ]]; then
  export SOROBAN_NETWORK_PASSPHRASE="$NETWORK_PASSPHRASE"
fi

if ! require_any_var "Set SOROBAN_NETWORK_PASSPHRASE (or NETWORK_PASSPHRASE) to the network passphrase for the target network." "SOROBAN_NETWORK_PASSPHRASE" "NETWORK_PASSPHRASE"; then
  :
fi

if ! require_any_var "Set ADMIN_PUBLIC_KEY (or CONTRACT_ADMIN) to the Stellar public key that will act as the admin." "ADMIN_PUBLIC_KEY" "CONTRACT_ADMIN"; then
  :
fi

if ! require_any_var "Set ADMIN_SECRET_KEY (or SECRET_KEY) to the corresponding Stellar secret key for deployment signing." "ADMIN_SECRET_KEY" "SECRET_KEY"; then
  :
fi

if (( ${#missing[@]} > 0 )); then
  echo "Missing required environment variables:" >&2
  printf ' - %s\n' "${missing[@]}" >&2
  exit 1
fi

if (( ${#invalid[@]} > 0 )); then
  echo "Invalid required environment variables:" >&2
  printf ' - %s\n' "${invalid[@]}" >&2
  exit 1
fi

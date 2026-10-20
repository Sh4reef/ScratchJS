#!/usr/bin/env bash
set -euo pipefail

# ScratchJS macOS Self-Signing Certificate Setup
# Generates a self-signed Code Signing certificate and provisions macOS keychain.

CERT_NAME="${MAC_CERT_NAME:-ScratchJS Self-Signed}"
OUTPUT_DIR="${1:-dist}"
CI_MODE=false
INSTALL_LOCAL=false

for arg in "$@"; do
  if [ "$arg" = "--ci" ]; then
    CI_MODE=true
  elif [ "$arg" = "--install" ]; then
    INSTALL_LOCAL=true
  fi
done

if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "Notice: macOS self-signing setup is only applicable on macOS. Skipping."
  exit 0
fi

echo "==> Setting up macOS code signing identity: '$CERT_NAME'..."

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

OPENSSL_CNF="$TMP_DIR/openssl.cnf"
cat << EOF > "$OPENSSL_CNF"
[ req ]
distinguished_name = req_distinguished_name
prompt = no

[ req_distinguished_name ]
CN = $CERT_NAME
O = ScratchJS

[ v3_codesign ]
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
basicConstraints = critical, CA:FALSE
EOF

KEY_FILE="$TMP_DIR/cert.key"
CRT_FILE="$TMP_DIR/cert.crt"
P12_FILE="$TMP_DIR/cert.p12"
P12_PASS="scratchjs"

echo "==> Generating self-signed code signing certificate via OpenSSL..."
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
  -config "$OPENSSL_CNF" -extensions v3_codesign \
  -keyout "$KEY_FILE" \
  -out "$CRT_FILE"

openssl pkcs12 -export -legacy \
  -out "$P12_FILE" \
  -inkey "$KEY_FILE" \
  -in "$CRT_FILE" \
  -passout "pass:$P12_PASS" \
  -name "$CERT_NAME"

if [ "$CI_MODE" = true ]; then
  echo "==> Configuring GitHub Actions runner keychain..."
  KEYCHAIN_NAME="${RUNNER_TEMP:-/tmp}/scratchjs-build.keychain-db"
  KEYCHAIN_PASS="ci-keychain-pass"

  security delete-keychain "$KEYCHAIN_NAME" 2>/dev/null || true
  security create-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN_NAME"
  security set-keychain-settings -lut 21600 "$KEYCHAIN_NAME"
  security unlock-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN_NAME"

  # Register keychain in user search list and set default first
  EXISTING_KEYCHAINS=$(security list-keychains -d user | tr -d '"' | tr '\n' ' ')
  security list-keychains -d user -s "$KEYCHAIN_NAME" $EXISTING_KEYCHAINS
  security default-keychain -s "$KEYCHAIN_NAME"

  # Import certificate & private key with -A and -T to allow non-interactive signing without GUI prompts
  security import "$P12_FILE" -k "$KEYCHAIN_NAME" -P "$P12_PASS" -A -T /usr/bin/codesign -T /usr/bin/productsign

  # Ensure keychain is unlocked before updating partition list
  security unlock-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN_NAME"

  # Authorize codesign tools without GUI password prompt
  security set-key-partition-list -S apple-tool:,apple: -s -k "$KEYCHAIN_PASS" "$KEYCHAIN_NAME" || true

  # Add as trusted root certificate for code signing in this keychain (no -d, which prompts for admin password)
  security add-trusted-cert -r trustRoot -p codeSign -k "$KEYCHAIN_NAME" "$CRT_FILE"

  echo "==> Verifying code signing identity in keychain..."
  security find-identity -v -p codesigning "$KEYCHAIN_NAME"

  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "CSC_NAME=$CERT_NAME" >> "$GITHUB_ENV"
    echo "CSC_KEYCHAIN=$KEYCHAIN_NAME" >> "$GITHUB_ENV"
    echo "CSC_IDENTITY_AUTO_DISCOVERY=true" >> "$GITHUB_ENV"
  fi
  echo "==> CI code signing identity configured successfully."
elif [ "$INSTALL_LOCAL" = true ]; then
  LOGIN_KEYCHAIN="${HOME}/Library/Keychains/login.keychain-db"
  if [ ! -f "$LOGIN_KEYCHAIN" ]; then
    LOGIN_KEYCHAIN="${HOME}/Library/Keychains/login.keychain"
  fi
  echo "==> Installing into local login keychain: $LOGIN_KEYCHAIN"
  security import "$P12_FILE" -k "$LOGIN_KEYCHAIN" -P "$P12_PASS" -A -T /usr/bin/codesign
  security add-trusted-cert -r trustRoot -p codeSign "$CRT_FILE"
  echo "==> Identity installed into login keychain successfully."
else
  mkdir -p "$OUTPUT_DIR"
  EXPORT_P12="$OUTPUT_DIR/scratchjs-self-signed.p12"
  cp "$P12_FILE" "$EXPORT_P12"
  echo "==> Self-signed certificate exported to: $EXPORT_P12"
  echo "    Password: $P12_PASS"
  echo "    Identity Name: $CERT_NAME"
  echo ""
  echo "To install into your macOS Login keychain for local signing, run:"
  echo "  npm run mac:setup-cert -- --install"
  echo "Or manually with security:"
  echo "  security import $EXPORT_P12 -k ~/Library/Keychains/login.keychain-db -P $P12_PASS -A -T /usr/bin/codesign"
fi

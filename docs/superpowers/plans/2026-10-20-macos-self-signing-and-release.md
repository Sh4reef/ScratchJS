# macOS Self-Signing & Release Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable self-signing for macOS builds in ScratchJS both for local developers and automated CI/CD runs, and update `.github/workflows/release.yml` so that macOS releases are automatically signed with a self-signed certificate when Apple Developer credentials are not present.

**Architecture:** 
1. Create a reusable shell utility `scripts/setup-mac-self-signing.sh` that uses OpenSSL to generate a self-signed X.509 certificate configured specifically for macOS code signing (`keyUsage = critical, digitalSignature` and `extendedKeyUsage = critical, codeSigning`).
2. When run in CI (`--ci`), the utility creates a temporary keychain, sets key partitions for `codesign` to bypass interactive UI prompts, marks the certificate as a trusted root for `codeSign`, sets the default keychain search list, and exports `CSC_NAME` to `$GITHUB_ENV`.
3. In `.github/workflows/release.yml`, add a step on the macOS build job that checks if `CSC_LINK` / Apple Developer credentials are configured. If absent, it automatically triggers the self-signing setup, enabling `electron-builder` to produce properly signed `.app` and `.dmg` binaries.
4. Expose `npm run mac:setup-cert` in `package.json` for local developer convenience and document the workflow in `docs/RELEASING.md`.

**Tech Stack:** Electron 33, electron-builder 26, OpenSSL, macOS `security` CLI, GitHub Actions.

---

## File Structure & Responsibilities

- `scripts/setup-mac-self-signing.sh`: Automates generation of self-signed code signing certificate and keychain provisioning (both for CI runners and local developer environments).
- `package.json`: Expose `mac:setup-cert` script and ensure `mac` build configuration supports self-signed identities without restrictive `null` overrides.
- `.github/workflows/release.yml`: Add macOS signing configuration step before packaging, ensuring builds are self-signed if `CSC_LINK` is not provided. Add signature verification step.
- `docs/RELEASING.md`: Update documentation detailing self-signing behavior, local certificate setup, and optional GitHub Secrets for official signing.

---

### Task 1: Create Self-Signing Helper Script (`scripts/setup-mac-self-signing.sh`)

**Files:**
- Create: `scripts/setup-mac-self-signing.sh`
- Test: Execute script in a temporary test directory to verify certificate creation and `codesigning` identity recognition.

- [ ] **Step 1: Write `scripts/setup-mac-self-signing.sh`**

Create `scripts/setup-mac-self-signing.sh` with support for `--ci` and `--local` modes:

```bash
#!/usr/bin/env bash
set -euo pipefail

# ScratchJS macOS Self-Signing Certificate Setup
# Generates a self-signed Code Signing certificate and provisions macOS keychain.

CERT_NAME="${MAC_CERT_NAME:-ScratchJS Self-Signed}"
OUTPUT_DIR="${1:-dist}"
CI_MODE=false

for arg in "$@"; do
  if [ "$arg" = "--ci" ]; then
    CI_MODE=true
  fi
done

if [[ "$OSTYPE" != "darwin"* ]]; then
  echo "Notice: macOS self-signing setup is only applicable on macOS. Skipping."
  exit 0
fi

echo "==> Setting up macOS code signing identity: '$CERT_NAME'..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

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
  KEYCHAIN_NAME="${RUNNER_TEMP:-/tmp}/scratchjs-build.keychain"
  KEYCHAIN_PASS="ci-keychain-pass"

  security delete-keychain "$KEYCHAIN_NAME" 2>/dev/null || true
  security create-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN_NAME"
  security set-keychain-settings -lut 21600 "$KEYCHAIN_NAME"
  security unlock-keychain -p "$KEYCHAIN_PASS" "$KEYCHAIN_NAME"

  # Import certificate & private key
  security import "$P12_FILE" -k "$KEYCHAIN_NAME" -P "$P12_PASS" -T /usr/bin/codesign

  # Authorize codesign tool without GUI password prompt
  security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$KEYCHAIN_PASS" "$KEYCHAIN_NAME" >/dev/null 2>&1

  # Add as trusted root certificate for code signing
  security add-trusted-cert -d -r trustRoot -p codeSign -k "$KEYCHAIN_NAME" "$CRT_FILE"

  # Update user keychain search list
  EXISTING_KEYCHAINS=$(security list-keychains -d user | tr -d '"' | tr '\n' ' ')
  security list-keychains -d user -s "$KEYCHAIN_NAME" $EXISTING_KEYCHAINS
  security default-keychain -s "$KEYCHAIN_NAME"

  echo "==> Verifying code signing identity in keychain..."
  security find-identity -v -p codesigning "$KEYCHAIN_NAME"

  if [ -n "${GITHUB_ENV:-}" ]; then
    echo "CSC_NAME=$CERT_NAME" >> "$GITHUB_ENV"
    echo "CSC_KEYCHAIN=$KEYCHAIN_NAME" >> "$GITHUB_ENV"
    echo "CSC_IDENTITY_AUTO_DISCOVERY=true" >> "$GITHUB_ENV"
  fi
  echo "==> CI code signing identity configured successfully."
else
  mkdir -p "$OUTPUT_DIR"
  EXPORT_P12="$OUTPUT_DIR/scratchjs-self-signed.p12"
  cp "$P12_FILE" "$EXPORT_P12"
  echo "==> Self-signed certificate exported to: $EXPORT_P12"
  echo "    Password: $P12_PASS"
  echo "    Identity Name: $CERT_NAME"
  echo ""
  echo "To install into your macOS Login keychain for local signing, run:"
  echo "  security import $EXPORT_P12 -k ~/Library/Keychains/login.keychain-db -P $P12_PASS -T /usr/bin/codesign"
  echo "  security add-trusted-cert -d -r trustRoot -p codeSign $CRT_FILE"
fi
```

- [ ] **Step 2: Make the script executable**

```bash
chmod +x scripts/setup-mac-self-signing.sh
```

- [ ] **Step 3: Test local script execution**

Run the script locally in a test output directory:
```bash
./scripts/setup-mac-self-signing.sh dist
ls -la dist/scratchjs-self-signed.p12
```
Expected output: Confirms certificate generation and creates `dist/scratchjs-self-signed.p12`.

- [ ] **Step 4: Commit `scripts/setup-mac-self-signing.sh`**

```bash
git add scripts/setup-mac-self-signing.sh
git commit -m "feat(ci): add macOS self-signing setup utility script"
```

---

### Task 2: Configure `package.json` for Self-Signing Support

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add `mac:setup-cert` script to `package.json`**

In `package.json`, add `"mac:setup-cert": "bash scripts/setup-mac-self-signing.sh"` under `scripts`.

- [ ] **Step 2: Verify `build.mac` settings**

Confirm that `build.mac` maintains:
```json
    "mac": {
      "icon": "resources/icon.icns",
      "category": "public.app-category.developer-tools",
      "timestamp": "none",
      "target": [
        {
          "target": "dmg",
          "arch": [
            "arm64",
            "x64"
          ]
        }
      ],
      "hardenedRuntime": false,
      "gatekeeperAssess": false
    }
```
*Note:* Do not set `"identity": null`, as leaving identity configurable allows electron-builder to automatically use `CSC_NAME` or the discovered self-signed identity from the keychain, while gracefully skipping if no identity exists.

- [ ] **Step 3: Test npm script definition**

```bash
npm run mac:setup-cert
```
Expected output: Script executes and displays generated certificate details.

- [ ] **Step 4: Commit `package.json`**

```bash
git add package.json
git commit -m "chore: add mac:setup-cert npm script"
```

---

### Task 3: Update GitHub Actions Release Workflow (`.github/workflows/release.yml`)

**Files:**
- Modify: `.github/workflows/release.yml`

- [ ] **Step 1: Add macOS Code Signing Setup step to `release.yml`**

Insert the following step before `Build application packages` in `.github/workflows/release.yml`:

```yaml
      - name: Prepare macOS Code Signing
        if: matrix.platform == 'mac'
        env:
          CSC_LINK: ${{ secrets.CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.CSC_KEY_PASSWORD }}
          CSC_NAME: ${{ secrets.CSC_NAME }}
        run: |
          if [ -n "$CSC_LINK" ]; then
            echo "Using custom/official certificate from CSC_LINK secret."
            echo "CSC_LINK=$CSC_LINK" >> $GITHUB_ENV
            echo "CSC_KEY_PASSWORD=$CSC_KEY_PASSWORD" >> $GITHUB_ENV
            if [ -n "$CSC_NAME" ]; then
              echo "CSC_NAME=$CSC_NAME" >> $GITHUB_ENV
            fi
          else
            echo "No CSC_LINK secret configured. Generating self-signed certificate for macOS build..."
            bash scripts/setup-mac-self-signing.sh --ci
          fi
```

- [ ] **Step 2: Add Code Signing Verification step**

After `Build application packages`, add a verification step to print the signature details of the compiled `.dmg` and inner `.app`:

```yaml
      - name: Verify macOS Code Signature
        if: matrix.platform == 'mac'
        run: |
          echo "Verifying DMG and application signatures:"
          shopt -s nullglob
          for dmg in dist/*.dmg; do
            echo "--- Codesign verification for $dmg ---"
            codesign -dv --verbose=4 "$dmg" 2>&1 || true
          done
```

- [ ] **Step 3: Validate GitHub Actions workflow syntax**

Verify yaml formatting and syntax:
```bash
node -e '
const fs = require("fs");
const content = fs.readFileSync(".github/workflows/release.yml", "utf8");
console.log("YAML file size:", content.length, "bytes. Verified readable.");
'
```

- [ ] **Step 4: Commit `.github/workflows/release.yml`**

```bash
git add .github/workflows/release.yml
git commit -m "ci(release): add macOS self-signing workflow step and signature verification"
```

---

### Task 4: Update Documentation (`docs/RELEASING.md`)

**Files:**
- Modify: `docs/RELEASING.md`

- [ ] **Step 1: Add macOS Code Signing section to `docs/RELEASING.md`**

Document:
1. **Automated Self-Signing (Default)**: Explain that CI automatically generates an ephemeral self-signed code signing certificate and signs macOS DMGs and app bundles so users avoid damaged bundle errors on Apple Silicon.
2. **Official Apple Developer Signing (Optional)**: Document how to optionally configure `CSC_LINK` (base64 encoded `.p12`), `CSC_KEY_PASSWORD`, and `CSC_NAME` in GitHub Secrets for production Apple Developer ID signing.
3. **Local Self-Signing**: Explain running `npm run mac:setup-cert` for generating local `.p12` certificates.

- [ ] **Step 2: Commit `docs/RELEASING.md`**

```bash
git add docs/RELEASING.md
git commit -m "docs: document macOS self-signing and release workflow credentials"
```

---

### Task 5: End-to-End Local Verification

**Files:**
- Verify: Full local test run of `--ci` workflow on macOS runner.

- [ ] **Step 1: Run CI self-signing setup simulation locally**

```bash
bash scripts/setup-mac-self-signing.sh --ci
```
Expected output:
- Dedicated temporary keychain created and unlocked.
- Self-signed certificate imported with `apple-tool:,apple:,codesign:` partition access.
- `security find-identity -v -p codesigning` displays `1) ... "ScratchJS Self-Signed"`.

- [ ] **Step 2: Clean up test keychain**

```bash
security delete-keychain "${RUNNER_TEMP:-/tmp}/scratchjs-build.keychain" 2>/dev/null || true
rm -f dist/scratchjs-self-signed.p12
```
Confirm cleanup of temporary keychains.

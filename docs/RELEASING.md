# Release Process & Cloudflare R2 Storage Guide

## Required GitHub Actions Secrets & Variables

To enable automated uploads to Cloudflare R2, configure the following in GitHub repository settings (**Settings > Secrets and variables > Actions**):

### Secrets
- `R2_ACCESS_KEY_ID`: Cloudflare R2 API Token Access Key ID with Object Read & Write permissions.
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 API Token Secret Access Key.
- `CSC_LINK` *(Optional)*: Base64-encoded `.p12` code signing certificate or URL. If omitted, the release workflow automatically generates an ephemeral self-signed code signing certificate on the macOS runner to sign macOS `.dmg` and `.app` bundles.
- `CSC_KEY_PASSWORD` *(Optional)*: Password for `CSC_LINK` if using an official or custom certificate.
- `CSC_NAME` *(Optional)*: Specific code signing identity name in keychain (e.g. `Developer ID Application: ...`).

### Variables (or Secrets)
- `R2_ACCOUNT_ID`: Cloudflare Account ID (found on the Cloudflare dashboard overview).
- `R2_BUCKET_NAME`: The name of the R2 bucket containing `scratchjs-download-files`.

## macOS Code Signing

### 1. Automated Self-Signing (Default in CI)
When `CSC_LINK` is not configured in GitHub Secrets, the release workflow automatically:
1. Generates an ephemeral self-signed code signing certificate via OpenSSL (`CN=ScratchJS Self-Signed`) configured with `keyUsage = critical, digitalSignature` and `extendedKeyUsage = critical, codeSigning`.
2. Creates and unlocks an isolated keychain on the `macos-latest` runner.
3. Automatically trusts and authorises the certificate with `/usr/bin/codesign` without interactive prompt blocks.
4. Signs both Apple Silicon (`arm64`) and Intel (`x64`) `.dmg` distributions.

### 2. Official Apple Developer Signing (Production)
To sign with an official Apple Developer ID certificate:
1. Export your Developer ID Application certificate as a `.p12` file from macOS Keychain.
2. Base64-encode the `.p12` file: `base64 -i cert.p12 | pbcopy`
3. Add repository secrets in GitHub:
   - `CSC_LINK`: Paste the base64 string.
   - `CSC_KEY_PASSWORD`: Certificate password.
   - `CSC_NAME`: (Optional) Identity name.

### 3. Local Developer Self-Signing
To generate a self-signed certificate for local macOS builds:
```bash
# Generate .p12 certificate file in dist/
npm run mac:setup-cert

# Or install directly into your login keychain for codesign:
npm run mac:setup-cert -- --install
```

## Triggering a Release

1. Ensure all changes and version increments in `package.json` are committed to the main/develop branch.
2. Create and push a version tag:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
3. The `Release` GitHub Action workflow will automatically:
   - Build macOS `.dmg` (`arm64`, `x64`) on `macos-latest`.
   - Build Windows `.exe` (NSIS) and `.msi` (`x64`, `ia32`, `arm64`) on `windows-latest`.
   - Build Linux `.deb`, `.rpm`, and `.AppImage` (`x64`) on `ubuntu-latest`.
   - Upload all compiled binaries to `s3://<R2_BUCKET_NAME>/scratchjs-download-files/`.

# Release Process & Cloudflare R2 Storage Guide

## Required GitHub Actions Secrets & Variables

To enable automated uploads to Cloudflare R2, configure the following in GitHub repository settings (**Settings > Secrets and variables > Actions**):

### Secrets
- `R2_ACCESS_KEY_ID`: Cloudflare R2 API Token Access Key ID with Object Read & Write permissions.
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 API Token Secret Access Key.
- `CSC_LINK` *(Optional)*: Base64-encoded `.p12` code signing certificate or URL. If omitted, macOS builds are automatically self-signed using ad-hoc code signing (`identity: "-"`).
- `CSC_KEY_PASSWORD` *(Optional)*: Password for `CSC_LINK` if using an official or custom certificate.
- `CSC_NAME` *(Optional)*: Specific code signing identity name in keychain (e.g. `Developer ID Application: ...`).

### Variables (or Secrets)
- `R2_ACCOUNT_ID`: Cloudflare Account ID (found on the Cloudflare dashboard overview).
- `R2_BUCKET_NAME`: The name of the R2 bucket containing `scratchjs-download-files`.

## macOS Code Signing

### 1. Ad-Hoc Self-Signing (Default)
By default, ScratchJS configures macOS packaging with ad-hoc signing (`build.mac.identity: "-"` in `package.json`):
- All bundled binaries, helper applications, and `.app` bundles are signed via `codesign -s -`.
- Satisfies macOS Gatekeeper code-signature requirements on Apple Silicon (`arm64`) to prevent crash on launch.
- Requires zero certificates, keychains, or secrets—runs instantly and deterministically both locally and in CI runners.

### 2. Official Apple Developer Signing (Production)
To sign with an official Apple Developer ID certificate:
1. Export your Developer ID Application certificate as a `.p12` file from macOS Keychain.
2. Base64-encode the `.p12` file: `base64 -i cert.p12 | pbcopy`
3. Add repository secrets in GitHub:
   - `CSC_LINK`: Paste the base64 string.
   - `CSC_KEY_PASSWORD`: Certificate password.
   - `CSC_NAME`: (Optional) Identity name.
4. When `CSC_LINK` is configured, the release workflow overrides the ad-hoc default (`-c.mac.identity=null`) to allow `electron-builder` to discover and sign with the certificate provided in `CSC_LINK`.

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

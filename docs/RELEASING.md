# Release Process & Cloudflare R2 Storage Guide

## Required GitHub Actions Secrets & Variables

To enable automated uploads to Cloudflare R2, configure the following in GitHub repository settings (**Settings > Secrets and variables > Actions**):

### Secrets
- `R2_ACCESS_KEY_ID`: Cloudflare R2 API Token Access Key ID with Object Read & Write permissions.
- `R2_SECRET_ACCESS_KEY`: Cloudflare R2 API Token Secret Access Key.

### Variables (or Secrets)
- `R2_ACCOUNT_ID`: Cloudflare Account ID (found on the Cloudflare dashboard overview).
- `R2_BUCKET_NAME`: The name of the R2 bucket containing `scratchjs-download-files`.

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

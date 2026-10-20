# Cross-Platform Build & Cloudflare R2 Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Windows and Linux build support to ScratchJS via electron-builder and configure a GitHub Actions release workflow that builds for macOS, Windows, and Linux on version tag push, uploading compiled binaries to Cloudflare R2 under `scratchjs-download-files`.

**Architecture:** Extend `package.json` with platform-specific targets (`.dmg` for macOS x64/arm64; `.exe` NSIS and `.msi` for Windows x64/ia32/arm64; `.deb`, `.rpm`, `.AppImage` for Linux x64). Implement a GitHub Actions workflow using a 3-OS runner matrix (`macos-latest`, `windows-latest`, `ubuntu-latest`), aggregate artifacts, and publish to Cloudflare R2 using AWS CLI with S3-compatible endpoints.

**Tech Stack:** Electron 33, electron-builder 26, Vite/electron-vite, GitHub Actions, AWS CLI (S3-compatible R2 storage), Pillow (icon generation).

---

## File Structure & Responsibilities

- `resources/icon.ico`: Multi-size Windows application icon (16, 32, 48, 64, 128, 256px) generated from `resources/icon.png`.
- `package.json`: Define `win`, `nsis`, `linux`, and updated `mac` configuration under the `build` property; add `build:win`, `build:linux`, and `build:all` scripts.
- `.github/workflows/release.yml`: GitHub Actions release pipeline containing matrix build jobs for macOS, Windows, and Linux, plus a release upload job targeting Cloudflare R2.
- `docs/RELEASING.md`: Setup instructions for required Cloudflare R2 GitHub Actions secrets/variables and the release tagging process.

---

### Task 1: Generate Windows Application Icon (`resources/icon.ico`)

**Files:**
- Create: `resources/icon.ico`
- Test: Verification script checking icon validity and embedded dimensions.

- [ ] **Step 1: Write Python script to generate `resources/icon.ico` from `resources/icon.png`**

Generate `resources/icon.ico` with standard multi-resolution icon sizes:

```bash
python3 -c "
from PIL import Image
img = Image.open('resources/icon.png')
img.save('resources/icon.ico', sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
print('Generated resources/icon.ico successfully')
"
```

- [ ] **Step 2: Verify `resources/icon.ico` exists and contains valid icon headers**

Run verification check:
```bash
python3 -c "
from PIL import Image
icon = Image.open('resources/icon.ico')
print('Format:', icon.format, 'Sizes:', getattr(icon, 'ico', None).sizes() if hasattr(icon, 'ico') else icon.size)
"
```
Expected output: `Format: ICO` and confirmation of generated icon sizes.

- [ ] **Step 3: Commit `resources/icon.ico`**

```bash
git add resources/icon.ico
git commit -m "chore: add windows application icon"
```

---

### Task 2: Configure Cross-Platform Packaging in `package.json`

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update `scripts` in `package.json`**

Update the `scripts` section in `package.json` to add multi-platform build commands:
```json
    "build:mac": "npm run build && electron-builder --mac dmg",
    "build:dmg": "npm run build && electron-builder --mac dmg",
    "build:win": "npm run build && electron-builder --win nsis msi",
    "build:linux": "npm run build && electron-builder --linux AppImage deb rpm",
    "build:all": "npm run build && electron-builder -mwl",
```

- [ ] **Step 2: Update `build` section in `package.json`**

Ensure `build` configuration includes macOS DMG (arm64 & x64), Windows NSIS & MSI (x64, ia32, arm64), and Linux AppImage, deb, rpm (x64):

```json
  "build": {
    "appId": "com.scratchjs.desktop",
    "productName": "ScratchJS",
    "directories": {
      "output": "dist"
    },
    "files": [
      "out/**/*",
      "resources/**/*",
      "package.json"
    ],
    "mac": {
      "icon": "resources/icon.icns",
      "category": "public.app-category.developer-tools",
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
    },
    "win": {
      "icon": "resources/icon.ico",
      "target": [
        {
          "target": "nsis",
          "arch": [
            "x64",
            "ia32",
            "arm64"
          ]
        },
        {
          "target": "msi",
          "arch": [
            "x64",
            "ia32",
            "arm64"
          ]
        }
      ]
    },
    "nsis": {
      "oneClick": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true
    },
    "linux": {
      "icon": "resources/icon.png",
      "category": "Development",
      "target": [
        {
          "target": "AppImage",
          "arch": [
            "x64"
          ]
        },
        {
          "target": "deb",
          "arch": [
            "x64"
          ]
        },
        {
          "target": "rpm",
          "arch": [
            "x64"
          ]
        }
      ]
    }
  }
```

- [ ] **Step 3: Verify package.json syntax and typecheck**

Run:
```bash
npm run typecheck
```
Expected: PASS with 0 errors.

- [ ] **Step 4: Commit `package.json` updates**

```bash
git add package.json
git commit -m "feat: configure electron-builder for mac, windows, and linux"
```

---

### Task 3: Test and Validate Local Build Execution

**Files:**
- Modify: `package.json` (if any adjustments needed during test)

- [ ] **Step 1: Test `npm run build`**

Run:
```bash
npm run build
```
Expected: Output created in `out/main`, `out/preload`, and `out/renderer`.

- [ ] **Step 2: Validate `electron-builder` configuration parsing**

Run electron-builder print effective configuration:
```bash
npx electron-builder --mac --dir -c.mac.identity=null
```
Expected: electron-builder successfully validates and unpacks the macOS bundle without config syntax errors.

- [ ] **Step 3: Clean up local build output test artifacts**

```bash
rm -rf dist
```

---

### Task 4: Create GitHub Actions Release Workflow (`.github/workflows/release.yml`)

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write `.github/workflows/release.yml`**

Create the workflow triggered by `v*` tag pushes and `workflow_dispatch`:

```yaml
name: Release

on:
  push:
    tags:
      - 'v*'
  workflow_dispatch:

permissions:
  contents: write

jobs:
  build:
    name: Build (${{ matrix.platform }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: macos-latest
            platform: mac
            build_cmd: npm run build:mac
            artifact_pattern: dist/*.dmg
          - os: windows-latest
            platform: win
            build_cmd: npm run build:win
            artifact_pattern: dist/*.exe dist/*.msi
          - os: ubuntu-latest
            platform: linux
            build_cmd: npm run build:linux
            artifact_pattern: dist/*.AppImage dist/*.deb dist/*.rpm

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'

      - name: Install system dependencies (Linux)
        if: runner.os == 'Linux'
        run: |
          sudo apt-get update
          sudo apt-get install -y rpm

      - name: Install dependencies
        run: npm ci

      - name: Build application packages
        run: ${{ matrix.build_cmd }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Stage compiled release artifacts
        shell: bash
        run: |
          mkdir -p release-staging
          for pattern in ${{ matrix.artifact_pattern }}; do
            for file in $pattern; do
              if [ -f "$file" ]; then
                cp "$file" release-staging/
              fi
            done
          done
          echo "Staged artifacts:"
          ls -la release-staging/

      - name: Upload build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: release-artifacts-${{ matrix.platform }}
          path: release-staging/
          if-no-files-found: error
          retention-days: 1

  upload-r2:
    name: Upload to Cloudflare R2
    needs: build
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Download all release artifacts
        uses: actions/download-artifact@v4
        with:
          path: all-artifacts
          merge-multiple: true

      - name: Display downloaded artifacts
        run: |
          echo "Files to upload to R2:"
          ls -la all-artifacts/

      - name: Upload release files to Cloudflare R2
        env:
          AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
          AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
          AWS_REGION: auto
          R2_ENDPOINT: https://${{ secrets.R2_ACCOUNT_ID || vars.R2_ACCOUNT_ID }}.r2.cloudflarestorage.com
          R2_BUCKET: ${{ secrets.R2_BUCKET_NAME || vars.R2_BUCKET_NAME }}
        run: |
          if [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ] || [ -z "$R2_ENDPOINT" ] || [ -z "$R2_BUCKET" ]; then
            echo "Error: Missing Cloudflare R2 credentials or configuration variables."
            exit 1
          fi

          aws s3 cp all-artifacts/ "s3://${R2_BUCKET}/scratchjs-download-files/" \
            --recursive \
            --endpoint-url "$R2_ENDPOINT"

          echo "Upload to Cloudflare R2 completed successfully."
```

- [ ] **Step 2: Validate YAML syntax of the workflow file**

Run node/python validation check:
```bash
python3 -c "
import yaml
with open('.github/workflows/release.yml', 'r') as f:
    yaml.safe_load(f)
print('Valid YAML')
"
```
Expected output: `Valid YAML`.

- [ ] **Step 3: Commit workflow file**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add GitHub Actions release workflow for macOS, Windows, Linux, and Cloudflare R2 upload"
```

---

### Task 5: Add Documentation for Releases and Cloudflare R2 Setup

**Files:**
- Create: `docs/RELEASING.md`

- [ ] **Step 1: Create `docs/RELEASING.md`**

Document the required secrets, variables, and release tagging steps:

```markdown
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
```

- [ ] **Step 2: Commit `docs/RELEASING.md`**

```bash
git add docs/RELEASING.md
git commit -m "docs: add release process and Cloudflare R2 setup guide"
```

---

## Self-Review Checklist

- [x] Spec coverage: macOS dmg (x64/arm64), Windows nsi/msi (x64/ia32/arm64), Linux deb/rpm/appimage (x64), GitHub Actions tag trigger, Cloudflare R2 upload.
- [x] No placeholders: All scripts, YAML definitions, commands, and arguments are fully written.
- [x] Type consistency: Build scripts match across `package.json` and `.github/workflows/release.yml`.

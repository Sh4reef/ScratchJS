# Design Document: Cross-Platform Build & Cloudflare R2 Release Workflow

**Date:** 2026-10-20  
**Project:** ScratchJS  
**Topic:** Cross-Platform Build & Cloudflare R2 Release Automation  

---

## 1. Intent & Context
ScratchJS is an Electron-based desktop scratchpad application for JavaScript & TypeScript. Currently, packaging scripts and `electron-builder` configuration only target macOS (`arm64`). To reach a wider developer audience and automate distribution, ScratchJS requires full build support across macOS, Windows, and Linux, along with automated CI/CD pipeline triggered by version tags that publishes release artifacts directly to Cloudflare R2 storage in the `scratchjs-download-files` directory.

---

## 2. Goals, Non-Goals & Anti-Goals

### Goals
- Support building native distribution packages for macOS, Windows, and Linux.
- Target packaging formats:
  - **macOS**: `.dmg` for `arm64` (Apple Silicon) and `x64` (Intel).
  - **Windows**: `.msi` (Windows Installer) and `.exe` (NSIS Installer) for `x64`, `ia32` (i686), and `arm64`.
  - **Linux**: `.deb`, `.rpm`, and `.AppImage` for `x64`.
- Provide convenient npm package scripts for platform-specific builds: `build:mac`, `build:win`, `build:linux`, and `build:all`.
- Add a GitHub Actions workflow (`.github/workflows/release.yml`) triggered on version tags (e.g., `v*`).
- Build artifacts across platform runners (`macos-latest`, `windows-latest`, `ubuntu-latest`) using a matrix strategy.
- Upload all compiled release artifacts into Cloudflare R2 storage under the `scratchjs-download-files` folder.

### Non-Goals
- Code signing with Apple Developer certificates and macOS Gatekeeper notarization (skipped unless credentials/secrets are supplied).
- Windows EV/OV code signing certificates (files will be built unsigned).
- Auto-updating mechanism via electron-updater (R2 serves as direct download file hosting).

### Anti-Goals
- Committing any credentials or secrets directly to the repository.
- Overwriting existing release files in R2 with destructive or unversioned bulk deletes.
- Uploading temporary build intermediate files (e.g. `.blockmap`, `builder-effective-config.yaml`, unpacked application directories).

---

## 3. Platform & Packaging Specifications

### 3.1 `package.json` Configuration
Update `build` configuration in `package.json`:
- **General**:
  - `appId`: `com.scratchjs.desktop`
  - `productName`: `ScratchJS`
  - `directories.output`: `dist`
  - `files`: `out/**/*`, `resources/**/*`, `package.json`
- **macOS (`mac`)**:
  - Target: `dmg`
  - Architectures: `arm64`, `x64`
  - Icon: `resources/icon.icns`
  - Category: `public.app-category.developer-tools`
  - `hardenedRuntime`: `false`
  - `gatekeeperAssess`: `false`
- **Windows (`win` & `nsis` & `msi`)**:
  - Target: `nsis`, `msi`
  - Architectures: `x64`, `ia32`, `arm64`
  - Icon: `resources/icon.png` (or generated `resources/icon.ico`)
  - NSIS configuration: `oneClick: false`, `allowToChangeInstallationDirectory: true`, `createDesktopShortcut: true`
- **Linux (`linux`)**:
  - Target: `AppImage`, `deb`, `rpm`
  - Architectures: `x64`
  - Category: `Development`
  - Icon: `resources/icon.png`

### 3.2 NPM Scripts
Add/update in `package.json`:
- `build:mac`: `npm run build && electron-builder --mac dmg`
- `build:win`: `npm run build && electron-builder --win nsis msi`
- `build:linux`: `npm run build && electron-builder --linux AppImage deb rpm`
- `build:all`: `npm run build && electron-builder -mwl`

---

## 4. GitHub Actions Release Workflow (`release.yml`)

### 4.1 Trigger
- Triggered on tag push matching pattern: `v*` (e.g. `v1.0.1`).
- Support manual dispatch via `workflow_dispatch` with an optional tag input for testing.

### 4.2 Build Matrix Strategy
Use a matrix of jobs across native runners:
1. **macOS runner** (`macos-latest`):
   - Builds `.dmg` for `arm64` and `x64`.
2. **Windows runner** (`windows-latest`):
   - Builds `.exe` (NSIS) and `.msi` for `x64`, `ia32`, and `arm64`.
3. **Linux runner** (`ubuntu-latest`):
   - Installs system packages needed for packaging (e.g., `rpm`).
   - Builds `.deb`, `.rpm`, and `.AppImage` for `x64`.

### 4.3 Cloudflare R2 Upload Specification
Cloudflare R2 provides an S3-compatible API. Release files will be synced to the target bucket path using the AWS CLI or AWS S3 SDK.

- **Secrets and Variables required in GitHub Actions**:
  - `R2_ACCOUNT_ID` (Variable or Secret)
  - `R2_BUCKET_NAME` (Variable or Secret)
  - `R2_ACCESS_KEY_ID` (Secret)
  - `R2_SECRET_ACCESS_KEY` (Secret)
- **Target Location**:
  - `s3://${R2_BUCKET_NAME}/scratchjs-download-files/`
- **Artifact Filtering**:
  - Upload only release installers: `*.dmg`, `*.exe`, `*.msi`, `*.AppImage`, `*.deb`, `*.rpm`.
  - Exclude `.blockmap`, `builder-effective-config.yaml`, `*-unpacked/` directories.

---

## 5. Implementation Plan Summary (What's Left to Builder)
1. Generate / ensure Windows icon (`icon.ico`) from existing `resources/icon.png`.
2. Update `package.json` with multi-platform build targets and npm scripts.
3. Verify local build command execution on macOS and test multi-target configs.
4. Create `.github/workflows/release.yml` with the 3-OS matrix build, artifact collection, and Cloudflare R2 upload step.
5. Provide clear documentation on required GitHub repository secrets and variables.

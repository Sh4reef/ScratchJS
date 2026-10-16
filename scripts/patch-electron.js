import { existsSync, copyFileSync, readFileSync, writeFileSync, renameSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

if (process.platform === 'darwin') {
  const electronDir = join(rootDir, 'node_modules/electron')
  const distDir = join(electronDir, 'dist')
  const pathTxtPath = join(electronDir, 'path.txt')

  const originalApp = join(distDir, 'Electron.app')
  const targetApp = join(distDir, 'ScratchJS.app')

  // 1. Rename Electron.app to ScratchJS.app if needed
  if (existsSync(originalApp) && !existsSync(targetApp)) {
    renameSync(originalApp, targetApp)
  }

  const appPath = existsSync(targetApp) ? targetApp : originalApp

  if (existsSync(appPath)) {
    const plistPath = join(appPath, 'Contents/Info.plist')
    const macosDir = join(appPath, 'Contents/MacOS')
    const resourcesPath = join(appPath, 'Contents/Resources')
    const originalExe = join(macosDir, 'Electron')
    const targetExe = join(macosDir, 'ScratchJS')

    // 2. Rename executable Electron -> ScratchJS
    if (existsSync(originalExe) && !existsSync(targetExe)) {
      renameSync(originalExe, targetExe)
    }

    const exeName = existsSync(targetExe) ? 'ScratchJS' : 'Electron'
    const appDirName = existsSync(targetApp) ? 'ScratchJS.app' : 'Electron.app'

    // 3. Update path.txt so require('electron') resolves the renamed binary
    if (existsSync(pathTxtPath)) {
      writeFileSync(pathTxtPath, `${appDirName}/Contents/MacOS/${exeName}`, 'utf-8')
    }

    // 4. Update Info.plist
    if (existsSync(plistPath)) {
      try {
        execSync(`plutil -replace CFBundleName -string "ScratchJS" "${plistPath}"`)
        execSync(`plutil -replace CFBundleDisplayName -string "ScratchJS" "${plistPath}"`)
        execSync(`plutil -replace CFBundleIdentifier -string "com.scratchjs.desktop" "${plistPath}"`)
        execSync(`plutil -replace CFBundleExecutable -string "${exeName}" "${plistPath}"`)
      } catch {
        let content = readFileSync(plistPath, 'utf-8')
        content = content.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>ScratchJS</string>')
        content = content.replace(/<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleName</key>\n\t<string>ScratchJS</string>')
        content = content.replace(/<key>CFBundleIdentifier<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleIdentifier</key>\n\t<string>com.scratchjs.desktop</string>')
        content = content.replace(/<key>CFBundleExecutable<\/key>\s*<string>[^<]*<\/string>/, `<key>CFBundleExecutable</key>\n\t<string>${exeName}</string>`)
        writeFileSync(plistPath, content, 'utf-8')
      }
    }

    // 5. Replace icons
    const icnsSource = join(rootDir, 'resources/icon.icns')
    const pngSource = join(rootDir, 'resources/icon.png')
    if (existsSync(resourcesPath)) {
      if (existsSync(icnsSource)) {
        copyFileSync(icnsSource, join(resourcesPath, 'electron.icns'))
        copyFileSync(icnsSource, join(resourcesPath, 'icon.icns'))
      }
      if (existsSync(pngSource)) {
        copyFileSync(pngSource, join(resourcesPath, 'icon.png'))
        copyFileSync(pngSource, join(resourcesPath, 'electron.png'))
      }
    }

    // 6. Touch the app bundle to notify macOS LaunchServices to refresh cached metadata
    try {
      execSync(`touch "${appPath}"`)
    } catch {}
  }
}

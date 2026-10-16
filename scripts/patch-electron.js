import { existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const rootDir = join(__dirname, '..')

if (process.platform === 'darwin') {
  const electronAppPath = join(rootDir, 'node_modules/electron/dist/Electron.app')
  const plistPath = join(electronAppPath, 'Contents/Info.plist')
  const resourcesPath = join(electronAppPath, 'Contents/Resources')
  const icnsSource = join(rootDir, 'resources/icon.icns')

  if (existsSync(electronAppPath)) {
    // 1. Update Info.plist with app branding
    if (existsSync(plistPath)) {
      try {
        execSync(`plutil -replace CFBundleName -string "ScratchJS" "${plistPath}"`)
        execSync(`plutil -replace CFBundleDisplayName -string "ScratchJS" "${plistPath}"`)
      } catch {
        // Fallback to text replace if plutil fails
        let content = readFileSync(plistPath, 'utf-8')
        content = content.replace(/<key>CFBundleDisplayName<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleDisplayName</key>\n\t<string>ScratchJS</string>')
        content = content.replace(/<key>CFBundleName<\/key>\s*<string>[^<]*<\/string>/, '<key>CFBundleName</key>\n\t<string>ScratchJS</string>')
        writeFileSync(plistPath, content, 'utf-8')
      }
    }

    // 2. Replace default electron.icns and icon images with ScratchJS assets
    const pngSource = join(rootDir, 'resources/icon.png')
    if (existsSync(resourcesPath)) {
      if (existsSync(icnsSource)) {
        copyFileSync(icnsSource, join(resourcesPath, 'electron.icns'))
      }
      if (existsSync(pngSource)) {
        copyFileSync(pngSource, join(resourcesPath, 'icon.png'))
        copyFileSync(pngSource, join(resourcesPath, 'electron.png'))
      }
    }
  }
}

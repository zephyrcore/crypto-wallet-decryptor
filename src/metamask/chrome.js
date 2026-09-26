/**
 * Discover MetaMask LevelDB storage under browser Default profiles.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const METAMASK_EXT_ID = 'nkbihfbeogaeaoehlefnkodbefgpgknn'

function getChromeUserDataRoots() {
  const home = os.homedir()
  const local = process.env.LOCALAPPDATA || ''

  if (process.platform === 'win32') {
    return [
      path.join(local, 'Google', 'Chrome', 'User Data'),
      path.join(local, 'Chromium', 'User Data'),
      path.join(local, 'Microsoft', 'Edge', 'User Data'),
      path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'),
    ].filter((p) => Boolean(local) && p.startsWith(local))
  }

  if (process.platform === 'darwin') {
    return [
      path.join(home, 'Library', 'Application Support', 'Google', 'Chrome'),
      path.join(home, 'Library', 'Application Support', 'Chromium'),
      path.join(home, 'Library', 'Application Support', 'Microsoft Edge'),
      path.join(
        home,
        'Library',
        'Application Support',
        'BraveSoftware',
        'Brave-Browser'
      ),
    ]
  }

  return [
    path.join(home, '.config', 'google-chrome'),
    path.join(home, '.config', 'chromium'),
    path.join(home, '.config', 'microsoft-edge'),
    path.join(home, '.config', 'BraveSoftware', 'Brave-Browser'),
  ]
}

/** @returns {string|null} */
export function findDefaultMetaMaskDir() {
  for (const root of getChromeUserDataRoots()) {
    const dir = path.join(
      root,
      'Default',
      'Local Extension Settings',
      METAMASK_EXT_ID
    )
    try {
      if (fs.statSync(dir).isDirectory()) return dir
    } catch {
      // skip
    }
  }
  return null
}

/**
 * @param {string} dir
 * @returns {string[]} newest .log/.ldb first
 */
export function listVaultCandidateFiles(dir) {
  let names
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }

  return names
    .filter((n) => /\.(log|ldb)$/i.test(n))
    .map((n) => path.join(dir, n))
    .map((full) => {
      try {
        const st = fs.statSync(full)
        return { full, mtime: st.mtimeMs, size: st.size }
      } catch {
        return null
      }
    })
    .filter((f) => f && f.size > 0)
    .sort((a, b) => b.mtime - a.mtime)
    .map((f) => f.full)
}

/** @returns {{ dir: string|null, files: string[] }} */
export function discoverDefaultChromeVaultFiles() {
  const dir = findDefaultMetaMaskDir()
  if (!dir) return { dir: null, files: [] }
  return { dir, files: listVaultCandidateFiles(dir) }
}

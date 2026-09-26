/**
 * Resolve MetaMask vault from an explicit path or the default Chrome profile.
 */

import fs from 'node:fs'
import path from 'node:path'
import {
  discoverDefaultChromeVaultFiles,
  listVaultCandidateFiles,
} from './chrome.js'
import { extractVaultFromFile } from './vault-extract.js'
import { isVaultValid, isCleartextVault } from './extract.js'
import * as ui from '../ui.js'

/**
 * @param {string|null|undefined} pathOption
 * @returns {{ vault: object, source: string }|null}
 */
export function loadVault(pathOption) {
  if (pathOption) {
    return loadFromPath(pathOption)
  }
  return loadFromDefaultChrome()
}

function loadFromPath(inputPath) {
  const resolved = path.resolve(inputPath)
  if (!fs.existsSync(resolved)) {
    throw new Error(`Path not found: ${resolved}`)
  }

  const st = fs.statSync(resolved)
  if (st.isDirectory()) {
    const files = listVaultCandidateFiles(resolved)
    if (!files.length) {
      throw new Error(`No .log / .ldb files in ${resolved}`)
    }
    ui.step(`Scanning ${files.length} file${files.length === 1 ? '' : 's'}`)
    const found = scanFiles(files)
    if (!found) throw new Error(`No MetaMask vault in ${resolved}`)
    return found
  }

  const raw = fs.readFileSync(resolved, 'utf8')
  const vault = extractVaultFromFile(raw)
  if (!vault || !(isVaultValid(vault) || isCleartextVault(vault))) {
    throw new Error(`No MetaMask vault in ${path.basename(resolved)}`)
  }
  return { vault, source: resolved }
}

function loadFromDefaultChrome() {
  const { dir, files } = discoverDefaultChromeVaultFiles()

  if (!dir) {
    return null
  }

  if (!files.length) {
    ui.warn(`MetaMask folder empty: ${dir}`)
    return null
  }

  ui.step(`Chrome Default`, dir)
  ui.step(`Scanning ${files.length} file${files.length === 1 ? '' : 's'}`)

  const found = scanFiles(files)
  if (!found) {
    return null
  }
  return found
}

function scanFiles(files) {
  for (const f of files) {
    try {
      const raw = fs.readFileSync(f, 'utf8')
      const vault = extractVaultFromFile(raw)
      if (vault && (isVaultValid(vault) || isCleartextVault(vault))) {
        return { vault, source: f }
      }
    } catch {
      // skip unreadable
    }
  }
  return null
}

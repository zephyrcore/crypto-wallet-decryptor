/**
 * Exodus target — flow ported from the reference codebase:
 *
 *   1. locate exodus.wallet/seed.seco
 *   2. if passphrase.json exists → decrypt with the stored passphrase
 *      (no password list needed at all)
 *   3. else if a password list exists → try each password (SECO decrypt)
 *   4. else / on failure → direct decrypt attempt (empty password)
 *
 * seed.seco payload after decryption:
 *   gzip( uint32BE(len) + BIP39 seed buffer (64-byte seed + entropy) )
 *
 * The run NEVER stops because passwords are unavailable.
 */

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import seco from 'secure-container'
import bitcoinSeed from 'bitcoin-seed'
import * as ui from '../ui.js'

/** Extract the mnemonic from decrypted SECO payload bytes. */
function extractMnemonicFromSeed(gunzipped) {
  const seed = bitcoinSeed.fromBuffer(gunzipped)
  if (!seed || !seed.mnemonicString) {
    throw new Error('Failed to extract mnemonic from buffer.')
  }
  return seed.mnemonicString
}

/** Full decrypt + extract with a known password. Returns mnemonic string. */
function decryptAndExtractMnemonic(seedData, password) {
  const { data } = seco.decrypt(seedData, password)
  if (!data || data.length < 4) {
    throw new Error('Invalid SECO data: buffer too short.')
  }
  const t = data.readUInt32BE(0)
  if (data.length < t + 4) {
    throw new Error(`Invalid SECO data: expected ${t + 4} bytes, got ${data.length}.`)
  }
  const gunzipped = zlib.gunzipSync(data.subarray(4, t + 4))
  return extractMnemonicFromSeed(gunzipped)
}

/**
 * Locate seed.seco across platforms.
 * Mirrors the reference: passwordRequired = !exists(passphrase.json).
 */
export function locateSeedFile(overridePath) {
  if (overridePath) {
    const resolved = path.resolve(overridePath)
    if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
      return { ok: true, seedPath: resolved, walletDir: path.dirname(resolved) }
    }
    const asDir = path.join(resolved, 'seed.seco')
    if (fs.existsSync(asDir)) {
      return { ok: true, seedPath: asDir, walletDir: resolved }
    }
    return { ok: false, error: `seed.seco not found at: ${resolved}` }
  }

  const platform = os.platform()
  let exodusDir

  switch (platform) {
    case 'win32':
      exodusDir = path.join(process.env.APPDATA || '', 'Exodus', 'exodus.wallet')
      break
    case 'darwin':
      exodusDir = path.join(
        os.homedir(),
        'Library',
        'Application Support',
        'Exodus',
        'exodus.wallet'
      )
      break
    case 'linux':
      exodusDir = path.join(os.homedir(), '.config', 'Exodus', 'exodus.wallet')
      break
    default:
      return { ok: false, error: `Unsupported OS: ${platform}` }
  }

  const seedPath = path.join(exodusDir, 'seed.seco')
  const passphrasePath = path.join(exodusDir, 'passphrase.json')

  if (!fs.existsSync(seedPath)) {
    return { ok: false, error: `seed.seco not found at: ${seedPath}` }
  }

  return {
    ok: true,
    seedPath,
    walletDir: exodusDir,
    passwordRequired: !fs.existsSync(passphrasePath),
  }
}

/** Try one password (SECO decrypt). Returns mnemonic string or null. */
export function tryPassword(seedData, password) {
  try {
    return decryptAndExtractMnemonic(seedData, password)
  } catch {
    return null
  }
}

/** Read the stored passphrase from passphrase.json, if present. */
function readStoredPassphrase(walletDir) {
  const passphrasePath = path.join(walletDir, 'passphrase.json')
  if (!fs.existsSync(passphrasePath)) return undefined
  try {
    const parsed = JSON.parse(fs.readFileSync(passphrasePath, 'utf8'))
    if (parsed && typeof parsed.passphrase === 'string' && parsed.passphrase.length > 0) {
      return parsed.passphrase
    }
  } catch {
    // invalid JSON or shape — fall through
  }
  return null
}

/**
 * @param {string[]} passwords
 * @param {{ path?: string }} [opts]
 * @returns {Promise<boolean>} true if the wallet was decrypted
 */
export async function runExodus(passwords, opts = {}) {
  ui.section('Exodus')

  const located = locateSeedFile(opts.path)
  if (!located.ok) {
    ui.error(located.error)
    ui.detail('Expected the Exodus wallet folder to contain seed.seco')
    return false
  }

  const { seedPath, walletDir } = located
  let seedData
  try {
    seedData = fs.readFileSync(seedPath)
  } catch (err) {
    ui.error(`Cannot read seed file: ${err.message}`)
    return false
  }

  ui.ok('Wallet found', path.basename(seedPath))
  ui.step('Size', `${seedData.length} bytes`)

  const started = performance.now()

  // ── 1. Stored passphrase: decrypts without any password list ──
  const stored = readStoredPassphrase(walletDir)
  if (stored) {
    ui.step('Mode', 'stored passphrase (passphrase.json)')
    const mnemonic = tryPassword(seedData, stored)
    if (mnemonic) {
      ui.found({ password: '[Stored Passphrase]', attempts: 1, workers: 1, elapsedMs: performance.now() - started })
      printMnemonic(mnemonic)
      return true
    }
    ui.warn('Stored passphrase did not decrypt the wallet')
    // fall through — never stop here
  }

  // ── 2. Password list (optional) ──
  if (passwords.length) {
    ui.step('Mode', `${passwords.length} password${passwords.length === 1 ? '' : 's'} from list`)
    let tried = 0
    for (const password of passwords) {
      tried++
      const mnemonic = tryPassword(seedData, password)
      ui.progress(tried, passwords.length)
      if (mnemonic) {
        ui.progressClear()
        ui.found({ password, attempts: tried, workers: 1, elapsedMs: performance.now() - started })
        printMnemonic(mnemonic)
        return true
      }
    }
    ui.progressClear()
    ui.warn(`No match in list \u00b7 ${tried} tried`)
    // fall through — never stop here
  }

  // ── 3. Direct decrypt attempt (always runs, even with no passwords) ──
  ui.step('Mode', 'direct decrypt (no password)')
  const mnemonic = tryPassword(seedData, '')
  if (mnemonic) {
    ui.found({ password: '', attempts: 1, workers: 1, elapsedMs: performance.now() - started })
    printMnemonic(mnemonic)
    return true
  }

  ui.notFound({ attempts: passwords.length, elapsedMs: performance.now() - started })
  ui.detail('Wallet is encrypted \u00b7 add candidate passwords to passwords.txt')
  return false
}

function printMnemonic(mnemonic) {
  ui.blank()
  ui.divider()
  ui.kv('mnemonic', mnemonic, { highlight: true, width: 9 })
  ui.divider()
}

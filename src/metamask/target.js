/**
 * MetaMask target: locate vault, run worker pool, report result.
 */

import path from 'node:path'
import os from 'node:os'
import { loadVault } from './load-vault.js'
import { crackVault, describePlan } from './crack.js'
import { getIterations, tryDecryptSync } from './decrypt.js'
import {
  isCleartextVault,
  isVaultValid,
  extractMnemonic,
} from './extract.js'
import * as ui from '../ui.js'

/**
 * @param {string[]} passwords
 * @param {{ path?: string, workers?: number }} [opts]
 * @returns {Promise<boolean>} true if a password was found
 */
export async function runMetaMask(passwords, opts = {}) {
  ui.section('MetaMask')

  let loaded
  try {
    loaded = loadVault(opts.path)
  } catch (err) {
    ui.error(err.message)
    return false
  }

  if (!loaded) {
    ui.warn('No MetaMask vault found')
    ui.detail('Checked Chrome / Edge / Brave "Default" profile (Local Extension Settings)')
    ui.detail('Pass an explicit path: --file <dir-or-file>')
    return false
  }

  const { vault, source } = loaded
  const sourceLabel = path.basename(source)
  ui.ok('Vault found', sourceLabel)

  if (isCleartextVault(vault)) {
    ui.info('Cleartext seed (unencrypted vault)')
    printKeyrings([vault])
    return true
  }

  if (!isVaultValid(vault)) {
    ui.error('Extracted data is not a valid encrypted vault')
    return false
  }

  if (passwords.length) {
    ui.step('Plan', describePlan(passwords.length, workersFor(passwords, opts), getIterations(vault)))

    let result
    try {
      result = await crackVault(vault, passwords, {
        workers: opts.workers,
        onProgress: (done, total) => ui.progress(done, total),
      })
    } catch (err) {
      ui.progressClear()
      ui.error(err.message)
      // fall through to direct attempt — never stop here
    }

    ui.progressClear()

    if (result) {
      ui.found({
        password: result.password,
        attempts: result.attempts,
        workers: result.workers,
        elapsedMs: result.elapsedMs,
      })
      printKeyrings(result.keyrings)
      return true
    }

    ui.warn(`No match in list \u00b7 ${passwords.length} tried`)
  }

  // ── Direct decrypt attempt: always runs, even with no passwords ──
  return tryDirectDecrypt(vault)
}

function workersFor(passwords, opts) {
  // mirror computeWorkerCount for the plan line without spawning workers
  if (opts.workers != null && opts.workers > 0) {
    return Math.min(opts.workers, Math.max(1, passwords.length))
  }
  if (passwords.length <= 1) return 1
  let cores
  try {
    cores = os.availableParallelism()
  } catch {
    cores = 4
  }
  const usable = cores <= 1 ? 1 : cores === 2 ? 2 : cores - 1
  return Math.max(1, Math.min(usable, passwords.length, 32))
}

/**
 * Direct decrypt attempt with an empty password. Runs even when no
 * password list exists, so cleartext / unprotected vaults still decrypt.
 */
function tryDirectDecrypt(vault) {
  const started = performance.now()
  ui.step('Mode', 'direct decrypt (no password)')
  const keyrings = tryDecryptSync('', vault)
  if (keyrings) {
    ui.found({ password: '', attempts: 1, workers: 1, elapsedMs: performance.now() - started })
    printKeyrings(keyrings)
    return true
  }
  ui.notFound({ attempts: 1, elapsedMs: performance.now() - started })
  ui.detail('Vault is encrypted \u00b7 add candidate passwords to passwords.txt')
  return false
}

function printKeyrings(keyrings) {
  const mnemonic = extractMnemonic(keyrings)

  ui.blank()
  ui.divider()

  for (let i = 0; i < keyrings.length; i++) {
    const kr = keyrings[i]
    const type = kr.type || 'unknown'

    if (keyrings.length > 1) {
      ui.keyringTitle(i, type)
    } else {
      ui.kv('type', type)
    }

    if (kr.data?.mnemonic) {
      ui.kv('mnemonic', kr.data.mnemonic, { highlight: true, width: 9 })
    }
    if (kr.data?.numberOfAccounts != null) {
      ui.kv('accounts', String(kr.data.numberOfAccounts), { width: 9 })
    }
    if (Array.isArray(kr.data?.accounts)) {
      for (const acc of kr.data.accounts) ui.bullet(acc)
    }
  }

  ui.divider()
}

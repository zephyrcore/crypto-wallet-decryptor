/**
 * MetaMask vault decrypt — native Node crypto.
 *
 * Same pipeline as @metamask/browser-passworder:
 *   PBKDF2-SHA256 → 32-byte AES key, AES-256-GCM (tag = last 16 bytes).
 * Legacy vaults default to 10,000 iterations when keyMetadata is absent.
 */

import { pbkdf2Sync, createDecipheriv } from 'node:crypto'
import { decodeMnemonic, isCleartextVault } from './extract.js'

export const LEGACY_ITERATIONS = 10_000
const AES_KEY_LEN = 32
const GCM_TAG_LEN = 16

export function getIterations(vault) {
  const n = vault?.keyMetadata?.params?.iterations
  return Number.isFinite(n) && n > 0 ? n : LEGACY_ITERATIONS
}

/**
 * Decrypt vault with password. Throws on wrong password / bad data.
 * @param {string} password
 * @param {object} vault  { data, iv, salt, keyMetadata? }
 * @returns {object[]} keyrings
 */
export function decryptVaultSync(password, vault) {
  if (isCleartextVault(vault)) {
    return [vault]
  }

  const salt = Buffer.from(vault.salt, 'base64')
  const iv = Buffer.from(vault.iv, 'base64')
  const encrypted = Buffer.from(vault.data, 'base64')
  const iterations = getIterations(vault)

  if (encrypted.length <= GCM_TAG_LEN) {
    throw new Error('Invalid vault ciphertext')
  }

  const key = pbkdf2Sync(password, salt, iterations, AES_KEY_LEN, 'sha256')
  const tag = encrypted.subarray(encrypted.length - GCM_TAG_LEN)
  const ciphertext = encrypted.subarray(0, encrypted.length - GCM_TAG_LEN)

  let plain
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, iv)
    decipher.setAuthTag(tag)
    plain = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  } catch {
    throw new Error('Incorrect password')
  }

  return normalizeKeyrings(JSON.parse(plain.toString('utf8')))
}

/** Try password; returns null on failure instead of throwing. */
export function tryDecryptSync(password, vault) {
  try {
    return decryptVaultSync(password, vault)
  } catch {
    return null
  }
}

function normalizeKeyrings(keyrings) {
  if (!Array.isArray(keyrings)) {
    throw new Error('Unexpected decrypted payload')
  }
  return keyrings.map((keyring) => {
    if (keyring?.data && 'mnemonic' in keyring.data) {
      return {
        ...keyring,
        data: {
          ...keyring.data,
          mnemonic: decodeMnemonic(keyring.data.mnemonic),
        },
      }
    }
    return keyring
  })
}

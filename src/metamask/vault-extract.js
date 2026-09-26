/**
 * Extract MetaMask vault blobs from LevelDB logs / raw JSON.
 * Ported from the official MetaMask vault-decryptor (multi-format).
 */

import { dedupe } from './extract.js'

/**
 * @param {string} data
 * @returns {object|null}
 */
export function extractVaultFromFile(data) {
  // 1. Raw JSON
  try {
    return JSON.parse(data)
  } catch {
    // continue
  }

  // 2. Pre-v3 cleartext seed
  {
    const matches = data.match(/{"wallet-seed":"([^"}]*)"/)
    if (matches?.length) {
      const mnemonic = matches[1].replace(/\\n*/, '')
      const vaultMatches = data.match(/"wallet":("{[ -~]*\\"version\\":2}")/)
      const vault = vaultMatches ? JSON.parse(JSON.parse(vaultMatches[1])) : {}
      return { data: { mnemonic, ...vault } }
    }
  }

  // 2b. Cleartext keyring JSON (data.mnemonic present, no encryption fields)
  {
    const cleartextMatch = data.match(
      /\{"data":\s*\{[^{}]*"mnemonic"[\s\S]*?\}\}(?=\s*[,}\]])/
    )
    if (cleartextMatch?.length) {
      try {
        return JSON.parse(cleartextMatch[0])
      } catch {
        // continue
      }
    }
  }

  // 3. Chromium 000003.log (Linux)
  {
    const matches = data.match(/"KeyringController":{"vault":"{[^{}]*}"/)
    if (matches?.length) {
      const vaultBody = matches[0].substring(29)
      return JSON.parse(JSON.parse(vaultBody))
    }
  }

  // 4. Chromium 000006.log (macOS) + keyMetadata
  {
    const matches = data.match(/KeyringController":(\{"vault":".*?=\\"\}"\})/)
    if (matches?.length) {
      try {
        return parseEscapedVault(matches[1])
      } catch {
        // continue
      }
    }
  }

  // 5. Newer macOS logs (keyringsMetadata present)
  {
    const matches = data.match(
      /"KeyringController":(\{.*?"vault":".*?=\\"\}"\})/
    )
    if (matches?.length) {
      try {
        return parseEscapedVault(matches[1])
      } catch {
        // continue
      }
    }
  }

  // 6. Windows .ldb
  {
    const matchRegex = /Keyring[0-9][^}]*(\{[^{}]*\\"\})/gu
    const captureRegex = /Keyring[0-9][^}]*(\{[^{}]*\\"\})/u
    const ivRegex =
      /\\"iv.{1,4}[^A-Za-z0-9+/]{1,10}([A-Za-z0-9+/]{10,40}=*)/u
    const dataRegex = /\\"[^":,is]*\\":\\"([A-Za-z0-9+/=]*)/u
    const saltRegex =
      /,\\"salt.{1,4}[^A-Za-z0-9+/]{1,10}([A-Za-z0-9+/]{10,100}=*)/u

    const vaults = dedupe(
      data
        .match(matchRegex)
        ?.map((m) => m.match(captureRegex)?.[1])
        .filter(Boolean)
        .map((s) => [dataRegex, ivRegex, saltRegex].map((r) => s.match(r)))
        .filter(
          ([d, i, s]) =>
            d?.length > 1 && i?.length > 1 && s?.length > 1
        )
        .map(([d, i, s]) => ({
          data: d[1],
          iv: i[1],
          salt: s[1],
        }))
    )

    if (vaults.length) return vaults[0]
  }

  // 7. Split-state Windows log
  {
    const vaultRegex = /KeyringController[\s\S]*?"vault":"((?:[^"\\]|\\.)*)"/g
    const vaults = []
    let match
    while ((match = vaultRegex.exec(data)) !== null) {
      try {
        const vaultString = JSON.parse(`"${match[1]}"`)
        vaults.push(JSON.parse(vaultString))
      } catch {
        // continue
      }
    }
    const deduped = dedupe(vaults)
    if (deduped.length) return deduped[0]
  }

  return null
}

function parseEscapedVault(fragment) {
  const dataRegex = /\\"data\\":\\"([A-Za-z0-9+/=]*)/u
  const ivRegex = /,\\"iv\\":\\"([A-Za-z0-9+/]{10,40}=*)/u
  const saltRegex = /,\\"salt\\":\\"([A-Za-z0-9+/]{10,100}=*)\\"/
  const keyMetaRegex = /,\\"keyMetadata\\":(.*}})/

  const parts = [dataRegex, ivRegex, saltRegex, keyMetaRegex]
    .map((reg) => fragment.match(reg))
    .map((m) => m[1])

  return {
    data: parts[0],
    iv: parts[1],
    salt: parts[2],
    keyMetadata: JSON.parse(parts[3].replaceAll('\\', '')),
  }
}

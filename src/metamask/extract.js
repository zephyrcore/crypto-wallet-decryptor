/** Shallow dedupe of objects by key/value equality. */

export function dedupe(arr) {
  const result = []
  for (const x of arr ?? []) {
    if (x == null) continue
    const keys = Object.keys(x)
    const exists = result.some(
      (y) =>
        Object.keys(y).length === keys.length &&
        keys.every((k) => y[k] === x[k])
    )
    if (!exists) result.push(x)
  }
  return result
}

/**
 * MetaMask may store mnemonic as a string, an array of chars/bytes, or
 * UTF-8 bytes. Normalize all shapes to a readable string.
 */
export function decodeMnemonic(mnemonic) {
  if (typeof mnemonic === 'string') return mnemonic
  if (Array.isArray(mnemonic)) {
    if (mnemonic.every((x) => typeof x === 'string' && x.length > 1)) {
      return mnemonic.join(' ')
    }
    return Buffer.from(mnemonic).toString('utf8')
  }
  return Buffer.from(mnemonic).toString('utf8')
}

/** Encrypted vault shape: { data, iv, salt } as strings. */
export function isVaultValid(vault) {
  return (
    typeof vault === 'object' &&
    vault !== null &&
    ['data', 'iv', 'salt'].every((k) => typeof vault[k] === 'string')
  )
}

export function isCleartextVault(vault) {
  return Boolean(vault?.data?.mnemonic)
}

export function extractMnemonic(keyrings) {
  if (!Array.isArray(keyrings)) return null
  for (const kr of keyrings) {
    if (kr?.data?.mnemonic != null) {
      return decodeMnemonic(kr.data.mnemonic)
    }
  }
  return null
}

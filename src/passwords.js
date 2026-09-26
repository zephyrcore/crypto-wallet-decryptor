/**
 * Single password list: ./passwords.txt (one per line).
 * # comments and blank lines are ignored. Deduped, order preserved.
 *
 * The list is OPTIONAL: a missing or empty default file never aborts the
 * run — targets fall back to stored passphrase / direct decrypt attempts.
 * Only an explicitly requested (-P) file that is missing is a hard error.
 */

import fs from 'node:fs'
import path from 'node:path'

export const PASSWORD_FILE = 'passwords.txt'

/**
 * @param {string} [overridePath]  optional explicit list file
 * @param {{ cwd?: string }} [opts]
 * @returns {{ passwords: string[], source: string, missing: boolean }}
 */
export function loadPasswords(overridePath, opts = {}) {
  const cwd = opts.cwd ?? process.cwd()
  const file = path.resolve(cwd, overridePath ?? PASSWORD_FILE)

  if (!fs.existsSync(file)) {
    if (overridePath) {
      throw new Error(`Password list not found: ${file}`)
    }
    // No default list — continue without passwords.
    return { passwords: [], source: file, missing: true }
  }

  const text = fs.readFileSync(file, 'utf8')
  const passwords = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'))

  return { passwords: [...new Set(passwords)], source: file, missing: false }
}

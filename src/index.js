/**
 * Public API.
 */

export { loadPasswords, PASSWORD_FILE } from './passwords.js'
export { runMetaMask } from './metamask/target.js'
export { runExodus, locateSeedFile, tryPassword } from './exodus/target.js'
export {
  decryptVaultSync,
  tryDecryptSync,
  getIterations,
  LEGACY_ITERATIONS,
} from './metamask/decrypt.js'
export {
  isVaultValid,
  isCleartextVault,
  extractMnemonic,
  dedupe,
} from './metamask/extract.js'
export { extractVaultFromFile } from './metamask/vault-extract.js'
export {
  discoverDefaultChromeVaultFiles,
  findDefaultMetaMaskDir,
  listVaultCandidateFiles,
  METAMASK_EXT_ID,
} from './metamask/chrome.js'
export { crackVault, computeWorkerCount } from './metamask/crack.js'
export { loadVault } from './metamask/load-vault.js'

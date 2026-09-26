/**
 * Worker thread: try MetaMask vault passwords (native crypto, sync).
 * Protocol:
 *   parent → { type: 'init', vault }
 *   parent → { type: 'try', id, password }
 *   parent → { type: 'shutdown' }
 *   worker → { type: 'ready' }
 *   worker → { type: 'result', id, ok, password?, keyrings? }
 */

import { parentPort } from 'node:worker_threads'
import { tryDecryptSync } from './decrypt.js'

let vault = null

parentPort.on('message', (msg) => {
  if (!msg || typeof msg !== 'object') return

  switch (msg.type) {
    case 'init': {
      vault = msg.vault
      parentPort.postMessage({ type: 'ready' })
      break
    }
    case 'try': {
      if (!vault) {
        parentPort.postMessage({
          type: 'result',
          id: msg.id,
          ok: false,
          error: 'Worker not initialized',
        })
        return
      }
      const keyrings = tryDecryptSync(msg.password, vault)
      if (keyrings) {
        parentPort.postMessage({
          type: 'result',
          id: msg.id,
          ok: true,
          password: msg.password,
          keyrings,
        })
      } else {
        parentPort.postMessage({ type: 'result', id: msg.id, ok: false })
      }
      break
    }
    case 'shutdown': {
      process.exit(0)
      break
    }
    default:
      break
  }
})

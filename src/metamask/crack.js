/**
 * Parallel MetaMask vault cracking via worker_threads.
 * All workers stop as soon as one password succeeds.
 */

import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { availableParallelism } from 'node:os'
import { getIterations, tryDecryptSync } from './decrypt.js'

const workerPath = fileURLToPath(new URL('./worker.js', import.meta.url))

const CAP = 32

function safeParallelism() {
  try {
    return availableParallelism()
  } catch {
    return 4
  }
}

/**
 * @param {number} passwordCount
 * @param {{ override?: number }} [opts]
 * @returns {number}
 */
export function computeWorkerCount(passwordCount, opts = {}) {
  if (opts.override != null && opts.override > 0) {
    return Math.min(opts.override, Math.max(1, passwordCount))
  }
  if (passwordCount <= 0) return 0
  if (passwordCount === 1) return 1

  const cores = safeParallelism()
  let usable
  if (cores <= 1) usable = 1
  else if (cores === 2) usable = 2
  else usable = cores - 1

  return Math.max(1, Math.min(usable, passwordCount, CAP))
}

/**
 * Try passwords against vault. Main-thread sync path for a single
 * password; worker pool for lists.
 *
 * @param {object} vault
 * @param {string[]} passwords
 * @param {{ workers?: number, onProgress?: (done: number, total: number) => void }} [opts]
 * @returns {Promise<{ password: string, keyrings: object[], attempts: number, workers: number, elapsedMs: number }|null>}
 */
export async function crackVault(vault, passwords, opts = {}) {
  const list = [...new Set(passwords.filter((p) => p != null && p !== ''))]
  if (!list.length) {
    throw new Error('No passwords to try')
  }

  const workers = computeWorkerCount(list.length, { override: opts.workers })
  const started = performance.now()

  if (list.length === 1) {
    const keyrings = tryDecryptSync(list[0], vault)
    opts.onProgress?.(1, 1)
    if (!keyrings) return null
    return {
      password: list[0],
      keyrings,
      attempts: 1,
      workers: 1,
      elapsedMs: performance.now() - started,
    }
  }

  return runPool(vault, list, workers, opts.onProgress, started)
}

function runPool(vault, passwords, workerCount, onProgress, started) {
  return new Promise((resolve, reject) => {
    const workers = []
    let nextIndex = 0
    let done = 0
    let settled = false
    const total = passwords.length

    const finish = (result) => {
      if (settled) return
      settled = true
      for (const w of workers) {
        try {
          w.postMessage({ type: 'shutdown' })
          w.terminate()
        } catch {
          // ignore
        }
      }
      resolve(result)
    }

    const fail = (err) => {
      if (settled) return
      settled = true
      for (const w of workers) {
        try {
          w.terminate()
        } catch {
          // ignore
        }
      }
      reject(err)
    }

    const feed = (worker) => {
      if (settled) return
      if (nextIndex >= total) return
      const id = nextIndex
      const password = passwords[nextIndex++]
      worker.postMessage({ type: 'try', id, password })
    }

    const onWorkerMessage = (worker, msg) => {
      if (settled) return

      if (msg.type === 'ready') {
        feed(worker)
        return
      }

      if (msg.type === 'result') {
        done++
        onProgress?.(done, total)

        if (msg.ok) {
          finish({
            password: msg.password,
            keyrings: msg.keyrings,
            attempts: done,
            workers: workerCount,
            elapsedMs: performance.now() - started,
          })
          return
        }

        if (done >= total) {
          finish(null)
          return
        }

        feed(worker)
      }
    }

    for (let i = 0; i < workerCount; i++) {
      let worker
      try {
        worker = new Worker(workerPath, { execArgv: [] })
      } catch (err) {
        fail(err)
        return
      }

      workers.push(worker)

      worker.on('message', (msg) => onWorkerMessage(worker, msg))
      worker.on('error', (err) => fail(err))
      worker.on('exit', (code) => {
        if (!settled && code !== 0) {
          fail(new Error(`Worker exited with code ${code}`))
        }
      })

      worker.postMessage({ type: 'init', vault })
    }
  })
}

export function describePlan(passwordCount, workers, iterations) {
  const cores = safeParallelism()
  const iterLabel =
    iterations >= 1000 ? `${Math.round(iterations / 1000)}k` : String(iterations)
  return `${passwordCount} passwords \u00b7 ${workers} workers \u00b7 ${cores} cores \u00b7 PBKDF2 ${iterLabel} iter`
}

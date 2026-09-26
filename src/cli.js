#!/usr/bin/env node
/**
 * walletdecrypt — unified MetaMask + Exodus password recovery
 *
 *   node src/cli.js [options]
 *
 * Options:
 *   -m, --metamask        MetaMask only
 *   -e, --exodus          Exodus only
 *   -b, --both            Both (default)
 *   -P, --passwords <f>   Password list file (default ./passwords.txt)
 *   -f, --file <path>     Vault path: MetaMask LevelDB dir/file, or Exodus seed.seco / wallet dir
 *   -w, --workers <n>     MetaMask worker threads (default: auto)
 *   -h, --help            Help
 *   -V, --version         Version
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadPasswords, PASSWORD_FILE } from './passwords.js'
import { runMetaMask } from './metamask/target.js'
import { runExodus } from './exodus/target.js'
import * as ui from './ui.js'
import 'native-env/config';
const VERSION = '1.0.0'
const TITLE = 'walletdecrypt'

function usage(code = 0) {
  const out = code === 0 ? console.log : console.error
  out(`
${ui.c.bold(TITLE)}  ${ui.c.dim('v' + VERSION)}
  MetaMask + Exodus wallet password recovery

${ui.c.bold('Usage')}
  node src/cli.js [mode] [options]

${ui.c.bold('Mode')}
  -m, --metamask     MetaMask only
  -e, --exodus       Exodus only
  -b, --both         Both in sequence (default)

${ui.c.bold('Options')}
  -P, --passwords <file>   Password list (default: ./${PASSWORD_FILE})
  -f, --file <path>        Vault path
                            MetaMask: LevelDB dir or .log/.ldb/.json file
                            Exodus:   seed.seco file or exodus.wallet dir
  -w, --workers <n>        MetaMask worker threads (default: auto)
  -h, --help               Help
  -V, --version            Version

${ui.c.bold('Password list')}
  ./${PASSWORD_FILE}  — one password per line, # comments allowed,
  used for both targets. Blank lines are skipped.

${ui.c.bold('Examples')}
  node src/cli.js                     both targets, passwords.txt
  node src/cli.js --metamask          MetaMask only
  node src/cli.js --exodus            Exodus only
  node src/cli.js -m -f ./vault-dir   MetaMask with explicit vault dir
  node src/cli.js -e -f seed.seco     Exodus with explicit seed file
  node src/cli.js -P mylist.txt       custom password list
`)
  process.exit(code)
}

function parseArgs(argv) {
  const args = {
    target: 'both',
    passwordsFile: null,
    file: null,
    workers: undefined,
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    switch (a) {
      case '-h':
      case '--help':
        usage(0)
        break
      case '-V':
      case '--version':
        console.log(VERSION)
        process.exit(0)
        break
      case '-m':
      case '--metamask':
        args.target = 'metamask'
        break
      case '-e':
      case '--exodus':
        args.target = 'exodus'
        break
      case '-b':
      case '--both':
        args.target = 'both'
        break
      case '-P':
      case '--passwords':
        args.passwordsFile = argv[++i]
        break
      case '-f':
      case '--file':
        args.file = argv[++i]
        break
      case '-w':
      case '--workers':
        args.workers = Number(argv[++i])
        if (!Number.isFinite(args.workers) || args.workers < 1) {
          ui.error(`Invalid worker count: ${argv[i]}`)
          process.exit(1)
        }
        break
      default:
        if (a.startsWith('-')) {
          ui.error(`Unknown option: ${a}`)
          usage(1)
        }
        ui.error(`Unexpected argument: ${a}`)
        usage(1)
    }
  }

  return args
}

async function main() {
  const args = parseArgs(process.argv.slice(2))

  let passwordInfo = null
  try {
    passwordInfo = loadPasswords(args.passwordsFile)
  } catch (err) {
    ui.banner(TITLE, `v${VERSION}  \u00b7  MetaMask + Exodus recovery`)
    ui.error(err.message)
    process.exit(1)
  }

  let bannerShown = false
  if (passwordInfo.passwords.length) {
    ui.banner(TITLE, `v${VERSION}  \u00b7  MetaMask + Exodus recovery`)
    bannerShown = true
    ui.kv('passwords', `${ui.fmtInt(passwordInfo.passwords.length)} unique`, {
      highlight: false,
    })
    ui.kv('list', path.basename(passwordInfo.source))
  }

  const modeLabel =
    args.target === 'both'
      ? 'MetaMask + Exodus'
      : args.target === 'metamask'
        ? 'MetaMask'
        : 'Exodus'

  if (!bannerShown) {
    ui.banner(TITLE, `v${VERSION}  \u00b7  MetaMask + Exodus recovery`)
  }
  ui.kv('passwords', 'none \u00b7 stored-passphrase / direct decrypt only', {
    highlight: false,
  })
  ui.kv('mode', modeLabel)

  const opts = { path: args.file, workers: args.workers }
  const passwords = passwordInfo ? passwordInfo.passwords : []
  let found = false

  try {
    if (args.target === 'metamask' || args.target === 'both') {
      found = (await runMetaMask(passwords, opts)) || found
    }
    if (args.target === 'exodus' || args.target === 'both') {
      found = (await runExodus(passwords, opts)) || found
    }
  } catch (err) {
    ui.progressClear()
    ui.error(err?.stack || err?.message || String(err))
    process.exit(1)
  }

  ui.blank()

  if (!found) {
    ui.warn('No password matched in any checked wallet')
    if (passwordInfo.passwords.length) {
      ui.detail('Double-check passwords.txt and try common variations')
    } else {
      ui.detail('Create a passwords.txt with one password per line to run recovery')
    }
    process.exit(1)
  }
}

main().catch((err) => {
  ui.error(err?.stack || err?.message || String(err))
  process.exit(1)
})

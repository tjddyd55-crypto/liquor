import crypto from 'node:crypto'
import { execSync } from 'node:child_process'

const PROJECT = '0315198d-9564-42de-bfb3-6234dfccf530'
const key = crypto.randomBytes(32).toString('hex')
const cmd = [
  'railway', 'variable', 'set',
  `CONTRACT_TARGET_PHONE_ENCRYPTION_KEY=${key}`,
  '-p', PROJECT, '-e', 'develop', '-s', 'app', '--skip-deploys',
].join(' ')
execSync(cmd, { stdio: ['ignore', 'pipe', 'pipe'] })
console.log('set CONTRACT_TARGET_PHONE_ENCRYPTION_KEY=<redacted>')
execSync(`railway redeploy -p ${PROJECT} -e develop -s app -y`, { stdio: 'inherit' })

/** Pure rules: each check returns the reason a call is blocked, or null when it may run. */

const SEPARATORS = /&&|\|\||[;|\n]/

const DANGEROUS_TARGETS = new Set(['/', '/*', '~', '~/', '$HOME', '$HOME/', '.', '..', '*', './*', '~/*'])
const SYSTEM_DIRS = /^\/(bin|boot|dev|etc|lib|lib64|opt|proc|root|sbin|sys|usr|var|home)\/?$/

const words = (segment: string): string[] =>
  segment
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 0)
    .map(w => w.replace(/^["']|["']$/g, ''))

const stripPrefix = (ws: string[]): string[] => {
  let i = 0
  while (i < ws.length && (ws[i] === 'sudo' || ws[i] === 'command' || ws[i] === 'time' || /^\w+=/.test(ws[i]))) i++
  return ws.slice(i)
}

const isRecursive = (flags: string[]): boolean =>
  flags.some(f => f === '--recursive' || /^-[a-zA-Z]*[rR][a-zA-Z]*$/.test(f))

const isForce = (flags: string[]): boolean =>
  flags.some(f => f === '--force' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(f))

export const checkBash = (command: string): string | null => {
  if (/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/.test(command)) {
    return 'fork bomb'
  }
  if (/\b(curl|wget)\b[^|;&\n]*\|\s*(sudo\s+)?(ba|z|da)?sh\b/.test(command)) {
    return 'piping a download straight into a shell'
  }
  if (/\bdd\b[^;&|\n]*\bof=\/dev\//.test(command) || />\s*\/dev\/(sd|nvme|hd)/.test(command)) {
    return 'writing directly to a disk device'
  }
  if (/\bmkfs(\.\w+)?\b/.test(command)) {
    return 'formatting a filesystem'
  }

  for (const segment of command.split(SEPARATORS)) {
    const ws = stripPrefix(words(segment))
    if (ws.length === 0) continue
    const [program, ...rest] = ws
    const flags = rest.filter(w => w.startsWith('-'))
    const args = rest.filter(w => !w.startsWith('-'))

    if (program === 'rm' && isRecursive(flags)) {
      const target = args.find(a => DANGEROUS_TARGETS.has(a) || SYSTEM_DIRS.test(a))
      if (target !== undefined) return `recursive delete of ${target}`
    }

    if (program === 'git' && args[0] === 'push') {
      const lease = flags.some(f => f.startsWith('--force-with-lease'))
      if (isForce(flags) && !lease) return 'git push --force (use --force-with-lease)'
    }

    if (program === 'chmod' && isRecursive(flags) && args.some(a => a === '777' || a === 'a+rwx')) {
      return 'recursive chmod 777'
    }
  }

  return null
}

const baseName = (path: string): string => {
  const normalized = path.replace(/\\/g, '/')
  return normalized.slice(normalized.lastIndexOf('/') + 1).toLowerCase()
}

const isEnvFile = (name: string): boolean =>
  (name === '.env' || name.startsWith('.env.')) && !/\.(example|sample|template|dist)$/.test(name)

const isKeyFile = (name: string): boolean =>
  name === 'id_rsa' ||
  name === 'id_ed25519' ||
  name === 'id_ecdsa' ||
  name.endsWith('.pem') ||
  name.endsWith('.key') ||
  name.endsWith('.p12') ||
  name.endsWith('.pfx')

const isServiceAccount = (name: string): boolean =>
  /serviceaccount.*\.json$/.test(name) || /firebase-adminsdk.*\.json$/.test(name)

/** Writing or editing: secrets, keys, credentials and git internals are off limits. */
export const checkWrite = (path: string): string | null => {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  const name = baseName(path)
  if (isEnvFile(name)) return `${name} holds secrets`
  if (isKeyFile(name)) return `${name} is a private key or certificate`
  if (isServiceAccount(name)) return `${name} is a service-account key`
  if (name === '.npmrc' || name === '.netrc') return `${name} can hold access tokens`
  if (normalized.includes('/.aws/credentials')) return 'AWS credentials file'
  if (normalized.includes('/.git/') && !normalized.endsWith('/.git/info/exclude')) return 'git internals'
  return null
}

/** Reading: only private keys and cloud credentials. Reading .env is left to the user. */
export const checkRead = (path: string): string | null => {
  const normalized = path.replace(/\\/g, '/').toLowerCase()
  const name = baseName(path)
  if (isKeyFile(name)) return `${name} is a private key or certificate`
  if (isServiceAccount(name)) return `${name} is a service-account key`
  if (normalized.includes('/.aws/credentials') || normalized.includes('/.ssh/')) return 'credentials folder'
  return null
}

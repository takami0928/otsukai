import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { dirname, join } from 'node:path'

export const MANUAL_TEST_STATE_SCHEMA_VERSION = 1
export const MANUAL_TEST_STATE_RELATIVE_PATH = join(
  '.manual-test',
  'handwriting-manual-session.json',
)
export const MANUAL_TEST_LOCK_RELATIVE_PATH = join(
  '.manual-test',
  'handwriting-manual-session.lock',
)

const PHASES = new Set([
  'prepared',
  'worker-diagnostics-deploying',
  'worker-diagnostics-enabled',
  'pages-on-dispatched',
  'pages-on-verified',
  'active',
  'stop-requested',
  'pages-off-dispatched',
  'pages-off-verified',
  'worker-restored',
  'complete',
  'recovery-required',
])

const STATE_KEYS = new Set([
  'schemaVersion',
  'sessionId',
  'phase',
  'startTime',
  'expirationTime',
  'repository',
  'ref',
  'mainSha',
  'actor',
  'initialRepositoryVariables',
  'initialWorkerDeploymentId',
  'initialWorkerVersionId',
  'diagnosticWorkerDeploymentId',
  'diagnosticWorkerVersionId',
  'pagesOnRunId',
  'pagesOffRunId',
  'pagesOffSessionId',
  'manualURL',
  'recoveryStatus',
  'completedAt',
  'restoredWorkerDeploymentId',
  'restoredWorkerVersionId',
])

const INITIAL_VARIABLE_KEYS = new Set([
  'importEnabled',
  'diagnosticsEnabled',
  'endpointConfigured',
  'turnstileSiteKeyConfigured',
  'fingerprint',
])

export class ManualTestStateError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'ManualTestStateError'
    this.code = code
  }
}

export function resolveStatePaths(repositoryRoot) {
  return {
    statePath: join(repositoryRoot, MANUAL_TEST_STATE_RELATIVE_PATH),
    lockPath: join(repositoryRoot, MANUAL_TEST_LOCK_RELATIVE_PATH),
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function validateManualTestState(value) {
  const initialVariables = value?.initialRepositoryVariables
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !STATE_KEYS.has(key)) ||
    value.schemaVersion !== MANUAL_TEST_STATE_SCHEMA_VERSION ||
    typeof value.sessionId !== 'string' ||
    !/^[A-Za-z0-9-]{1,64}$/u.test(value.sessionId) ||
    typeof value.phase !== 'string' ||
    !PHASES.has(value.phase) ||
    typeof value.startTime !== 'string' ||
    Number.isNaN(Date.parse(value.startTime)) ||
    typeof value.expirationTime !== 'string' ||
    Number.isNaN(Date.parse(value.expirationTime)) ||
    typeof value.repository !== 'string' ||
    typeof value.ref !== 'string' ||
    typeof value.mainSha !== 'string' ||
    !/^[0-9a-f]{40}$/u.test(value.mainSha) ||
    !isRecord(initialVariables) ||
    Object.keys(initialVariables).some(
      (key) => !INITIAL_VARIABLE_KEYS.has(key),
    ) ||
    initialVariables.importEnabled !== 'false' ||
    initialVariables.diagnosticsEnabled !== 'false' ||
    initialVariables.endpointConfigured !== true ||
    initialVariables.turnstileSiteKeyConfigured !== true ||
    typeof initialVariables.fingerprint !== 'string' ||
    !/^[0-9a-f]{64}$/u.test(initialVariables.fingerprint) ||
    typeof value.initialWorkerDeploymentId !== 'string' ||
    typeof value.initialWorkerVersionId !== 'string' ||
    typeof value.recoveryStatus !== 'string'
  ) {
    throw new ManualTestStateError(
      'The manual-test state file is invalid.',
      'INVALID_STATE',
    )
  }
  return value
}

export async function readManualTestState(statePath) {
  let serialized
  try {
    serialized = await readFile(statePath, 'utf8')
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return undefined
    }
    throw error
  }
  try {
    return validateManualTestState(JSON.parse(serialized))
  } catch (error) {
    if (error instanceof ManualTestStateError) {
      throw error
    }
    throw new ManualTestStateError(
      'The manual-test state file is not valid JSON.',
      'CORRUPT_STATE',
    )
  }
}

async function pathExists(path) {
  try {
    await stat(path)
    return true
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return false
    }
    throw error
  }
}

export async function writeManualTestStateAtomic(statePath, state) {
  validateManualTestState(state)
  await mkdir(dirname(statePath), { recursive: true })
  const suffix = `${process.pid}-${Date.now()}`
  const temporaryPath = `${statePath}.${suffix}.tmp`
  const backupPath = `${statePath}.${suffix}.bak`
  const serialized = `${JSON.stringify(state, null, 2)}\n`
  await writeFile(temporaryPath, serialized, {
    encoding: 'utf8',
    flag: 'wx',
  })

  try {
    await rename(temporaryPath, statePath)
    return
  } catch (error) {
    if (
      error?.code !== 'EEXIST' &&
      error?.code !== 'EPERM' &&
      error?.code !== 'ENOTEMPTY'
    ) {
      await rm(temporaryPath, { force: true })
      throw error
    }
  }

  let movedExistingState = false
  try {
    if (await pathExists(statePath)) {
      await rename(statePath, backupPath)
      movedExistingState = true
    }
    await rename(temporaryPath, statePath)
    if (movedExistingState) {
      await rm(backupPath, { force: true })
    }
  } catch (error) {
    if (movedExistingState && !(await pathExists(statePath))) {
      await rename(backupPath, statePath)
    }
    await rm(temporaryPath, { force: true })
    throw error
  }
}

function isProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return error?.code === 'EPERM'
  }
}

async function readLock(lockPath) {
  try {
    return JSON.parse(await readFile(lockPath, 'utf8'))
  } catch {
    return undefined
  }
}

export async function acquireManualTestLock(
  lockPath,
  { sessionId = 'pending', allowStale = true } = {},
) {
  await mkdir(dirname(lockPath), { recursive: true })
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx')
      await handle.writeFile(
        `${JSON.stringify({
          schemaVersion: 1,
          pid: process.pid,
          sessionId,
          createdAt: new Date().toISOString(),
        })}\n`,
        'utf8',
      )
      await handle.close()
      let released = false
      return async () => {
        if (released) {
          return
        }
        released = true
        await rm(lockPath, { force: true })
      }
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        throw error
      }
      const lock = await readLock(lockPath)
      if (
        !allowStale ||
        (lock && isProcessAlive(Number(lock.pid)))
      ) {
        throw new ManualTestStateError(
          'Another manual-test operation is already running.',
          'LOCKED',
        )
      }
      await rm(lockPath, { force: true })
    }
  }
  throw new ManualTestStateError(
    'Could not acquire the manual-test lock.',
    'LOCKED',
  )
}

export function isIncompleteManualTestState(state) {
  return Boolean(state && state.phase !== 'complete')
}

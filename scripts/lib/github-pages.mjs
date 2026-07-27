import {
  NativeCommandError,
  parseJsonStdout,
  requireSuccess,
} from './native-command.mjs'

const TERMINAL_FAILURES = new Set([
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'startup_failure',
  'stale',
])

export class GitHubPagesError extends Error {
  constructor(message, code) {
    super(message)
    this.name = 'GitHubPagesError'
    this.code = code
  }
}

export function expectedManualRunTitle(sessionId) {
  return `Deploy Pages [manual:${sessionId}]`
}

export function selectManualWorkflowRun(
  runs,
  { sessionId, headSha, actor },
) {
  const expectedTitle = expectedManualRunTitle(sessionId)
  const matches = runs.filter(
    (run) =>
      run &&
      run.event === 'workflow_dispatch' &&
      run.display_title === expectedTitle &&
      run.head_sha === headSha &&
      (!actor || run.actor?.login === actor),
  )
  if (matches.length > 1) {
    throw new GitHubPagesError(
      'More than one Pages run matched the manual-test session.',
      'AMBIGUOUS_RUN',
    )
  }
  return matches[0]
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

export function createGitHubPagesClient({
  repository,
  repositoryRoot,
  runCaptured,
  runInteractive,
  fetchImpl = globalThis.fetch,
  ghCommand = 'gh',
  publicBaseUrl = 'https://takami0928.github.io/otsukai/',
  sleep = delay,
  now = Date.now,
}) {
  async function captureJson(args) {
    const result = await runCaptured(ghCommand, args, {
      cwd: repositoryRoot,
    })
    return parseJsonStdout(ghCommand, result)
  }

  async function getAuthenticatedActor() {
    const user = await captureJson(['api', 'user'])
    if (typeof user?.login !== 'string' || !user.login) {
      throw new GitHubPagesError(
        'Could not determine the authenticated GitHub actor.',
        'ACTOR_UNAVAILABLE',
      )
    }
    return user.login
  }

  async function dispatch({ ref, mode, sessionId }) {
    const result = await runCaptured(
      ghCommand,
      [
        'workflow',
        'run',
        'deploy.yml',
        '--ref',
        ref,
        '--repo',
        repository,
        '--field',
        `manual_test_mode=${mode}`,
        '--field',
        `manual_test_session_id=${sessionId}`,
      ],
      { cwd: repositoryRoot },
    )
    requireSuccess(ghCommand, result)
  }

  async function listWorkflowRuns(ref) {
    const response = await captureJson([
      'api',
      '--method',
      'GET',
      `repos/${repository}/actions/workflows/deploy.yml/runs`,
      '-f',
      'event=workflow_dispatch',
      '-f',
      `branch=${ref}`,
      '-f',
      'per_page=100',
    ])
    if (!Array.isArray(response?.workflow_runs)) {
      throw new GitHubPagesError(
        'GitHub returned an invalid workflow run list.',
        'INVALID_RUN_LIST',
      )
    }
    return response.workflow_runs
  }

  async function waitForRun(
    { ref, sessionId, headSha, actor },
    { timeoutMs = 120_000, pollIntervalMs = 2_000 } = {},
  ) {
    const deadline = now() + timeoutMs
    do {
      const run = selectManualWorkflowRun(await listWorkflowRuns(ref), {
        sessionId,
        headSha,
        actor,
      })
      if (run) {
        return run
      }
      await sleep(pollIntervalMs)
    } while (now() < deadline)

    throw new GitHubPagesError(
      'Timed out waiting for the manual Pages workflow run.',
      'RUN_DETECTION_TIMEOUT',
    )
  }

  async function watchRun(runId) {
    const exitCode = await runInteractive(
      ghCommand,
      [
        'run',
        'watch',
        String(runId),
        '--repo',
        repository,
        '--exit-status',
      ],
      { cwd: repositoryRoot },
    )
    const run = await captureJson([
      'api',
      `repos/${repository}/actions/runs/${runId}`,
    ])
    if (
      exitCode !== 0 ||
      run.status !== 'completed' ||
      run.conclusion !== 'success'
    ) {
      const conclusion =
        typeof run.conclusion === 'string' ? run.conclusion : 'unknown'
      const code = TERMINAL_FAILURES.has(conclusion)
        ? `PAGES_RUN_${conclusion.toUpperCase()}`
        : 'PAGES_RUN_FAILED'
      throw new GitHubPagesError(
        `The Pages workflow did not succeed (${conclusion}).`,
        code,
      )
    }
    return run
  }

  async function dispatchAndWait(
    options,
    {
      onDispatched,
      onRunDetected,
      timeoutMs,
      pollIntervalMs,
    } = {},
  ) {
    await dispatch(options)
    await onDispatched?.()
    const run = await waitForRun(options, {
      timeoutMs,
      pollIntervalMs,
    })
    await onRunDetected?.(run)
    return watchRun(run.id)
  }

  async function fetchManifest(sessionId) {
    const url = new URL('handwriting-deployment-state.json', publicBaseUrl)
    url.searchParams.set('session', sessionId)
    url.searchParams.set('cacheBust', `${now()}-${Math.random()}`)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15_000)
    try {
      const response = await fetchImpl(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
        signal: controller.signal,
      })
      if (!response || response.status !== 200) {
        throw new GitHubPagesError(
          `Deployment manifest returned HTTP ${response?.status ?? 0}.`,
          'MANIFEST_HTTP_ERROR',
        )
      }
      let manifest
      try {
        manifest = await response.json()
      } catch {
        throw new GitHubPagesError(
          'Deployment manifest is not valid JSON.',
          'MANIFEST_INVALID_JSON',
        )
      }
      return manifest
    } finally {
      clearTimeout(timeout)
    }
  }

  async function waitForManifest(
    expected,
    { timeoutMs = 120_000, pollIntervalMs = 2_000 } = {},
  ) {
    const deadline = now() + timeoutMs
    let lastError
    do {
      try {
        return validateDeploymentManifest(
          await fetchManifest(expected.sessionId),
          expected,
        )
      } catch (error) {
        lastError = error
      }
      await sleep(pollIntervalMs)
    } while (now() < deadline)

    throw new GitHubPagesError(
      `Timed out verifying the deployment manifest (${lastError?.code ?? 'unknown'}).`,
      'MANIFEST_TIMEOUT',
    )
  }

  return {
    getAuthenticatedActor,
    dispatch,
    listWorkflowRuns,
    waitForRun,
    watchRun,
    dispatchAndWait,
    fetchManifest,
    waitForManifest,
  }
}

export function validateDeploymentManifest(manifest, expected) {
  const allowedKeys = new Set([
    'schemaVersion',
    'commitSha',
    'manualTestMode',
    'manualTestSessionId',
    'handwritingImportEnabled',
    'diagnosticsEnabled',
    'endpointConfigured',
    'turnstileSiteKeyConfigured',
    'builtAt',
    'expiresAt',
  ])
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    Object.keys(manifest).some((key) => !allowedKeys.has(key)) ||
    manifest.schemaVersion !== 1 ||
    manifest.commitSha !== expected.commitSha ||
    manifest.manualTestMode !== expected.mode ||
    manifest.manualTestSessionId !== expected.sessionId ||
    manifest.handwritingImportEnabled !== expected.importEnabled ||
    manifest.diagnosticsEnabled !== expected.diagnosticsEnabled ||
    manifest.endpointConfigured !== true ||
    manifest.turnstileSiteKeyConfigured !== true ||
    typeof manifest.builtAt !== 'string' ||
    Number.isNaN(Date.parse(manifest.builtAt)) ||
    (expected.mode === 'manual-on' &&
      (typeof manifest.expiresAt !== 'string' ||
        Number.isNaN(Date.parse(manifest.expiresAt))))
  ) {
    throw new GitHubPagesError(
      'Deployment manifest does not match the requested session.',
      'MANIFEST_MISMATCH',
    )
  }
  return manifest
}

export function toSafePagesError(error) {
  if (error instanceof GitHubPagesError) {
    return { code: error.code, message: error.message }
  }
  if (error instanceof NativeCommandError) {
    return { code: error.code, message: error.message }
  }
  return {
    code: 'PAGES_UNKNOWN_ERROR',
    message: 'The Pages operation failed.',
  }
}

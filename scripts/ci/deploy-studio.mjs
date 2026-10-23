import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

// Deploys a release of NocoITAM to one NocoBase Studio, from
// .github/workflows/deploy-studio.yml: run when a release tag (v<version>,
// pushed with the "Release <version>" commit) reaches GitHub, after the
// workflow has checked and built the archive `pnpm build --tar` writes, once
// for each Studio the release goes to (the workflow's environments
// studio-internal, studio-cn and studio-global, each with its own server,
// address and API key). The
// archive is uploaded with `nb-studio deploy`; Studio either deploys it, and
// this waits until the application runs that very release and answers its
// health check, or holds it for an approval in Studio. Nothing is retried
// or rolled back automatically: an upload whose outcome is unknown may
// already be in Studio.

const ARCHIVE = 'storage/exports/dist.tar.gz';
// The application's id in Studio, which its health check also names.
export const APP_ID = 'itam';

// An upload may take ten minutes; a read gets less. A timeout never proves
// Studio refused the upload.
const UPLOAD_PROCESS_TIMEOUT = 10 * 60_000;
const READ_PROCESS_TIMEOUT = 3 * 60_000;

export function runStudioCli(env, args, execute = execFileSync) {
  const uploading =
    args[0] === 'deploy' && args[1] === '--app' && args.includes('--file');
  const timeout = uploading ? UPLOAD_PROCESS_TIMEOUT : READ_PROCESS_TIMEOUT;
  let output;
  try {
    output = execute(env.STUDIO_CLI, args, {
      encoding: 'utf8',
      timeout,
      maxBuffer: 4 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    // The CLI's output is never kept: it may hold upload tickets.
    let reason;
    if (error.code === 'ETIMEDOUT')
      reason = `process timeout after ${timeout / 1000}s`;
    else if (error.code === 'ENOBUFS')
      reason = 'CLI output exceeded the process buffer';
    else if (error.code === 'ENOENT') reason = 'CLI executable not found';
    else {
      let code = 'transport/process error';
      try {
        const reported = JSON.parse(error.stdout).error?.code;
        if (typeof reported === 'string' && /^[A-Z0-9_]{1,80}$/u.test(reported))
          code = reported;
      } catch {
        // Not a JSON answer.
      }
      reason = `${code}; exit=${Number.isInteger(error.status) ? error.status : 'unavailable'}`;
    }
    const recovery = uploading
      ? 'Whether Studio received the upload is unknown. Look for a release and deployment of this commit in Studio before running the workflow again.'
      : 'Look at Studio before running the workflow again.';
    // eslint-disable-next-line preserve-caught-error
    throw new Error(
      `Studio ${uploading ? 'archive upload' : 'read command'} failed: ${reason}. ${recovery}`,
    );
  }
  return parseEnvelope(output);
}

export function parseEnvelope(text) {
  let envelope;
  try {
    envelope = JSON.parse(text);
  } catch {
    // The text may hold upload tickets, so it is not quoted.
    throw new Error('Studio CLI returned invalid JSON');
  }
  assert(
    envelope?.ok === true && envelope.status === 'success',
    'Studio CLI did not report success; look at Studio',
  );
  assert(envelope.result?.data, 'Studio CLI returned no result.data');
  return envelope.result.data;
}

export function validateConfig(env) {
  for (const key of [
    'NB_STUDIO_SERVER',
    'NB_STUDIO_API_KEY',
    'STUDIO_APP_URL',
    'STUDIO_CLI',
  ])
    assert(env[key]?.trim(), `Missing ${key}`);
  assert.equal(
    env.STUDIO_TARGET,
    'linux-x64',
    'The studio environment must set STUDIO_TARGET=linux-x64',
  );
  assert.equal(
    env.STUDIO_NODE_MAJOR,
    '24',
    'The studio environment must set STUDIO_NODE_MAJOR=24',
  );
  for (const key of ['NB_STUDIO_SERVER', 'STUDIO_APP_URL']) {
    const url = new URL(env[key]);
    assert(
      url.protocol === 'https:' &&
        !url.username &&
        !url.password &&
        !url.search &&
        !url.hash,
      `Invalid HTTPS base URL: ${key}`,
    );
  }
}

// Only a release is deployed: the run is for the tag v<version> of the
// version package.json holds at that commit.
export function validateRelease(env, version) {
  assert(
    typeof version === 'string' && /^\d+\.\d+\.\d+(?:-[\w.]+)?$/u.test(version),
    'package.json has no release version',
  );
  assert.equal(
    env.GITHUB_REF,
    `refs/tags/v${version}`,
    `Deploy only from the release tag v${version}`,
  );
}

export function validateHealth(health) {
  assert.equal(health.ok, true, 'Health endpoint did not report ok=true');
  assert.equal(
    health.app?.name,
    APP_ID,
    'Health endpoint belongs to another app',
  );
}

// Only ids go into the log, never Studio's messages, logs, URLs or whole
// answers, which can hold credentials and upload tickets.
function diagnosticId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/u.test(value)
    ? value
    : '[unavailable]';
}

export function deploymentState(data, releaseId, deploymentId) {
  assert.equal(data.appId, APP_ID, 'Wrong deployment app');
  assert.equal(data.releaseId, releaseId, 'Wrong deployment release');
  if (data.status === 'succeeded') return 'succeeded';
  if (['queued', 'deploying'].includes(data.status)) return 'waiting';
  // An unknown status is not echoed.
  const status = data.status === 'failed' ? 'failed' : 'unknown';
  throw new Error(
    `Deployment stopped (${status}); release=${diagnosticId(releaseId)}; deployment=${diagnosticId(deploymentId)}. Look at the deployment's logs in Studio; nothing is retried or rolled back.`,
  );
}

export async function deploy({
  env,
  metadata,
  cli,
  health,
  page,
  summary,
  wait = sleep,
  now = Date.now,
  // Studio may take longer than ten minutes to run a release and pass its
  // health check (the global one did for 1.0.0-beta.62).
  timeout = 20 * 60_000,
}) {
  validateConfig(env);
  summary(
    `Studio: ${env.NB_STUDIO_SERVER}\n\nApplication: ${APP_ID}\n\nAddress: ${env.STUDIO_APP_URL}\n\nVersion: ${metadata.version}\n\nCommit: ${metadata.sha}\n\nSHA-256: ${metadata.sha256}\n\n`,
  );
  summary(
    'Uploading and asking for a deployment; until Studio answers, whether it received the upload is unknown.\n\n',
  );
  const uploaded = await cli([
    'deploy',
    '--app',
    APP_ID,
    '--repository',
    metadata.repository,
    '--sha',
    metadata.sha,
    '--file',
    ARCHIVE,
    '--json',
  ]);
  // An upload answers with the release and, nested, what became of it.
  assert.equal(uploaded.superseded, false, 'Uploaded build was superseded');
  assert.equal(uploaded.release?.appId, APP_ID, 'Wrong uploaded release app');
  assert.equal(
    uploaded.release?.sourceCommit,
    metadata.sha,
    'Uploaded commit mismatch',
  );
  assert.equal(
    uploaded.release?.checksum,
    metadata.sha256,
    'Uploaded checksum mismatch',
  );
  const result = uploaded.deployed;
  assert(result, 'Upload returned no deployment outcome');
  assert.equal(
    result.releaseId,
    uploaded.release.id,
    'Uploaded/outcome release mismatch',
  );
  assert.equal(result.appId, APP_ID, 'Wrong outcome app');
  const releaseId = result.releaseId;
  assert(
    typeof releaseId === 'string' && releaseId,
    'Deployment response missing release ID',
  );
  summary(`Release: ${diagnosticId(releaseId)}\n\n`);
  if (result.request) {
    assert.equal(
      result.request.status,
      'pending',
      'Unexpected approval request state',
    );
    assert(!result.deployment, 'Ambiguous deployment and approval response');
    let link =
      'Studio gave no approval link; see its list of deployment requests';
    if (result.request.url) {
      const url = new URL(result.request.url, env.NB_STUDIO_SERVER);
      assert.equal(
        url.origin,
        new URL(env.NB_STUDIO_SERVER).origin,
        'Unexpected approval URL origin',
      );
      link = url.href;
    }
    summary(
      `Waiting for an approval in Studio; not deployed yet. Request: ${diagnosticId(result.request.id)}\n\nApproval: ${link}\n\n`,
    );
    return 'pending';
  }
  const deploymentId = result.deployment?.id;
  assert(
    typeof deploymentId === 'string' && deploymentId,
    'Deployment response missing deployment ID',
  );
  summary(`Deployment: ${diagnosticId(deploymentId)}\n\n`);
  const deadline = now() + timeout;
  while (now() < deadline) {
    const data = await cli(['deploy', 'get', APP_ID, deploymentId, '--json']);
    if (deploymentState(data, releaseId, deploymentId) === 'succeeded') {
      assert.equal(
        data.release?.checksum,
        metadata.sha256,
        'Deployed bytes differ from the archive built',
      );
      // A healthy application could still be running an older release.
      const release = await cli([
        'release',
        'get',
        APP_ID,
        releaseId,
        '--json',
      ]);
      assert.equal(
        release.sourceCommit,
        metadata.sha,
        'Deployed commit mismatch',
      );
      assert.equal(
        release.checksum,
        metadata.sha256,
        'Release checksum mismatch',
      );
      const app = await cli(['app', 'get', APP_ID, '--json']);
      assert.equal(
        app.app?.currentDeploymentId,
        deploymentId,
        'The application no longer runs this deployment',
      );
      // The application may start a while after Studio reports the
      // deployment (cn, 1.0.0-beta.26: about 90 seconds, and the single
      // check failed a healthy deploy), so the checks are asked again until
      // they pass or the deadline comes.
      const address = env.STUDIO_APP_URL.replace(/\/$/u, '');
      for (;;) {
        try {
          await health(`${address}/api/healthz`);
          // What the application's address serves is this build's page: a
          // deployment Studio reports while the address answers from
          // elsewhere (another Studio, another host process) is not a
          // deployment.
          const served = await page(`${address}/`);
          assert(
            served.includes(metadata.clientScript),
            `The address does not serve this build's page (${metadata.clientScript})`,
          );
          break;
        } catch (error) {
          if (now() >= deadline) throw error;
          await wait(10_000);
        }
      }
      summary(
        "Deployed: Studio runs this commit and archive, the health check passed, and the address serves this build's page.\n\n",
      );
      return 'succeeded';
    }
    await wait(10_000);
  }
  throw new Error(
    `Deployment timed out after ${timeout / 60_000} minutes; look at Studio before running the workflow again (nothing is rolled back)`,
  );
}

// The script a build's page loads first (`assets/index-<hash>.js`), named
// anew by every build.
export function clientScriptOf(html) {
  const script = /assets\/index-[\w-]+\.js/u.exec(html)?.[0];
  assert(script, "The archive's page names no entry script");
  return script;
}

export function deploymentOutcomeMessage(outcome) {
  assert(
    ['pending', 'succeeded'].includes(outcome),
    'Unknown deployment outcome',
  );
  return outcome === 'pending'
    ? 'Studio holds the deployment for an approval; it is not deployed yet.'
    : 'Studio deployed the release; its commit, archive and health were checked.';
}

async function main() {
  const summary = (text) => {
    if (process.env.GITHUB_STEP_SUMMARY)
      appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
  };
  try {
    validateConfig(process.env);
    const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
    validateRelease(process.env, version);
    if (process.argv.includes('--check-config')) return;
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
    assert.equal(
      sha,
      process.env.GITHUB_SHA,
      'Checkout does not match the tag',
    );
    assert(process.env.GITHUB_REPOSITORY, 'Missing GITHUB_REPOSITORY');
    const size = statSync(ARCHIVE).size;
    assert(
      size > 0 && size <= 256 * 1024 * 1024,
      'Archive must be nonempty and at most 256 MiB',
    );
    const outcome = await deploy({
      env: process.env,
      metadata: {
        repository: process.env.GITHUB_REPOSITORY,
        version,
        sha,
        clientScript: clientScriptOf(
          execFileSync('tar', ['-xzOf', ARCHIVE, 'dist/client/index.html'], {
            encoding: 'utf8',
          }),
        ),
        sha256: createHash('sha256')
          .update(readFileSync(ARCHIVE))
          .digest('hex'),
      },
      summary,
      cli: async (args) => runStudioCli(process.env, args),
      health: async (url) => {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
          redirect: 'error',
        });
        assert(response.ok, `Health check HTTP ${response.status}`);
        validateHealth(await response.json());
      },
      page: async (url) => {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(30_000),
          headers: { 'cache-control': 'no-cache' },
        });
        assert(response.ok, `Page HTTP ${response.status}`);
        return response.text();
      },
    });
    console.info(deploymentOutcomeMessage(outcome));
  } catch (error) {
    summary(
      `Not deployed: ${error.message}\n\nNothing is rolled back; look for this release in Studio before uploading again.\n`,
    );
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main();

// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import {
  APP_ID,
  clientScriptOf,
  deploy,
  deploymentOutcomeMessage,
  parseEnvelope,
  runStudioCli,
  validateConfig,
  validateHealth,
  validateRelease,
} from '../../scripts/ci/deploy-studio.mjs';

// The release deployment to Studio (scripts/ci/deploy-studio.mjs, run by
// .github/workflows/deploy-studio.yml on a release tag), with the Studio CLI
// faked: what it checks before uploading, how it reads Studio's answers,
// and that it never lets the CLI's output, which may hold upload tickets,
// into an error.

const env = {
  NB_STUDIO_SERVER: 'https://studio.example.com/main',
  NB_STUDIO_API_KEY: 'test-key',
  STUDIO_APP_URL: 'https://studio.example.com/itam/',
  STUDIO_TARGET: 'linux-x64',
  STUDIO_NODE_MAJOR: '24',
  STUDIO_CLI: '/tmp/studio-cli/nb-studio',
};
const metadata = {
  repository: 'nocobase/NocoITAM',
  version: '1.0.0-beta.40',
  sha: 'a'.repeat(40),
  sha256: 'b'.repeat(64),
  clientScript: 'assets/index-AbC12_3.js',
};

function scenario() {
  const release = {
    id: 'release-1',
    appId: APP_ID,
    sourceCommit: metadata.sha,
    checksum: metadata.sha256,
  };
  const uploaded = {
    superseded: false,
    release,
    deployed: {
      appId: APP_ID,
      releaseId: release.id,
      deployment: { id: 'deployment-1' } as { id: string } | null,
      request: null as { id: string; status: string; url?: string } | null,
    },
  };
  const deployment = {
    id: 'deployment-1',
    appId: APP_ID,
    releaseId: release.id,
    status: 'queued',
    release: { ...release },
  };
  const app = { app: { currentDeploymentId: deployment.id } };
  const cli = vi.fn(async (args: string[]) => {
    if (args[0] === 'deploy' && args[1] === '--app') return uploaded;
    if (args[0] === 'deploy' && args[1] === 'get') {
      // Queued once, then done.
      const answer = { ...deployment };
      deployment.status = 'succeeded';
      return answer;
    }
    if (args[0] === 'release') return release;
    if (args[0] === 'app') return app;
    throw new Error('Unexpected CLI command');
  });
  let time = 0;
  return {
    uploaded,
    deployment,
    app,
    options: {
      env,
      metadata,
      cli,
      health: vi.fn(async () => {}),
      page: vi.fn(
        async () =>
          `<script type="module" src="./${metadata.clientScript}"></script>`,
      ),
      summary: vi.fn(),
      now: () => time,
      wait: vi.fn(async (ms: number) => {
        time += ms;
      }),
    },
  };
}

describe('the Studio release deployment', () => {
  it('deploys only the release tag of the version package.json holds', () => {
    expect(() =>
      validateRelease(
        { GITHUB_REF: 'refs/tags/v1.0.0-beta.40' },
        '1.0.0-beta.40',
      ),
    ).not.toThrow();
    expect(() =>
      validateRelease({ GITHUB_REF: 'refs/heads/main' }, '1.0.0-beta.40'),
    ).toThrow('Deploy only from the release tag v1.0.0-beta.40');
    expect(() =>
      validateRelease(
        { GITHUB_REF: 'refs/tags/v1.0.0-beta.39' },
        '1.0.0-beta.40',
      ),
    ).toThrow('release tag');
    expect(() =>
      validateRelease({ GITHUB_REF: 'refs/tags/vnext' }, 'next'),
    ).toThrow('no release version');
  });

  it('refuses a configuration missing a setting or naming another platform', () => {
    expect(() => validateConfig(env)).not.toThrow();
    expect(() => validateConfig({ ...env, NB_STUDIO_API_KEY: ' ' })).toThrow(
      'Missing NB_STUDIO_API_KEY',
    );
    expect(() =>
      validateConfig({ ...env, STUDIO_TARGET: 'linux-arm64' }),
    ).toThrow('STUDIO_TARGET');
    expect(() =>
      validateConfig({
        ...env,
        STUDIO_APP_URL: 'http://studio.example.com/itam',
      }),
    ).toThrow('Invalid HTTPS base URL: STUDIO_APP_URL');
  });

  // An application starts a while after Studio reports it deployed (cn,
  // 1.0.0-beta.26): the checks are asked again until the deadline.
  it('asks the health check again while the application starts', async () => {
    const { options } = scenario();
    let calls = 0;
    options.health = vi.fn(async () => {
      calls += 1;
      if (calls < 3) throw new Error('Health check HTTP 404');
    });
    expect(await deploy(options)).toBe('succeeded');
    expect(options.health).toHaveBeenCalledTimes(3);
    const down = scenario();
    down.options.health = vi.fn(async () => {
      throw new Error('Health check HTTP 404');
    });
    await expect(deploy({ ...down.options, timeout: 60_000 })).rejects.toThrow(
      'Health check HTTP 404',
    );
  });

  it('uploads the archive, waits for the deployment and checks the application runs it', async () => {
    const { options } = scenario();
    expect(await deploy(options)).toBe('succeeded');
    expect(options.cli).toHaveBeenNthCalledWith(1, [
      'deploy',
      '--app',
      'itam',
      '--repository',
      metadata.repository,
      '--sha',
      metadata.sha,
      '--file',
      'storage/exports/dist.tar.gz',
      '--json',
    ]);
    expect(options.wait).toHaveBeenCalledTimes(1);
    expect(options.health).toHaveBeenCalledWith(
      'https://studio.example.com/itam/api/healthz',
    );
    expect(options.page).toHaveBeenCalledWith(
      'https://studio.example.com/itam/',
    );
    expect(deploymentOutcomeMessage('succeeded')).toContain('deployed');
  });

  it("fails when the address serves another build's page, though Studio reports the deployment", async () => {
    const { options } = scenario();
    options.page = vi.fn(
      async () => '<script type="module" src="./assets/index-Old99.js">',
    );
    await expect(deploy(options)).rejects.toThrow(
      "The address does not serve this build's page",
    );
  });

  it("reads the build's entry script from its page", () => {
    expect(
      clientScriptOf(
        '<link rel="modulepreload" href="./assets/vendor-x.js"><script type="module" crossorigin src="./assets/index-rzm-Bx3D.js"></script>',
      ),
    ).toBe('assets/index-rzm-Bx3D.js');
    expect(() => clientScriptOf('<html></html>')).toThrow();
  });

  it('stops at an approval Studio asks for, without claiming a deployment', async () => {
    const { options, uploaded } = scenario();
    uploaded.deployed.deployment = null;
    uploaded.deployed.request = {
      id: 'request-1',
      status: 'pending',
      url: '/admin/requests/request-1',
    };
    expect(await deploy(options)).toBe('pending');
    expect(options.summary).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://studio.example.com/admin/requests/request-1',
      ),
    );
    expect(options.health).not.toHaveBeenCalled();
    // An approval link to another site is refused.
    const other = scenario();
    other.uploaded.deployed.deployment = null;
    other.uploaded.deployed.request = {
      id: 'request-2',
      status: 'pending',
      url: 'https://evil.example.com/approve',
    };
    await expect(deploy(other.options)).rejects.toThrow(
      'Unexpected approval URL origin',
    );
  });

  it('fails when the deployment fails, or the application runs something else', async () => {
    const failed = scenario();
    failed.options.cli.mockImplementation(async (args: string[]) =>
      args[1] === '--app'
        ? failed.uploaded
        : { ...failed.deployment, status: 'failed' },
    );
    await expect(deploy(failed.options)).rejects.toThrow(
      'Deployment stopped (failed)',
    );
    const replaced = scenario();
    replaced.app.app.currentDeploymentId = 'deployment-2';
    await expect(deploy(replaced.options)).rejects.toThrow(
      'no longer runs this deployment',
    );
    const otherCommit = scenario();
    otherCommit.uploaded.release.sourceCommit = 'c'.repeat(40);
    await expect(deploy(otherCommit.options)).rejects.toThrow(
      'Uploaded commit mismatch',
    );
  });

  it('checks the health check is the application answering', () => {
    expect(() =>
      validateHealth({ ok: true, app: { name: 'itam', basePath: '/itam' } }),
    ).not.toThrow();
    expect(() => validateHealth({ ok: true, app: { name: 'main' } })).toThrow(
      'another app',
    );
  });

  it('keeps the CLI output out of its errors', () => {
    expect(() => parseEnvelope('ticket=secret')).toThrow(
      'Studio CLI returned invalid JSON',
    );
    const failing = () => {
      throw Object.assign(new Error('ticket=secret'), {
        status: 2,
        stdout: JSON.stringify({ error: { code: 'UPLOAD_FAILED' } }),
      });
    };
    let message = '';
    try {
      runStudioCli(
        env,
        ['deploy', '--app', 'itam', '--file', 'x'],
        failing as never,
      );
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toContain('UPLOAD_FAILED; exit=2');
    expect(message).toContain('Whether Studio received the upload is unknown');
    expect(message).not.toContain('secret');
  });

  it('runs on release tags, from main, checks and builds once, and deploys to each Studio in its own environment', () => {
    const workflow = readFileSync(
      '.github/workflows/deploy-studio.yml',
      'utf8',
    );
    expect(workflow).toContain("tags: ['v*']");
    expect(workflow).not.toContain('branches:');
    expect(workflow).toContain('git merge-base --is-ancestor HEAD origin/main');
    for (const check of [
      'pnpm lint',
      'pnpm format:check',
      'pnpm typecheck',
      'pnpm test',
    ])
      expect(workflow).toContain(check);
    expect(workflow).toContain('studio: [internal, cn, global]');
    expect(workflow).toContain('environment: studio-${{ matrix.studio }}');
    expect(workflow).toContain('fail-fast: false');
  });
});

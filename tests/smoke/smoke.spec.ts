import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { _electron as electron, expect, test } from '@playwright/test';

/*
 * Smoke tests of the packaged app, run by scripts/smoke-test.ps1 after `npm run package`:
 *   KTMS_SMOKE_EXE   the KeepToMyShelf.exe to test (installed, or unzipped from the portable zip)
 *   KTMS_SMOKE_KIND  "installed" or "portable"
 *   KTMS_SMOKE_DATA  an empty temporary folder, given to the app as KTMS_USER_DATA_DIR. The
 *                    installed app keeps its data there; the portable one must ignore it.
 */
const exe = process.env['KTMS_SMOKE_EXE'] ?? '';
const kind = process.env['KTMS_SMOKE_KIND'];
const testDataDir = process.env['KTMS_SMOKE_DATA'] ?? '';
const portableDataDir = join(dirname(exe), 'KeepToMyShelf Data');
const expectedDataDir = kind === 'portable' ? portableDataDir : testDataDir;
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string };

const appEnv = (extra: Record<string, string> = {}): Record<string, string> => {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // VS Code sets it; the packaged app ignores it anyway (runAsNode fuse), as a test checks.
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  return { ...env, KTMS_USER_DATA_DIR: testDataDir, ...extra };
};

test.beforeAll(() => {
  if (!existsSync(exe) || (kind !== 'installed' && kind !== 'portable') || !testDataDir) {
    throw new Error('Run the smoke tests with scripts/smoke-test.ps1 (npm run test:smoke).');
  }
});

test('opens, creates a profile and keeps the data where it should', async () => {
  const app = await electron.launch({ executablePath: exe, args: ['--lang=en-US'], env: appEnv() });
  try {
    const info = await app.evaluate(({ app: electronApp }) => ({
      packaged: electronApp.isPackaged,
      version: electronApp.getVersion(),
      userData: electronApp.getPath('userData'),
    }));
    expect(info).toEqual({ packaged: true, version, userData: expectedDataDir });

    const page = await app.firstWindow();
    await expect(
      page.getByRole('heading', { name: 'Create your first profile to get started' }),
    ).toBeVisible();
    await page.getByLabel('Name').fill('Smoke');
    await page.getByRole('button', { name: 'Create profile' }).click();
    await page.getByRole('button', { name: "Open Smoke's profile" }).click();
    await expect(
      page.getByRole('heading', { name: 'What would you like to browse?' }),
    ).toBeVisible();
    // Web permissions are refused (ADR 0011).
    expect(await page.evaluate('Notification.requestPermission()')).toBe('denied');
  } finally {
    await app.close();
  }

  expect(existsSync(join(expectedDataDir, 'app.db'))).toBe(true);
  expect(readdirSync(join(expectedDataDir, 'profiles'))).toHaveLength(1);
  if (kind === 'portable') expect(readdirSync(testDataDir)).toEqual([]);
});

test('cannot be used as Node.js (runAsNode fuse)', async () => {
  // Without the fuse, the .exe would run this code as Node.js, print the marker and exit.
  const child = spawn(exe, ['-e', "process.stdout.write('RAN AS NODE')"], {
    env: appEnv({ ELECTRON_RUN_AS_NODE: '1' }),
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString()));
  try {
    await new Promise((resolve) => setTimeout(resolve, 8_000));
  } finally {
    // The app opened instead: close it and its child processes.
    if (child.pid !== undefined && child.exitCode === null) {
      spawn('taskkill', ['/pid', String(child.pid), '/t', '/f']);
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }
  expect(output).not.toContain('RAN AS NODE');
});

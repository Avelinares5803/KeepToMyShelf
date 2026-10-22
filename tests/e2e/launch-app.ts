import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';

/** Launches the built app with its data in `userDataDir`, isolated from real user data. */
export async function launchApp(
  userDataDir: string,
): Promise<{ app: ElectronApplication; page: Page }> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    // ELECTRON_RUN_AS_NODE (set by some tools such as VS Code) would start Electron as plain Node.
    if (value !== undefined && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value;
  }
  env['KTMS_USER_DATA_DIR'] = userDataDir;

  // Always start with an English system locale so results do not depend on the machine
  // (GitHub runners are in English); tests switch the UI language explicitly when needed.
  const app = await electron.launch({ args: ['.', '--lang=en-US'], env });
  const page = await app.firstWindow();
  return { app, page };
}

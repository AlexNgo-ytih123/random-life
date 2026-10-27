import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startServer } from './serve.mjs';
import { isDirectRun } from './lib/paths.mjs';

function openDefaultBrowser(url) {
  return new Promise((resolve, reject) => {
    const child = spawn('rundll32.exe', ['url.dll,FileProtocolHandler', url], {
      windowsHide: true,
      stdio: 'ignore',
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`Default browser launcher exited with code ${code}`));
    });
  });
}

export async function launchGame({ openBrowser = openDefaultBrowser, log = console.log } = {}) {
  const root = path.resolve(fileURLToPath(new URL('../', import.meta.url)));
  // Let the OS choose a free port: a previous dev server must not prevent launch.
  const server = await startServer({ root, host: '127.0.0.1', port: 0 });
  const url = `http://127.0.0.1:${server.port}/`;
  log(`Random Life: ${url}`);
  log('Keep this window open while playing. Close it or press Ctrl+C to stop.');
  try {
    await openBrowser(url);
  } catch (error) {
    log(`Could not open the default browser: ${error.message}`);
    log(`Open this address in your browser: ${url}`);
  }
  return { ...server, url };
}

if (isDirectRun(import.meta.url)) {
  try {
    await launchGame();
  } catch (error) {
    console.error(`Unable to start Random Life: ${error.message}`);
    process.exitCode = 1;
  }
}

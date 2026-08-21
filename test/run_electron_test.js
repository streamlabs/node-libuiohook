const { spawn } = require('child_process');
const path = require('path');

if (process.argv.length < 4) {
  console.error('Usage: node run_electron_test.js <electron.exe> <test.js> [args...]');
  process.exit(2);
}

const electronPath = path.resolve(process.argv[2]);
const testArguments = process.argv.slice(3);
let output = '';
let spawnError;
let timedOut = false;
let forceExitTimeout;

const child = spawn(electronPath, testArguments, {
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
});

child.stdout.on('data', data => {
  output += data.toString();
  process.stdout.write(data);
});
child.stderr.on('data', data => process.stderr.write(data));
child.once('error', error => {
  spawnError = error;
});

const timeout = setTimeout(() => {
  timedOut = true;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
      stdio: 'ignore',
      windowsHide: true,
    });
    killer.once('error', () => child.kill());
  } else {
    child.kill('SIGKILL');
  }

  forceExitTimeout = setTimeout(() => {
    console.error(JSON.stringify({ status: 'FAIL', error: 'Electron process tree did not exit' }));
    process.exit(1);
  }, 5000);
}, 45000);

child.once('close', (code, signal) => {
  clearTimeout(timeout);
  clearTimeout(forceExitTimeout);

  const passRecords = output
    .split(/\r?\n/)
    .map(line => line.trim())
    .map(line => {
      try {
        return JSON.parse(line);
      } catch (_error) {
        return undefined;
      }
    })
    .filter(record => record?.status === 'PASS');

  const expectedElectron = process.env.EXPECTED_ELECTRON_VERSION;
  const versionMatches =
    !expectedElectron ||
    (passRecords.length === 1 && passRecords[0].electron === expectedElectron);

  if (spawnError || timedOut || code !== 0 || passRecords.length !== 1 || !versionMatches) {
    console.error(
      JSON.stringify({
        status: 'FAIL',
        error: spawnError ? spawnError.stack : undefined,
        timedOut,
        exitCode: code,
        signal,
        passRecords: passRecords.length,
        expectedElectron,
        actualElectron: passRecords.length === 1 ? passRecords[0].electron : undefined,
      }),
    );
    process.exitCode = 1;
  }
});

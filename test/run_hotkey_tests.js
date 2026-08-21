const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'win32') {
  console.error('The native hotkey regression tests currently require Windows.');
  process.exit(2);
}

const projectRoot = path.resolve(__dirname, '..');
const configuration = process.env.NODE_LIBUIOHOOK_BUILD_CONFIGURATION || 'RelWithDebInfo';
const buildDirectory = process.env.NODE_LIBUIOHOOK_BUILD_DIR
  ? path.resolve(process.env.NODE_LIBUIOHOOK_BUILD_DIR)
  : path.join(projectRoot, 'build', configuration);

function findElectron() {
  if (process.env.ELECTRON_PATH) return path.resolve(process.env.ELECTRON_PATH);

  try {
    return require('electron');
  } catch (error) {
    throw new Error(
      `Unable to find Electron. Run the package install first or set ELECTRON_PATH.\n${error.message}`,
    );
  }
}

function requireFile(filePath, description) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `Missing ${description}: ${filePath}\n` +
        'Configure with NODE_LIBUIOHOOK_BUILD_TESTS=ON and build the project first.',
    );
  }
}

function readElectronVersion(electronPath) {
  if (process.env.EXPECTED_ELECTRON_VERSION) return process.env.EXPECTED_ELECTRON_VERSION;

  const versionFile = path.join(path.dirname(electronPath), 'version');
  return fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8').trim() : undefined;
}

let electronPath;
try {
  electronPath = findElectron();
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const addonPath = path.join(buildDirectory, 'node_libuiohook.node');
const inputHelperPath = path.join(buildDirectory, 'node_libuiohook_send_input.exe');
const harnessPath = path.join(__dirname, 'run_electron_test.js');
const tests = [
  'test_hotkey_win.js',
  'test_hotkey_teardown_win.js',
  'test_hotkey_worker_win.js',
];

try {
  requireFile(electronPath, 'Electron executable');
  requireFile(addonPath, 'native addon');
  requireFile(inputHelperPath, 'SendInput helper');
} catch (error) {
  console.error(error.message);
  process.exit(2);
}

const expectedElectronVersion = readElectronVersion(electronPath);

for (const test of tests) {
  console.log(`\nRunning ${test}...`);
  const result = spawnSync(
    process.execPath,
    [harnessPath, electronPath, path.join(__dirname, test), addonPath, inputHelperPath],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        ...(expectedElectronVersion
          ? { EXPECTED_ELECTRON_VERSION: expectedElectronVersion }
          : {}),
      },
      stdio: 'inherit',
      windowsHide: true,
    },
  );

  if (result.error) {
    console.error(result.error.stack || result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`\nAll ${tests.length} native hotkey regression tests passed.`);

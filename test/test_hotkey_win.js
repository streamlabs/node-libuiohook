const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

const addonPath = path.resolve(process.argv[2]);
const inputHelperPath = path.resolve(process.argv[3]);
const callbacks = [];
const pendingCommands = new Map();
let commandId = 0;
let rendererVersions;
let window;
let finished = false;
let rendererExitRequested = false;

const timeout = setTimeout(() => fail(new Error('Hotkey test timed out')), 30000);
app.disableHardwareAcceleration();

app.on('window-all-closed', () => {
  // Keep the main process alive until the renderer process has actually exited.
});

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

function waitForProcessExit(pid, milliseconds = 5000) {
  const deadline = Date.now() + milliseconds;
  return new Promise((resolve, reject) => {
    const poll = () => {
      try {
        process.kill(pid, 0);
      } catch (error) {
        if (error.code === 'ESRCH') {
          resolve();
          return;
        }
        if (error.code !== 'EPERM') {
          reject(error);
          return;
        }
      }

      if (Date.now() >= deadline) {
        reject(new Error(`Renderer process ${pid} did not exit`));
        return;
      }
      setTimeout(poll, 25);
    };
    poll();
  });
}

function fail(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  console.error(
    JSON.stringify({ status: 'FAIL', error: error instanceof Error ? error.stack : String(error) }),
  );
  app.exit(1);
}

function sendCommand(action, generation) {
  return new Promise((resolve, reject) => {
    const id = ++commandId;
    pendingCommands.set(id, { resolve, reject });
    window.webContents.send('hotkey-command', { id, action, generation });
  });
}

function runInput(repetitions) {
  return new Promise((resolve, reject) => {
    const child = spawn(inputHelperPath, [String(repetitions), '100'], {
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`Input helper exited with code ${code}`));
    });
  });
}

function waitForCallbacks(expectedCount) {
  return new Promise((resolve, reject) => {
    const callbackTimeout = setTimeout(
      () => reject(new Error(`Expected ${expectedCount} callbacks, received ${callbacks.length}`)),
      10000,
    );
    const check = () => {
      if (callbacks.length < expectedCount) return;
      clearTimeout(callbackTimeout);
      ipcMain.removeListener('hotkey-callback', check);
      resolve();
    };
    ipcMain.on('hotkey-callback', check);
    check();
  });
}

function assertCallbackSequence(events, generation, repetitions) {
  if (events.length !== repetitions * 2) {
    throw new Error(`Expected ${repetitions * 2} events, received ${events.length}`);
  }

  events.forEach((event, index) => {
    const expectedType = index % 2 === 0 ? 'registerKeydown' : 'registerKeyup';
    if (event.eventType !== expectedType || event.generation !== generation) {
      throw new Error(`Unexpected callback at index ${index}: ${JSON.stringify(event)}`);
    }
  });
}

async function runTest() {
  // A prior interrupted test can leave synthetic F24 state behind. Release it
  // before the polling thread starts so normalization cannot become an event.
  await runInput(0);
  await sendCommand('start-and-register', 1);
  const firstStart = callbacks.length;
  await Promise.all([runInput(25), waitForCallbacks(firstStart + 50)]);
  assertCallbackSequence(callbacks.slice(firstStart), 1, 25);

  await sendCommand('unregister-all');
  const unregisteredCount = callbacks.length;
  await runInput(3);
  await delay(1000);
  if (callbacks.length !== unregisteredCount) {
    throw new Error('A callback ran after unregisterAllCallbacks');
  }

  if (!(await sendCommand('stop'))) throw new Error('Failed to stop hook');
  await sendCommand('start-and-register', 2);
  const secondStart = callbacks.length;
  await Promise.all([runInput(5), waitForCallbacks(secondStart + 10)]);
  assertCallbackSequence(callbacks.slice(secondStart), 2, 5);
  await sendCommand('cleanup');

  const webContents = window.webContents;
  const rendererPid = webContents.getOSProcessId();
  const webContentsDestroyed = new Promise(resolve => webContents.once('destroyed', resolve));
  rendererExitRequested = true;
  window.destroy();
  await webContentsDestroyed;
  await waitForProcessExit(rendererPid);
  // Electron does not emit render-process-gone for every intentional window
  // destruction. Give any queued crash notification a chance to fail the test
  // before declaring successful environment teardown.
  await delay(1000);
  if (finished) return;

  finished = true;
  clearTimeout(timeout);
  console.log(
    JSON.stringify({
      status: 'PASS',
      callbacks: callbacks.length,
      electron: rendererVersions.electron,
      node: rendererVersions.node,
      napi: rendererVersions.napi,
    }),
  );
  app.exit(0);
}

ipcMain.on('hotkey-callback', (_event, callback) => callbacks.push(callback));
ipcMain.on('hotkey-command-result', (_event, response) => {
  const pending = pendingCommands.get(response.id);
  if (!pending) return;
  pendingCommands.delete(response.id);
  if (response.error) pending.reject(new Error(response.error));
  else pending.resolve(response.result);
});

ipcMain.once('hotkey-ready', (_event, versions) => {
  rendererVersions = versions;
  runTest().catch(fail);
});

app.whenReady().then(() => {
  window = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload_hotkey_win.js'),
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
      additionalArguments: [`--hotkey-addon=${addonPath}`],
    },
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    if (!rendererExitRequested) {
      fail(new Error(`Renderer exited before cleanup: ${details.reason}`));
      return;
    }
    if (details.reason !== 'clean-exit' && details.reason !== 'killed') {
      fail(new Error(`Renderer exited: ${details.reason}`));
      return;
    }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
});

const { app, BrowserWindow, ipcMain } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

const addonPath = path.resolve(process.argv[2]);
const inputHelperPath = path.resolve(process.argv[3]);
let inputProcess;
let rendererVersions;
let window;
let finished = false;
let inputExited = false;
let rendererExited = false;
let rendererExitRequested = false;
let rendererPid;

const timeout = setTimeout(() => fail(new Error('Hotkey teardown test timed out')), 20000);
app.disableHardwareAcceleration();

app.on('window-all-closed', () => {
  // Keep the main process alive until the input helper and cleanup assertions finish.
});

function fail(error) {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  if (inputProcess && !inputProcess.killed) inputProcess.kill();
  console.error(
    JSON.stringify({ status: 'FAIL', error: error instanceof Error ? error.stack : String(error) }),
  );
  app.exit(1);
}

function pass() {
  if (finished) return;
  finished = true;
  clearTimeout(timeout);
  console.log(
    JSON.stringify({
      status: 'PASS',
      electron: rendererVersions.electron,
      node: rendererVersions.node,
      napi: rendererVersions.napi,
    }),
  );
  app.exit(0);
}

function maybePass() {
  if (inputExited && rendererExited) pass();
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

function runInput(repetitions) {
  return new Promise((resolve, reject) => {
    inputProcess = spawn(inputHelperPath, [String(repetitions), '75'], {
      stdio: 'inherit',
      windowsHide: true,
    });
    inputProcess.once('error', reject);
    inputProcess.once('exit', code => {
      if (code === 0) resolve();
      else reject(new Error(`Input helper exited with code ${code}`));
    });
  });
}

ipcMain.once('hotkey-ready', (_event, versions) => {
  rendererVersions = versions;
  runInput(0)
    .then(() => {
      window.webContents.send('hotkey-command', {
        id: 1,
        action: 'start-and-register',
        generation: 1,
      });
    })
    .catch(fail);
});

ipcMain.once('hotkey-command-result', (_event, response) => {
  if (response.error) {
    fail(new Error(response.error));
    return;
  }

  runInput(25)
    .then(() => {
      inputExited = true;
      maybePass();
    })
    .catch(fail);
});

ipcMain.once('hotkey-callback', () => {
  // Do not unregister or stop. Destroying the renderer must invoke the addon's
  // environment cleanup before Node tears down its thread-safe dispatcher.
  const webContents = window.webContents;
  rendererPid = webContents.getOSProcessId();
  rendererExitRequested = true;
  webContents.once('destroyed', () => {
    waitForProcessExit(rendererPid)
      .then(() => {
        // A crash notification can be queued just behind process termination.
        // Let it run before the successful teardown gate is opened.
        setTimeout(() => {
          rendererExited = true;
          maybePass();
        }, 1000);
      })
      .catch(fail);
  });
  window.destroy();
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
      fail(new Error(`Renderer exited before teardown: ${details.reason}`));
      return;
    }
    if (details.reason !== 'clean-exit' && details.reason !== 'killed') {
      fail(new Error(`Renderer exited: ${details.reason}`));
      return;
    }
  });
  window.loadFile(path.join(__dirname, 'index.html'));
});

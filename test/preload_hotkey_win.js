const { ipcRenderer } = require('electron');
const { spawnSync } = require('child_process');

const addonArgument = process.argv.find(argument => argument.startsWith('--hotkey-addon='));
if (!addonArgument) throw new Error('Missing --hotkey-addon argument');
const inputHelperArgument = process.argv.find(argument =>
  argument.startsWith('--hotkey-input-helper='),
);

const libuiohook = require(addonArgument.slice('--hotkey-addon='.length));
const inputHelperPath = inputHelperArgument?.slice('--hotkey-input-helper='.length);
let hookStarted = false;

function binding(eventType, generation) {
  return {
    callback: () => ipcRenderer.send('hotkey-callback', { eventType, generation }),
    key: 'F24',
    eventType,
    modifiers: { alt: false, ctrl: false, shift: false, meta: false },
  };
}

ipcRenderer.on('hotkey-command', (_event, command) => {
  try {
    let result;
    if (command.action === 'start-and-register') {
      if (hookStarted) throw new Error('Hook is already started');
      if (!libuiohook.startHook()) throw new Error('Failed to start hook');
      hookStarted = true;
      if (!libuiohook.registerCallback(binding('registerKeydown', command.generation))) {
        throw new Error('Failed to register keydown callback');
      }
      if (!libuiohook.registerCallback(binding('registerKeyup', command.generation))) {
        throw new Error('Failed to register keyup callback');
      }
      result = true;
    } else if (command.action === 'unregister-all') {
      libuiohook.unregisterAllCallbacks();
      result = true;
    } else if (command.action === 'stop') {
      result = libuiohook.stopHook();
      hookStarted = false;
    } else if (command.action === 'queue-before-stop-and-restart') {
      if (!hookStarted) throw new Error('Hook is not started');
      if (!inputHelperPath) throw new Error('Missing --hotkey-input-helper argument');

      // spawnSync keeps this renderer's JS thread blocked while the native
      // polling thread queues both edges. Stop and restart before yielding so
      // the test can verify that queued work does not cross the run boundary.
      const input = spawnSync(inputHelperPath, ['1', '100'], {
        stdio: 'inherit',
        windowsHide: true,
      });
      if (input.error) throw input.error;
      if (input.status !== 0) {
        throw new Error(`Input helper exited with code ${input.status}`);
      }
      if (!libuiohook.stopHook()) throw new Error('Failed to stop hook');
      hookStarted = false;
      if (!libuiohook.startHook()) throw new Error('Failed to restart hook');
      hookStarted = true;
      result = true;
    } else if (command.action === 'cleanup') {
      libuiohook.unregisterAllCallbacks();
      result = hookStarted ? libuiohook.stopHook() : true;
      hookStarted = false;
    } else {
      throw new Error(`Unknown action: ${command.action}`);
    }

    ipcRenderer.send('hotkey-command-result', { id: command.id, result });
  } catch (error) {
    ipcRenderer.send('hotkey-command-result', {
      id: command.id,
      error: error instanceof Error ? error.stack : String(error),
    });
  }
});

ipcRenderer.send('hotkey-ready', {
  electron: process.versions.electron,
  node: process.versions.node,
  napi: process.versions.napi,
});

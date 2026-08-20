const { ipcRenderer } = require('electron');

const addonArgument = process.argv.find(argument => argument.startsWith('--hotkey-addon='));
if (!addonArgument) throw new Error('Missing --hotkey-addon argument');

const libuiohook = require(addonArgument.slice('--hotkey-addon='.length));
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

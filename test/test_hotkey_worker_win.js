const { isMainThread, parentPort, Worker, workerData } = require('worker_threads');

function stringifyError(error) {
  return error instanceof Error ? error.stack : String(error);
}

if (!isMainThread) {
  const libuiohook = require(workerData.addonPath);
  let hookStarted = false;

  function binding(eventType) {
    return {
      callback: () => parentPort.postMessage({ type: 'callback', eventType }),
      key: 'F24',
      eventType,
      modifiers: { alt: false, ctrl: false, shift: false, meta: false },
    };
  }

  function cleanup() {
    libuiohook.unregisterAllCallbacks();
    if (hookStarted && !libuiohook.stopHook()) throw new Error('Failed to stop hook');
    hookStarted = false;
  }

  // Keep the worker environment alive until the parent terminates it. The
  // active native polling thread must then be joined by the environment hook.
  parentPort.on('message', () => {});

  try {
    if (!libuiohook.startHook()) throw new Error('Failed to start hook');
    hookStarted = true;
    if (!libuiohook.registerCallback(binding('registerKeydown'))) {
      throw new Error('Failed to register keydown callback');
    }
    if (!libuiohook.registerCallback(binding('registerKeyup'))) {
      throw new Error('Failed to register keyup callback');
    }
    parentPort.postMessage({
      type: 'ready',
      versions: {
        electron: process.versions.electron,
        node: process.versions.node,
        napi: process.versions.napi,
      },
    });
  } catch (error) {
    try {
      cleanup();
    } catch (_cleanupError) {
      // Preserve the setup error, which is the actionable failure.
    }
    parentPort.postMessage({ type: 'error', error: stringifyError(error) });
  }
} else {
  const { app } = require('electron');
  const { spawn } = require('child_process');
  const path = require('path');

  const addonPath = path.resolve(process.argv[2]);
  const inputHelperPath = path.resolve(process.argv[3]);
  const callbacks = [];
  let inputProcess;
  let worker;
  let workerVersions;
  let finished = false;
  let terminatingWorker = false;
  let resolveReady;
  let callbackWaiter;

  const ready = new Promise(resolve => {
    resolveReady = resolve;
  });
  const timeout = setTimeout(() => fail(new Error('Worker hotkey test timed out')), 30000);
  app.disableHardwareAcceleration();

  function fail(error) {
    if (finished) return;
    finished = true;
    clearTimeout(timeout);
    if (inputProcess && !inputProcess.killed) inputProcess.kill();
    if (worker) worker.terminate();
    console.error(JSON.stringify({ status: 'FAIL', error: stringifyError(error) }));
    app.exit(1);
  }

  function runInput(repetitions) {
    return new Promise((resolve, reject) => {
      inputProcess = spawn(inputHelperPath, [String(repetitions), '100'], {
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

  function waitForCallbacks(expectedCount) {
    if (callbacks.length >= expectedCount) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const callbackTimeout = setTimeout(
        () => reject(new Error(`Expected ${expectedCount} callbacks, received ${callbacks.length}`)),
        10000,
      );
      callbackWaiter = () => {
        if (callbacks.length < expectedCount) return;
        clearTimeout(callbackTimeout);
        callbackWaiter = undefined;
        resolve();
      };
    });
  }

  function assertCallbackSequence(repetitions) {
    if (callbacks.length !== repetitions * 2) {
      throw new Error(`Expected ${repetitions * 2} events, received ${callbacks.length}`);
    }
    callbacks.forEach((eventType, index) => {
      const expectedType = index % 2 === 0 ? 'registerKeydown' : 'registerKeyup';
      if (eventType !== expectedType) {
        throw new Error(`Unexpected callback at index ${index}: ${eventType}`);
      }
    });
  }

  async function runTest() {
    // Loading in the main environment first verifies that a second Node
    // environment receives its own safe callback dispatcher.
    require(addonPath);
    // Normalize F24 before the worker starts its polling thread. This isolates
    // the test from a prior process that may have been killed mid-keypress.
    await runInput(0);
    worker = new Worker(__filename, { workerData: { addonPath } });
    worker.on('message', message => {
      if (message.type === 'ready') {
        workerVersions = message.versions;
        resolveReady();
      } else if (message.type === 'callback') {
        callbacks.push(message.eventType);
        if (callbackWaiter) callbackWaiter();
      } else if (message.type === 'error') {
        fail(new Error(message.error));
      }
    });
    worker.once('error', fail);
    worker.once('exit', code => {
      if (!terminatingWorker) fail(new Error(`Worker exited unexpectedly with code ${code}`));
    });

    await ready;
    const repetitions = 10;
    await Promise.all([runInput(repetitions), waitForCallbacks(repetitions * 2)]);
    assertCallbackSequence(repetitions);

    terminatingWorker = true;
    // Leave callbacks registered and the polling thread active. terminate()
    // must not resolve until the addon's environment cleanup has joined it.
    await worker.terminate();

    finished = true;
    clearTimeout(timeout);
    console.log(
      JSON.stringify({
        status: 'PASS',
        callbacks: callbacks.length,
        electron: workerVersions.electron,
        node: workerVersions.node,
        napi: workerVersions.napi,
      }),
    );
    app.exit(0);
  }

  app.whenReady().then(() => runTest().catch(fail));
}

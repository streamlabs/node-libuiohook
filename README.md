# node-libuiohook

## Build 
```
yarn install

mkdir build
cd build

cmake -DCMAKE_INSTALL_PREFIX="..\..\desktop\node_modules\node-libuiohook"  -G "Visual Studio 17 2022" -A x64 ../

cmake --build . --target install --config RelWithDebInfo
```

## Build for MacOS
Note: when you run `ci/build-osx.sh` script, it will request Adminstrator access since it is intended to be run in a CI environment.
```
ci/build-osx.sh
yarn install
```

## Test

There is some test to minimally confirm stability of a module. 
It will create bunch of windows, load module in each of them, register some random hotkeys. Each window will be closed after a small timeout, module will be unloaded. 

Command to use it : 
`yarn electron test\test_module.js`

Change variable `windows_to_test` in `test_module.js` to set number of cycles. **It is hard to interrupt a test, be careful when changing this number**. 
Try to click on console and press `Ctrl-C` at the same time. 

Test rely on `render-process-gone` event to detect crashes. 
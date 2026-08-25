set -e

brew install wget

if [ ! -n "${ARCHITECTURE}" ]
then
    ARCHITECTURE=$(uname -m)
fi

# Download libuiohook dependency
export DEPS="libuiohook-osx-1.2.2-b230208-${ARCHITECTURE}"
wget --quiet --retry-connrefused --waitretry=1 https://obs-studio-deployment.s3-us-west-2.amazonaws.com/libuiohook-osx-1.2.2-b230208-${ARCHITECTURE}.tar.gz

if [ ! -n "${BUILD_DIRECTORY}" ]
then
    BUILD_DIRECTORY="build"
fi

mkdir ${BUILD_DIRECTORY}
cd ${BUILD_DIRECTORY}

mkdir deps
tar -xf ../${DEPS}.tar.gz -C ./deps

if [ -n "${ELECTRON_VERSION}" ]
then
    NODEJS_VERSION_PARAM="-DNODEJS_VERSION=${ELECTRON_VERSION}"
else
    NODEJS_VERSION_PARAM=""
fi

if [ ! -n "${DISTRIBUTE_DIRECTORY}" ]
then
    DISTRIBUTE_DIRECTORY="distribute"
fi

if [ ! -n "${CMAKE_OSX_DEPLOYMENT_TARGET}" ]
then
    echo "CMAKE_OSX_DEPLOYMENT_TARGET is not set, defaulting to 11.0"
    CMAKE_OSX_DEPLOYMENT_TARGET="11.0"
fi

# Configure
cmake .. \
-DCMAKE_OSX_DEPLOYMENT_TARGET=${CMAKE_OSX_DEPLOYMENT_TARGET} \
-DUIOHOOKDIR=${PWD}/deps/${DEPS} \
-DCMAKE_BUILD_TYPE=RelWithDebInfo \
${NODEJS_VERSION_PARAM} \
-DCMAKE_OSX_ARCHITECTURES=${ARCHITECTURE} \
-DCMAKE_INSTALL_PREFIX=${DISTRIBUTE_DIRECTORY}/node-libuiohook

cd ..

# Build
cmake --build ${BUILD_DIRECTORY} --target install --config RelWithDebInfo

# Configure loading path
sudo install_name_tool -change \
@rpath/libuiohook.1.dylib \
./node_modules/node-libuiohook/libuiohook.1.dylib \
./${BUILD_DIRECTORY}/${DISTRIBUTE_DIRECTORY}/node-libuiohook/node_libuiohook.node

#Upload debug files
curl -sL https://sentry.io/get-cli/ | bash
dsymutil $PWD/${BUILD_DIRECTORY}/RelWithDebInfo/node_libuiohook.node
sentry-cli --auth-token ${SENTRY_AUTH_TOKEN} upload-dif --org streamlabs-desktop --project obs-client $PWD/${BUILD_DIRECTORY}/RelWithDebInfo/node_libuiohook.node.dSYM/Contents/Resources/DWARF/node_libuiohook.node 

rm -rf ./${BUILD_DIRECTORY}/deps

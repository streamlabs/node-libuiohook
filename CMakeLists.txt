cmake_minimum_required(VERSION 3.14)
if(APPLE)
	if (NOT CMAKE_OSX_ARCHITECTURES)
		set(CMAKE_OSX_ARCHITECTURES "${CMAKE_HOST_SYSTEM_PROCESSOR}")
	endif()
	if (NOT CMAKE_OSX_DEPLOYMENT_TARGET)
		if ("${CMAKE_OSX_ARCHITECTURES}" STREQUAL "arm64")
			set(CMAKE_OSX_DEPLOYMENT_TARGET "11.0")
		else()
			set(CMAKE_OSX_DEPLOYMENT_TARGET "10.15")
		endif()
	endif()
endif()
project(node_libuiohook)

set(CMAKE_MODULE_PATH ${CMAKE_MODULE_PATH} "${CMAKE_SOURCE_DIR}/cmake")

#############################
# CMake Settings
#############################

SET(NODEJS_URL "https://artifacts.electronjs.org/headers/dist" CACHE STRING "Node.JS URL")
SET(NODEJS_NAME "iojs" CACHE STRING "Node.JS Name")
SET(NODEJS_VERSION "v43.2.0" CACHE STRING "Node.JS Version")

include(NodeJS)
include(CPack)

nodejs_init()

if(APPLE AND NOT UIOHOOKDIR)
	message(FATAL_ERROR "UIOHOOKDIR variable is missing.  Please set this variable to specify path to the build dir of libuiohook")
endif()

message (STATUS "Path to uiohook dir " ${UIOHOOKDIR}/include/)

#############################
# Source, Libraries & Directories
#############################
SET(PROJECT_SOURCE 
	"${PROJECT_SOURCE_DIR}/source/hook.h"
	"${PROJECT_SOURCE_DIR}/source/module.cpp"
)

IF (WIN32)
	list(APPEND PROJECT_SOURCE "${PROJECT_SOURCE_DIR}/source/hook-win.cpp")
ELSEIF (APPLE)
	list(APPEND PROJECT_SOURCE "${PROJECT_SOURCE_DIR}/source/hook-osx.cpp")
ENDIF ()

SET(PROJECT_INCLUDE_PATHS
	${NODEJS_INCLUDE_DIRS}
	"${CMAKE_SOURCE_DIR}/source/"
)

if(APPLE)
	list(APPEND PROJECT_INCLUDE_PATHS "${UIOHOOKDIR}/include/")
	list(APPEND PROJECT_LIBRARIES "${UIOHOOKDIR}/lib/libuiohook.dylib")
endif()

# Include N-API wrappers
execute_process(COMMAND node -p "require('node-addon-api').include"
        WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
        OUTPUT_VARIABLE NODE_ADDON_API_DIR
        )
string(REPLACE "\n" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

list(APPEND PROJECT_INCLUDE_PATHS ${NODE_ADDON_API_DIR})


# Define NAPI_VERSION
add_definitions(-DNAPI_VERSION=4)

#############################
# Building
#############################
add_nodejs_module(
	${PROJECT_NAME}
	${PROJECT_SOURCE}
)

TARGET_LINK_LIBRARIES(
	${PROJECT_NAME}
	${PROJECT_LIBRARIES}
)

TARGET_INCLUDE_DIRECTORIES(
	${PROJECT_NAME}
	PUBLIC ${PROJECT_INCLUDE_PATHS}
)
target_compile_definitions(
	${PROJECT_NAME}
	PRIVATE BUILDING_NODE_EXTENSION
)

option(NODE_LIBUIOHOOK_BUILD_TESTS "Build the Windows hotkey test helper" OFF)
if(WIN32 AND NODE_LIBUIOHOOK_BUILD_TESTS)
	add_executable(node_libuiohook_send_input "${PROJECT_SOURCE_DIR}/test/send_input_win.cpp")
endif()

set(CompilerFlags
        CMAKE_CXX_FLAGS
        CMAKE_CXX_FLAGS_DEBUG
        CMAKE_CXX_FLAGS_RELEASE
		CMAKE_CXX_FLAGS_RELWITHDEBINFO
        CMAKE_C_FLAGS
        CMAKE_C_FLAGS_DEBUG
        CMAKE_C_FLAGS_RELEASE
		CMAKE_C_FLAGS_RELWITHDEBINFO
        )
foreach(CompilerFlag ${CompilerFlags})
  string(REPLACE "/MD" "/MT" ${CompilerFlag} "${${CompilerFlag}}")
endforeach()

if(WIN32)
	target_compile_definitions(node_libuiohook
		PRIVATE
		-D_CRT_SECURE_NO_WARNINGS
		-DUNICODE
		-D_UNICODE)
endif()

SET_TARGET_PROPERTIES(
	${PROJECT_NAME}
	PROPERTIES
	PREFIX ""
	SUFFIX ".node"
)

#############################
# Distribute
#############################
INSTALL(TARGETS ${PROJECT_NAME}
	RUNTIME DESTINATION "./" COMPONENT Runtime
	LIBRARY DESTINATION "./" COMPONENT Runtime
)

if(WIN32)
	include(FetchContent)

	# Compare current linked libs with prev
	FetchContent_Declare(deps_checker URL "https://raw.githubusercontent.com/stream-labs/obs-studio-node/staging/dependency_checker/check_dependencies.cmd" DOWNLOAD_NO_EXTRACT true)
	FetchContent_MakeAvailable(deps_checker)

	add_custom_command(TARGET ${PROJECT_NAME} POST_BUILD COMMAND ${deps_checker_SOURCE_DIR}/check_dependencies.cmd $<TARGET_FILE:${PROJECT_NAME}> ${CMAKE_CURRENT_BINARY_DIR} ${CMAKE_CURRENT_SOURCE_DIR} $<CONFIG> )
endif()

if(WIN32)
	INSTALL(FILES $<TARGET_PDB_FILE:${PROJECT_NAME}> DESTINATION ./ OPTIONAL)
endif()

if(APPLE)
INSTALL (
	DIRECTORY "${UIOHOOKDIR}/lib/"
	DESTINATION "./"
	FILES_MATCHING PATTERN "*.dylib"
)
endif()

# JavaScript
INSTALL(
	FILES "${CMAKE_SOURCE_DIR}/package.json"
	DESTINATION "./"
)
INSTALL(
	FILES "${CMAKE_SOURCE_DIR}/main.js"
	DESTINATION "./"
)

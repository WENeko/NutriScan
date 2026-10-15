cmake_minimum_required(VERSION 3.22.1)
project(nutrivlm C CXX)

if(NOT DEFINED LLAMA_CPP_TAG)
  set(LLAMA_CPP_TAG "master")
endif()

include(FetchContent)

# ---- Vulkan (GPU) ----------------------------------------------------------
# Le NDK fournit libvulkan.so et glslc, mais pas les en-têtes C++ (vulkan.hpp)
# ni SPIRV-Headers exigés par ggml-vulkan : on les récupère depuis Khronos.
FetchContent_Declare(
  vulkan_headers
  GIT_REPOSITORY https://github.com/KhronosGroup/Vulkan-Headers.git
  GIT_TAG v1.3.290
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(vulkan_headers)
set(Vulkan_INCLUDE_DIR "${vulkan_headers_SOURCE_DIR}/include" CACHE PATH "" FORCE)

FetchContent_Declare(
  spirv_headers
  GIT_REPOSITORY https://github.com/KhronosGroup/SPIRV-Headers.git
  GIT_TAG vulkan-sdk-1.3.290.0
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(spirv_headers)

# ggml-vulkan/CMakeLists.txt appelle find_package(SPIRV-Headers CONFIG REQUIRED).
# On fournit le fichier de configuration pour valider l'étape CMake.
set(_spirv_config_dir "${CMAKE_CURRENT_BINARY_DIR}/generated/spirv-config")
file(MAKE_DIRECTORY "${_spirv_config_dir}")
file(WRITE "${_spirv_config_dir}/SPIRV-HeadersConfig.cmake" "
set(SPIRV-Headers_FOUND TRUE)
if(NOT TARGET SPIRV-Headers::SPIRV-Headers)
  add_library(SPIRV-Headers::SPIRV-Headers INTERFACE IMPORTED)
  set_target_properties(SPIRV-Headers::SPIRV-Headers PROPERTIES
    INTERFACE_INCLUDE_DIRECTORIES \"${spirv_headers_SOURCE_DIR}/include\"
  )
endif()
")
list(PREPEND CMAKE_PREFIX_PATH "${_spirv_config_dir}")
set(SPIRV-Headers_DIR "${_spirv_config_dir}" CACHE PATH "" FORCE)

include_directories(
  "${vulkan_headers_SOURCE_DIR}/include"
  "${spirv_headers_SOURCE_DIR}/include"
)

find_library(NDK_VULKAN_LIB vulkan)
set(Vulkan_LIBRARY "${NDK_VULKAN_LIB}" CACHE FILEPATH "" FORCE)

if(CMAKE_HOST_SYSTEM_NAME STREQUAL "Darwin")
  set(_NDK_HOST "darwin-x86_64")
elseif(CMAKE_HOST_SYSTEM_NAME STREQUAL "Windows")
  set(_NDK_HOST "windows-x86_64")
else()
  set(_NDK_HOST "linux-x86_64")
endif()
find_program(Vulkan_GLSLC_EXECUTABLE glslc
  HINTS "${ANDROID_NDK}/shader-tools/${_NDK_HOST}" NO_CMAKE_FIND_ROOT_PATH)

set(GGML_VULKAN ON CACHE BOOL "" FORCE)


# ---- llama.cpp -------------------------------------------------------------
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_COMMON ON CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS ON CACHE BOOL "" FORCE)
set(LLAMA_MTMD ON CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
set(GGML_LLAMAFILE OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)

FetchContent_Declare(
  llama_cpp
  GIT_REPOSITORY https://github.com/ggml-org/llama.cpp.git
  GIT_TAG ${LLAMA_CPP_TAG}
  GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(llama_cpp)

if(NOT TARGET mtmd)
  add_subdirectory(${llama_cpp_SOURCE_DIR}/tools/mtmd ${CMAKE_CURRENT_BINARY_DIR}/mtmd)
endif()

add_library(nutrivlm SHARED nutrivlm_jni.cpp)
target_compile_options(nutrivlm PRIVATE -O3)

target_include_directories(nutrivlm PRIVATE
  ${llama_cpp_SOURCE_DIR}/tools/mtmd
  ${llama_cpp_SOURCE_DIR}/include
  ${llama_cpp_SOURCE_DIR}/ggml/include
)
target_link_libraries(nutrivlm PRIVATE llama mtmd android log)

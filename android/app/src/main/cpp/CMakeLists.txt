cmake_minimum_required(VERSION 3.22.1)
project(nutrivlm C CXX)

if(NOT DEFINED LLAMA_CPP_TAG)
  set(LLAMA_CPP_TAG "master")
endif()

include(FetchContent)
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

# Sécurité : force la compilation du module multimodal s'il n'a pas été inclus automatiquement
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

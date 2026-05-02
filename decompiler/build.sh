#!/usr/bin/env bash
# Build the Ghidra decompiler + our emscripten bridge into a standalone
# wasm module that the bint web frontend can load in a Web Worker.
#
# Produces (under web/decompiler/dist/):
#   bint_decompiler.js     ES module loader
#   bint_decompiler.wasm   compiled code
#   bint_decompiler.worker.js (if pthreads were enabled — not used here)
#
# Spec files are NOT bundled by this script — the page preloads them
# separately (e.g. via --preload-file or by fetching at runtime into
# Emscripten's virtual FS). Keeping the code module and the data
# distribution decoupled makes incremental rebuilds fast.

set -euo pipefail

# Locate bint repo root (this script lives at web/decompiler/build.sh).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
CPP_DIR="$REPO_ROOT/src/decompiler/cpp"
BRIDGE_DIR="$SCRIPT_DIR"
OUT_DIR="$SCRIPT_DIR/dist"
BUILD_DIR="$SCRIPT_DIR/build"

# Source emsdk if emcc isn't already on PATH.
if ! command -v emcc >/dev/null 2>&1; then
    if [[ -f "$HOME/wasm/emsdk/emsdk_env.sh" ]]; then
        # shellcheck source=/dev/null
        . "$HOME/wasm/emsdk/emsdk_env.sh" >/dev/null 2>&1
    elif [[ -f "$HOME/emsdk/emsdk_env.sh" ]]; then
        # shellcheck source=/dev/null
        . "$HOME/emsdk/emsdk_env.sh" >/dev/null 2>&1
    fi
fi
if ! command -v emcc >/dev/null 2>&1; then
    echo "error: emcc not found — source emsdk_env.sh first" >&2
    exit 1
fi

mkdir -p "$OUT_DIR" "$BUILD_DIR"

# Same exclusion list as build.rs. Everything we skip natively we also
# want to skip here: SLEIGH compiler, Ghidra Java bridge, BFD, terminal UI.
EXCLUDE=(
    consolemain.cc sleighexample.cc test.cc testfunction.cc
    slgh_compile.cc slghparse.cc slghscan.cc rulecompile.cc unify.cc
    ghidra_arch.cc ghidra_context.cc ghidra_process.cc ghidra_translate.cc
    inject_ghidra.cc loadimage_ghidra.cc typegrp_ghidra.cc database_ghidra.cc
    cpool_ghidra.cc comment_ghidra.cc string_ghidra.cc signature_ghidra.cc
    analyzesigs.cc bfd_arch.cc loadimage_bfd.cc codedata.cc raw_arch.cc
    xml_arch.cc loadimage_xml.cc libdecomp.cc callgraph.cc ifacedecomp.cc
    ifaceterm.cc interface.cc
)

# Build unity.cc pointing at every non-excluded .cc file, minus the three
# bison-generated parsers (grammar.cc/xml.cc/pcodeparse.cc) which define
# colliding `static yypgoto` etc. and must compile in their own TUs.
UNITY_STANDALONE=(grammar.cc xml.cc pcodeparse.cc)

UNITY_FILE="$BUILD_DIR/ghidra_unity.cc"
{
    echo "// Auto-generated wasm unity build."
    for f in "$CPP_DIR"/*.cc; do
        name="$(basename "$f")"
        skip=0
        for e in "${EXCLUDE[@]}" "${UNITY_STANDALONE[@]}"; do
            if [[ "$name" == "$e" ]]; then skip=1; break; fi
        done
        [[ $skip -eq 1 ]] && continue
        echo "#include \"$f\""
    done
} > "$UNITY_FILE"

# -Os optimizes for size (critical for shipping ~10MB of wasm).
# -sUSE_ZLIB=1 pulls in Emscripten's zlib port.
# -sALLOW_MEMORY_GROWTH=1 since we don't know up front how much a decompile
#   will allocate; grows heap as needed (small perf cost per grow).
# -sMODULARIZE=1 + -sEXPORT_ES6=1 gives us a clean ES module.
# -sENVIRONMENT=worker keeps the runtime lean; no DOM / web-worker glue for
#   main thread.
# -fexceptions uses legacy (setjmp-based) exception handling — works
#   everywhere; native wasm exceptions would be faster but Safari support
#   is still spotty.
# -sEXPORTED_FUNCTIONS lists every symbol we KEEPALIVE'd; malloc/free come
#   along because our bridge uses them.
# -sEXPORTED_RUNTIME_METHODS gives JS access to ccall/cwrap/FS for loading
#   spec files at runtime.
EXPORTED_FUNCS='[
    "_bint_decompiler_init",
    "_bint_decompiler_add_spec_dir",
    "_bint_decompiler_create",
    "_bint_decompiler_add_region",
    "_bint_decompiler_add_symbol",
    "_bint_decompiler_add_string",
    "_bint_decompiler_add_readonly",
    "_bint_decompiler_decompile",
    "_bint_decompiler_free_string",
    "_bint_decompiler_destroy",
    "_malloc",
    "_free"
]'

RUNTIME_METHODS='[
    "ccall",
    "cwrap",
    "FS",
    "UTF8ToString",
    "stringToUTF8",
    "lengthBytesUTF8",
    "HEAPU8",
    "HEAP8"
]'

echo "[build] compiling unity + bridge + 3 standalone parsers..."
CXXFLAGS=(-Os -std=c++17 -fexceptions -w -sUSE_ZLIB=1
          -I"$CPP_DIR" -I"$BRIDGE_DIR" -I"$REPO_ROOT/src/decompiler")

# Run the per-file compiles in parallel, then wait and fail if any failed.
# `wait -n` in a loop (bash 4.3+) isn't portable to macOS /bin/bash, so use
# the explicit-pid approach.
pids=()
em++ "${CXXFLAGS[@]}" -c "$UNITY_FILE" -o "$BUILD_DIR/ghidra_unity.o" & pids+=($!)
em++ "${CXXFLAGS[@]}" -c "$CPP_DIR/grammar.cc" -o "$BUILD_DIR/grammar.o" & pids+=($!)
em++ "${CXXFLAGS[@]}" -c "$CPP_DIR/xml.cc" -o "$BUILD_DIR/xml.o" & pids+=($!)
em++ "${CXXFLAGS[@]}" -c "$CPP_DIR/pcodeparse.cc" -o "$BUILD_DIR/pcodeparse.o" & pids+=($!)
em++ "${CXXFLAGS[@]}" -c "$BRIDGE_DIR/emscripten_bridge.cpp" -o "$BUILD_DIR/bridge.o" & pids+=($!)

fail=0
for pid in "${pids[@]}"; do
    if ! wait "$pid"; then fail=1; fi
done
if [[ $fail -ne 0 ]]; then
    echo "[build] compile failed" >&2
    exit 1
fi

echo "[build] linking..."
em++ \
    -Os \
    -fexceptions \
    -sUSE_ZLIB=1 \
    -sALLOW_MEMORY_GROWTH=1 \
    -sINITIAL_MEMORY=67108864 \
    -sWASM_BIGINT=1 \
    -sMODULARIZE=1 \
    -sEXPORT_ES6=1 \
    -sEXPORT_NAME=BintDecompilerModule \
    -sENVIRONMENT=worker,web \
    -sEXPORTED_FUNCTIONS="$EXPORTED_FUNCS" \
    -sEXPORTED_RUNTIME_METHODS="$RUNTIME_METHODS" \
    -sFORCE_FILESYSTEM=1 \
    -o "$OUT_DIR/bint_decompiler.js" \
    "$BUILD_DIR/ghidra_unity.o" \
    "$BUILD_DIR/grammar.o" \
    "$BUILD_DIR/xml.o" \
    "$BUILD_DIR/pcodeparse.o" \
    "$BUILD_DIR/bridge.o"

echo "[build] done: $OUT_DIR/bint_decompiler.{js,wasm}"
ls -la "$OUT_DIR"

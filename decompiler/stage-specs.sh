#!/usr/bin/env bash
# Copy the subset of Ghidra's processor specs that bint's web build ships
# into web/decompiler/spec/ and emit spec-manifest.json describing them.
#
# The manifest is consumed by worker.js to set up lazy-fetch FS entries —
# with that in place, the browser only downloads a .sla/.cspec when the
# decompiler actually opens it, so most users pay for just one arch's
# worth of bytes instead of the full 18 MB.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="$SCRIPT_DIR/spec"
MANIFEST="$SCRIPT_DIR/spec-manifest.json"

GHIDRA_ROOT="${GHIDRA_ROOT:-$HOME/ai/ghidra_12.0_PUBLIC}"
SRC_PROCS="$GHIDRA_ROOT/Ghidra/Processors"

if [[ ! -d "$SRC_PROCS" ]]; then
    echo "error: $SRC_PROCS not found — set GHIDRA_ROOT" >&2
    exit 1
fi

# Architectures we ship. Ordered so the manifest output is stable.
ARCHS=(x86 ARM AARCH64 MIPS PowerPC)

echo "[stage] wiping $OUT_DIR"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Glob extensions the decompiler needs at runtime. `.sinc`/`.slaspec` are
# SLEIGH *source* and are only needed by the SLEIGH compiler, not by the
# decompiler we ship, so we leave them out.
exts=(sla pspec cspec ldefs)

for arch in "${ARCHS[@]}"; do
    src="$SRC_PROCS/$arch/data/languages"
    if [[ ! -d "$src" ]]; then
        echo "[stage] skipping $arch (not found)" >&2
        continue
    fi
    dst="$OUT_DIR/$arch/data/languages"
    mkdir -p "$dst"
    for ext in "${exts[@]}"; do
        for f in "$src"/*.$ext; do
            [[ -e "$f" ]] || continue
            cp "$f" "$dst/"
        done
    done
done

# Emit manifest: one entry per file, with relative path + size in bytes.
# Worker.js uses `size` to pre-size the LazyFile so the first random
# seek doesn't need a HEAD request.
python3 - "$OUT_DIR" "$MANIFEST" <<'PY'
import json, os, sys
out_dir, manifest = sys.argv[1], sys.argv[2]
entries = []
for root, _, files in os.walk(out_dir):
    for name in sorted(files):
        full = os.path.join(root, name)
        rel = os.path.relpath(full, out_dir)
        entries.append({"path": rel.replace(os.sep, "/"), "size": os.path.getsize(full)})
entries.sort(key=lambda e: e["path"])
with open(manifest, "w") as f:
    json.dump({"files": entries}, f, indent=2)
print(f"[stage] {len(entries)} files → {manifest}")
PY

du -sh "$OUT_DIR"

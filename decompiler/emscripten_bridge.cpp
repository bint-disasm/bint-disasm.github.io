// Emscripten-only bridge: exposes a C-style API the web frontend can call
// via `ccall` / `cwrap` to drive the Ghidra decompiler in a wasm worker.
//
// This does NOT share code with the native cxx bridge on purpose — the cxx
// crate isn't in the picture here; JS is the marshalling layer instead.
// The two bridges share the vendored Ghidra C++ source
// (src/decompiler/cpp/) and the same libc_prototypes.h.

#include "sleigh_arch.hh"
#include "funcdata.hh"
#include "loadimage.hh"
#include "printlanguage.hh"
#include "printc.hh"
#include "action.hh"
#include "database.hh"
#include "capability.hh"
#include "architecture.hh"
#include "error.hh"
#include "marshal.hh"
#include "grammar.hh"

#include "libc_prototypes.h"

#include <emscripten/emscripten.h>

#include <cstdint>
#include <cstdlib>
#include <cstring>
#include <iostream>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

using ::ghidra::Address;
using ::ghidra::ArchitectureCapability;
using ::ghidra::AttributeId;
using ::ghidra::CapabilityPoint;
using ::ghidra::DataUnavailError;
using ::ghidra::DocumentStorage;
using ::ghidra::ElementId;
using ::ghidra::FuncProto;
using ::ghidra::Funcdata;
using ::ghidra::FunctionSymbol;
using ::ghidra::LoadImage;
using ::ghidra::LowlevelError;
using ::ghidra::ParseError;
using ::ghidra::Scope;
using ::ghidra::SleighArchitecture;
using ::ghidra::int4;
using ::ghidra::uint1;

// LoadImage that holds an arbitrary set of memory regions, keyed by
// virtual address. Replaces the prior single-buffer/single-base
// approach which assumed file_offset = vaddr - base_addr — only true
// for the simplest ELFs where one PT_LOAD covers the file. For Mach-O
// (multiple segments at non-contiguous VMAs) and for any binary where
// the entry point isn't on the first PT_LOAD's page, the flat
// projection silently aliases the wrong bytes.
//
// Regions are held in arbitrary order; lookup is linear. Typical
// binary has < 10 loadable segments so this is fine.
class MultiRegionLoadImage : public LoadImage {
    struct Region {
        uint64_t base;
        std::vector<uint8_t> bytes;
    };
    std::vector<Region> regions;

public:
    MultiRegionLoadImage() : LoadImage("bint") {}

    void addRegion(uint64_t addr, const uint8_t *bytes, size_t size) {
        regions.push_back({addr, std::vector<uint8_t>(bytes, bytes + size)});
    }

    void loadFill(uint1 *ptr, int4 size, const Address &addr) override {
        uint64_t start = addr.getOffset();
        uint64_t end = start + (uint64_t)size;
        // Zero-fill first so any byte not covered by a region reads as
        // 0 — matches what bint's segment-aware Memory layer effectively
        // does for inter-section padding. The string manager reads 32
        // bytes at a time hunting for a null terminator, so a strict
        // "must be in one region" check here would refuse to read short
        // strings that sit near a section boundary.
        std::memset(ptr, 0, size);
        bool any_filled = false;
        for (const auto &r : regions) {
            uint64_t r_start = r.base;
            uint64_t r_end = r.base + r.bytes.size();
            uint64_t overlap_start = start > r_start ? start : r_start;
            uint64_t overlap_end = end < r_end ? end : r_end;
            if (overlap_start < overlap_end) {
                std::memcpy(ptr + (overlap_start - start),
                            r.bytes.data() + (overlap_start - r_start),
                            overlap_end - overlap_start);
                any_filled = true;
            }
        }
        if (!any_filled) {
            std::ostringstream oss;
            oss << "bytes unavailable at 0x" << std::hex << start;
            throw DataUnavailError(oss.str());
        }
    }

    std::string getArchType(void) const override { return "bint"; }
    void adjustVma(long adjust) override {}
};

class BintArchitecture : public SleighArchitecture {
    MultiRegionLoadImage *image_loader;

    void buildLoader(DocumentStorage &store) override {
        collectSpecFiles(*errorstream);
        loader = image_loader;
    }

    void resolveArchitecture(void) override {
        archid = getTarget();
        SleighArchitecture::resolveArchitecture();
    }

    void postSpecFile(void) override { ::ghidra::Architecture::postSpecFile(); }

public:
    BintArchitecture(const std::string &targ, std::ostream *estream)
        : SleighArchitecture("bint", targ, estream),
          image_loader(new MultiRegionLoadImage()) {}

    void addRegion(uint64_t addr, const uint8_t *bytes, size_t size) {
        image_loader->addRegion(addr, bytes, size);
    }
};

struct DecompilerHandle {
    BintArchitecture *arch;
    // libc prototypes must be imported AFTER the JS caller has finished
    // adding symbols — parse_C's setPrototype binds by name and silently
    // skips functions that don't exist yet. We defer the import to the
    // first decompile() on this handle, guarded by this flag.
    bool libc_imported = false;
    explicit DecompilerHandle(BintArchitecture *a) : arch(a) {}
    ~DecompilerHandle() { delete arch; }
};

// -------- per-session state shared between init + create -------------------

namespace {
bool g_initialized = false;

// Feed the bundled libc catalogue (copied from libc_prototypes.h) through
// Ghidra's C parser. Same idempotent-and-silent pattern as the native side.
void import_libc_prototypes(BintArchitecture *arch) {
    std::string buf(bint_bridge::LIBC_PROTOTYPES);
    size_t pos = 0;
    while (pos < buf.size()) {
        size_t semi = buf.find(';', pos);
        if (semi == std::string::npos) break;
        std::string decl = buf.substr(pos, semi - pos + 1);
        pos = semi + 1;
        bool has_non_ws = false;
        for (char c : decl) {
            if (!std::isspace(static_cast<unsigned char>(c))) {
                has_non_ws = true;
                break;
            }
        }
        if (!has_non_ws) continue;
        try {
            std::istringstream is(decl);
            ::ghidra::parse_C(arch, is);
        } catch (const LowlevelError &) {
        } catch (const std::exception &) {
        }
    }
}
}  // namespace

// -------- C API exposed to JS via ccall/cwrap ------------------------------

extern "C" {

// Initialize the decompiler library. `spec_root` points to a virtual-FS
// directory where .ldefs files live (one per processor, under
// spec_root/<processor>/data/languages). Call once, before any create().
// Returns 0 on success, nonzero on failure; writes error to stderr.
EMSCRIPTEN_KEEPALIVE
int bint_decompiler_init(const char *spec_root) {
    try {
        if (!g_initialized) {
            AttributeId::initialize();
            ElementId::initialize();
            CapabilityPoint::initializeAll();
            ArchitectureCapability::sortCapabilities();
            g_initialized = true;
        }
        std::string root(spec_root);
        // Scan root for processor subdirs with data/languages.
        // JS precomputes the list and passes one dir at a time via
        // bint_decompiler_add_spec_dir — simpler than replicating FS walk
        // here. For a single-dir API case we fall back to addDir2Path.
        SleighArchitecture::specpaths.addDir2Path(root);
        return 0;
    } catch (const std::exception &e) {
        std::cerr << "bint_decompiler_init: " << e.what() << std::endl;
        return 1;
    }
}

// Add one directory to the SLEIGH spec search path. Expected to point at a
// `.../Processors/<arch>/data/languages` directory containing `.ldefs`.
EMSCRIPTEN_KEEPALIVE
int bint_decompiler_add_spec_dir(const char *dir) {
    try {
        if (!g_initialized) {
            AttributeId::initialize();
            ElementId::initialize();
            CapabilityPoint::initializeAll();
            ArchitectureCapability::sortCapabilities();
            g_initialized = true;
        }
        SleighArchitecture::specpaths.addDir2Path(dir);
        return 0;
    } catch (const std::exception &e) {
        std::cerr << "bint_decompiler_add_spec_dir: " << e.what() << std::endl;
        return 1;
    }
}

// Create a decompiler handle bound to `language_id` (e.g. "x86:LE:64:default:gcc").
// The handle starts with no memory regions — the caller must call
// `bint_decompiler_add_region` for each loadable segment before
// `bint_decompiler_decompile`. Returns an opaque handle or nullptr on
// failure.
EMSCRIPTEN_KEEPALIVE
void *bint_decompiler_create(const char *language_id) {
    BintArchitecture *arch = nullptr;
    try {
        arch = new BintArchitecture(language_id, &std::cerr);
        DocumentStorage store;
        arch->init(store);
    } catch (const LowlevelError &e) {
        std::cerr << "bint_decompiler_create: " << e.explain << std::endl;
        delete arch;
        return nullptr;
    } catch (const std::exception &e) {
        std::cerr << "bint_decompiler_create: " << e.what() << std::endl;
        delete arch;
        return nullptr;
    }

    // NOTE: libc prototype import is deferred until first decompile(),
    // see DecompilerHandle::libc_imported — parse_C binds prototypes to
    // functions *by name*, so running it here (before JS has called
    // add_symbol) would silently bind to nothing.
    return new DecompilerHandle(arch);
}

// Add a memory region to the decompiler's load image. `bytes[0..size]`
// is copied and mapped at virtual address `addr`. Call once per loadable
// segment of the binary, before the first decompile.
EMSCRIPTEN_KEEPALIVE
int bint_decompiler_add_region(void *handle, uint64_t addr, const uint8_t *bytes, size_t size) {
    if (!handle || !bytes || size == 0) return -1;
    try {
        auto *h = static_cast<DecompilerHandle *>(handle);
        h->arch->addRegion(addr, bytes, size);
        return 0;
    } catch (const std::exception &e) {
        std::cerr << "bint_decompiler_add_region: " << e.what() << std::endl;
        return -1;
    }
}

// Register a named function symbol. Must be called before the first
// decompile() on a given handle. Silently skipped if the address is
// already registered.
EMSCRIPTEN_KEEPALIVE
int bint_decompiler_add_symbol(void *handle, uint64_t address, const char *name) {
    if (!handle || !name || !*name) return -1;
    try {
        auto *h = static_cast<DecompilerHandle *>(handle);
        ::ghidra::AddrSpace *space = h->arch->getDefaultCodeSpace();
        Scope *scope = h->arch->symboltab->getGlobalScope();
        Address a(space, address);
        if (scope->findFunction(a) != nullptr) return 0;
        scope->addFunction(a, std::string(name));
        return 0;
    } catch (const std::exception &) {
        return -1;
    }
}

// Register a printable C string at `address` of `length` bytes
// (NUL excluded) as a `char[length]` symbol in the decompiler's
// global scope. Loads that resolve there render as the string
// literal in decompiled output. Cap mirrors the native bridge —
// runaway lengths get clamped so we don't construct an absurdly
// large array type.
EMSCRIPTEN_KEEPALIVE
int bint_decompiler_add_string(void *handle, uint64_t address, uint64_t length) {
    if (!handle || length == 0) return -1;
    try {
        auto *h = static_cast<DecompilerHandle *>(handle);
        ::ghidra::AddrSpace *space = h->arch->getDefaultCodeSpace();
        Scope *scope = h->arch->symboltab->getGlobalScope();
        Address a(space, address);
        if (scope->queryContainer(a, 1, Address()) != nullptr) return 0;
        ::ghidra::Datatype *char_t = h->arch->types->getTypeChar(1);
        int4 len = (int4)std::min<uint64_t>(length, 4096);
        ::ghidra::Datatype *arr_t = h->arch->types->getTypeArray(len, char_t);
        std::ostringstream nm;
        nm << "s_" << std::hex << address;
        scope->addSymbol(nm.str(), arr_t, a, Address());
        return 0;
    } catch (const std::exception &e) {
        std::cerr << "bint_decompiler_add_string: " << e.what() << std::endl;
        return -1;
    }
}

// Mark an address range as readonly (enables string-literal rendering).
EMSCRIPTEN_KEEPALIVE
int bint_decompiler_add_readonly(void *handle, uint64_t address, uint64_t size) {
    if (!handle || size == 0) return -1;
    try {
        auto *h = static_cast<DecompilerHandle *>(handle);
        ::ghidra::AddrSpace *space = h->arch->getDefaultCodeSpace();
        h->arch->symboltab->setPropertyRange(
            ::ghidra::Varnode::readonly,
            ::ghidra::Range(space, address, address + size - 1));
        return 0;
    } catch (const std::exception &) {
        return -1;
    }
}

// Decompile the function at `address`. Returns a malloc'd C string — the
// JS caller must free it via bint_decompiler_free_string. Returns nullptr
// on unrecoverable failure (prints to stderr).
EMSCRIPTEN_KEEPALIVE
char *bint_decompiler_decompile(void *handle, uint64_t address, const char *name) {
    if (!handle) return nullptr;
    auto *h = static_cast<DecompilerHandle *>(handle);
    // First-decompile lazy import of the libc prototype catalogue. Has
    // to happen AFTER the JS caller's add_symbol calls so parse_C can
    // bind "puts" etc. to the PLT stubs those calls registered.
    if (!h->libc_imported) {
        import_libc_prototypes(h->arch);
        h->libc_imported = true;
    }
    try {
        ::ghidra::AddrSpace *space = h->arch->getDefaultCodeSpace();
        Address addr(space, address);
        Scope *scope = h->arch->symboltab->getGlobalScope();
        Funcdata *fd = scope->findFunction(addr);
        if (fd == nullptr) {
            std::string nm = (name && *name) ? std::string(name) : "";
            if (nm.empty()) {
                std::ostringstream oss;
                oss << "FUN_" << std::hex << address;
                nm = oss.str();
            }
            FunctionSymbol *sym = scope->addFunction(addr, nm);
            fd = sym->getFunction();
        } else {
            h->arch->clearAnalysis(fd);
        }

        h->arch->allacts.getCurrent()->reset(*fd);
        h->arch->allacts.getCurrent()->perform(*fd);

        std::ostringstream oss;
        h->arch->print->setOutputStream(&oss);
        h->arch->print->docFunction(fd);
        std::string out = oss.str();

        char *buf = static_cast<char *>(std::malloc(out.size() + 1));
        if (!buf) return nullptr;
        std::memcpy(buf, out.data(), out.size());
        buf[out.size()] = '\0';
        return buf;
    } catch (const LowlevelError &e) {
        std::string msg = "/* decompile error: " + e.explain + " */";
        char *buf = static_cast<char *>(std::malloc(msg.size() + 1));
        if (!buf) return nullptr;
        std::memcpy(buf, msg.data(), msg.size() + 1);
        return buf;
    } catch (const std::exception &e) {
        std::string msg = std::string("/* decompile error: ") + e.what() + " */";
        char *buf = static_cast<char *>(std::malloc(msg.size() + 1));
        if (!buf) return nullptr;
        std::memcpy(buf, msg.data(), msg.size() + 1);
        return buf;
    }
}

EMSCRIPTEN_KEEPALIVE
void bint_decompiler_free_string(char *s) { std::free(s); }

EMSCRIPTEN_KEEPALIVE
void bint_decompiler_destroy(void *handle) {
    if (!handle) return;
    delete static_cast<DecompilerHandle *>(handle);
}

}  // extern "C"

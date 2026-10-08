# Source from Bash: source scripts/activate-toolchain.sh
# Paths derive from this checkout; no global settings or shell profiles change.
OMEGA_V3_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="$OMEGA_V3_ROOT/.tools/runtime/node_modules/node/bin:$OMEGA_V3_ROOT/.tools/runtime/node_modules/.bin:$OMEGA_V3_ROOT/.tools/uv/bin:$PATH"
export COREPACK_HOME="$OMEGA_V3_ROOT/.tools/corepack"
export PNPM_HOME="$OMEGA_V3_ROOT/.tools/pnpm-home"
export XDG_CACHE_HOME="$OMEGA_V3_ROOT/.tools/cache"
export XDG_DATA_HOME="$OMEGA_V3_ROOT/.tools/data"
export XDG_CONFIG_HOME="$OMEGA_V3_ROOT/.tools/config"
export npm_config_cache="$OMEGA_V3_ROOT/.tools/npm-cache"
export pnpm_config_store_dir="$OMEGA_V3_ROOT/.tools/pnpm-store"
export pnpm_config_cache_dir="$OMEGA_V3_ROOT/.tools/pnpm-cache"
export pnpm_config_state_dir="$OMEGA_V3_ROOT/.tools/pnpm-state"
export UV_CACHE_DIR="$OMEGA_V3_ROOT/.tools/uv-cache"
export UV_PYTHON_INSTALL_DIR="$OMEGA_V3_ROOT/.tools/python"
export UV_PYTHON_BIN_DIR="$OMEGA_V3_ROOT/.tools/python-bin"
export UV_TOOL_DIR="$OMEGA_V3_ROOT/.tools/uv-tools"
export UV_TOOL_BIN_DIR="$OMEGA_V3_ROOT/.tools/uv-tool-bin"
export UV_PROJECT_ENVIRONMENT="$OMEGA_V3_ROOT/.venv"
export UV_PYTHON_INSTALL_BIN=false
export UV_OFFLINE=true
export UV_FROZEN=true
export UV_NO_SYNC=true
export PLAYWRIGHT_BROWSERS_PATH="$OMEGA_V3_ROOT/.tools/playwright"
export ASTRO_TELEMETRY_DISABLED=1

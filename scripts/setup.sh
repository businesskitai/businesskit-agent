#!/usr/bin/env bash
# scripts/setup.sh — Auto-configure BusinessKit MCP for any agentic CLI/IDE

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== BusinessKit Universal Agent Setup ==="

# 1. Locate BusinessKit binary
BK_BIN=""
if [ -n "$BUSINESSKIT_BIN" ] && [ -x "$BUSINESSKIT_BIN" ]; then
  BK_BIN="$BUSINESSKIT_BIN"
elif [ -x "/Applications/BusinessKit.app/Contents/MacOS/businesskit" ]; then
  BK_BIN="/Applications/BusinessKit.app/Contents/MacOS/businesskit"
elif [ -x "${ROOT_DIR}/../src-tauri/target/release/businesskit" ]; then
  BK_BIN="$(cd "${ROOT_DIR}/../src-tauri/target/release" && pwd)/businesskit"
elif [ -x "${ROOT_DIR}/../src-tauri/target/debug/businesskit" ]; then
  BK_BIN="$(cd "${ROOT_DIR}/../src-tauri/target/debug" && pwd)/businesskit"
elif command -v businesskit >/dev/null 2>&1; then
  BK_BIN="$(command -v businesskit)"
fi

if [ -z "$BK_BIN" ]; then
  echo "Error: Could not locate BusinessKit binary."
  echo "Please install BusinessKit or set BUSINESSKIT_BIN=/path/to/binary"
  exit 1
fi
echo "✓ Found binary: $BK_BIN"

# 2. Discover available profiles
CREDS_DIR="${HOME}/.businesskit/creds"
PROFILES=()
DEFAULT_PROFILE="4628a5b1-ac05-4156-9d76-04bbd71119a1" # BusinessKit profile

if [ -d "$CREDS_DIR" ]; then
  for f in "${CREDS_DIR}"/userdb_*.dat; do
    if [ -f "$f" ]; then
      pid=$(basename "$f" | sed -e 's/^userdb_//' -e 's/\.dat$//')
      PROFILES+=("$pid")
    fi
  done
fi

SELECTED_PROFILE=""
if [ -n "$1" ]; then
  SELECTED_PROFILE="$1"
elif [ "${#PROFILES[@]}" -eq 1 ]; then
  SELECTED_PROFILE="${PROFILES[0]}"
elif [ -f "${CREDS_DIR}/userdb_${DEFAULT_PROFILE}.dat" ]; then
  SELECTED_PROFILE="$DEFAULT_PROFILE"
elif [ "${#PROFILES[@]}" -gt 0 ]; then
  SELECTED_PROFILE="${PROFILES[0]}"
else
  echo "Warning: No cached profiles found in ~/.businesskit/creds/."
  echo "Defaulting to: $DEFAULT_PROFILE"
  SELECTED_PROFILE="$DEFAULT_PROFILE"
fi

echo "✓ Selected profile: $SELECTED_PROFILE"

# 3. Create output directory
mkdir -p "${ROOT_DIR}/output"

# 4. Generate Claude Code configuration (.mcp.json)
cat <<EOF > "${ROOT_DIR}/.mcp.json"
{
  "mcpServers": {
    "businesskit": {
      "command": "${BK_BIN}",
      "args": ["--mcp", "--profile", "${SELECTED_PROFILE}"]
    }
  }
}
EOF
echo "✓ Generated Claude Code config: ${ROOT_DIR}/.mcp.json"

# 5. Generate Cursor configuration (.cursor/mcp.json)
mkdir -p "${ROOT_DIR}/.cursor"
cat <<EOF > "${ROOT_DIR}/.cursor/mcp.json"
{
  "mcpServers": {
    "businesskit": {
      "command": "${BK_BIN}",
      "args": ["--mcp", "--profile", "${SELECTED_PROFILE}"]
    }
  }
}
EOF
echo "✓ Generated Cursor config: ${ROOT_DIR}/.cursor/mcp.json"

# 6. Generate VS Code configuration (.vscode/mcp.json)
mkdir -p "${ROOT_DIR}/.vscode"
cat <<EOF > "${ROOT_DIR}/.vscode/mcp.json"
{
  "servers": {
    "businesskit": {
      "type": "stdio",
      "command": "${BK_BIN}",
      "args": ["--mcp", "--profile", "${SELECTED_PROFILE}"]
    }
  }
}
EOF
echo "✓ Generated VS Code config: ${ROOT_DIR}/.vscode/mcp.json"

# 7. Generate Gemini / Antigravity settings
mkdir -p "${ROOT_DIR}/.gemini"
cat <<EOF > "${ROOT_DIR}/.gemini/mcp_config.json"
{
  "mcpServers": {
    "businesskit": {
      "command": "${BK_BIN}",
      "args": ["--mcp", "--profile", "${SELECTED_PROFILE}"]
    }
  }
}
EOF
echo "✓ Generated Antigravity / Gemini config: ${ROOT_DIR}/.gemini/mcp_config.json"

# 8. Register with Antigravity CLI if agy is in PATH
if command -v agy >/dev/null 2>&1; then
  echo "Registering with Antigravity CLI (agy)..."
  agy mcp add businesskit "${BK_BIN}" --mcp --profile "${SELECTED_PROFILE}" 2>/dev/null || true
fi

echo ""
echo "=== Setup Complete! ==="
echo "You can now run BusinessKit from any agentic CLI in this workspace:"
echo "  - Antigravity / Gemini CLI"
echo "  - Cursor (open this directory in Cursor)"
echo "  - Claude Code (run 'claude' in this directory)"
echo "  - VS Code Copilot"

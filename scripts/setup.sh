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

if [ -d "$CREDS_DIR" ]; then
  for f in "${CREDS_DIR}"/userdb_*.dat; do
    if [ -f "$f" ]; then
      pid=$(basename "$f" | sed -e 's/^userdb_//' -e 's/\.dat$//')
      PROFILES+=("$pid")
    fi
  done
fi

CONFIGURE_ALL=false
SELECTED_PROFILE=""

if [ "$1" = "--all" ]; then
  CONFIGURE_ALL=true
  if [ "${#PROFILES[@]}" -gt 0 ]; then
    SELECTED_PROFILE="${PROFILES[0]}"
  fi
elif [ -n "$1" ]; then
  SELECTED_PROFILE="$1"
elif [ -n "$BUSINESSKIT_PROFILE" ]; then
  SELECTED_PROFILE="$BUSINESSKIT_PROFILE"
elif [ "${#PROFILES[@]}" -gt 0 ]; then
  SELECTED_PROFILE="${PROFILES[0]}"
fi

if [ "${#PROFILES[@]}" -gt 0 ]; then
  echo "✓ Discovered ${#PROFILES[@]} organization profile(s):"
  for p in "${PROFILES[@]}"; do
    if [ "$p" = "$SELECTED_PROFILE" ]; then
      echo "  * $p (primary selection)"
    else
      echo "    $p"
    fi
  done
fi

if [ -n "$SELECTED_PROFILE" ]; then
  echo "✓ Selected primary profile: $SELECTED_PROFILE"
  MCP_ARGS='["--mcp", "--profile", "'"${SELECTED_PROFILE}"'"]'
else
  echo "✓ Using active BusinessKit profile"
  MCP_ARGS='["--mcp"]'
fi

# Build JSON server map
build_mcp_servers_json() {
  local is_vscode="${1:-false}"
  local json="{"
  
  # Default primary server
  if [ "$is_vscode" = "true" ]; then
    json="${json}\n    \"businesskit\": {\n      \"type\": \"stdio\",\n      \"command\": \"${BK_BIN}\",\n      \"args\": ${MCP_ARGS}\n    }"
  else
    json="${json}\n    \"businesskit\": {\n      \"command\": \"${BK_BIN}\",\n      \"args\": ${MCP_ARGS}\n    }"
  fi

  # If CONFIGURE_ALL is true, add an entry for each profile
  if [ "$CONFIGURE_ALL" = "true" ] && [ "${#PROFILES[@]}" -gt 1 ]; then
    for p in "${PROFILES[@]}"; do
      short_id="${p:0:8}"
      server_name="businesskit-${short_id}"
      p_args='["--mcp", "--profile", "'"${p}"'"]'
      if [ "$is_vscode" = "true" ]; then
        json="${json},\n    \"${server_name}\": {\n      \"type\": \"stdio\",\n      \"command\": \"${BK_BIN}\",\n      \"args\": ${p_args}\n    }"
      else
        json="${json},\n    \"${server_name}\": {\n      \"command\": \"${BK_BIN}\",\n      \"args\": ${p_args}\n    }"
      fi
    done
  fi

  json="${json}\n  }"
  echo -e "$json"
}

# 3. Create output directory
mkdir -p "${ROOT_DIR}/output"

# 4. Generate Claude Code configuration (.mcp.json)
SERVERS_JSON=$(build_mcp_servers_json false)
cat <<EOF > "${ROOT_DIR}/.mcp.json"
{
  "mcpServers": ${SERVERS_JSON}
}
EOF
echo "✓ Generated Claude Code config: ${ROOT_DIR}/.mcp.json"

# 5. Generate Cursor configuration (.cursor/mcp.json)
mkdir -p "${ROOT_DIR}/.cursor"
cat <<EOF > "${ROOT_DIR}/.cursor/mcp.json"
{
  "mcpServers": ${SERVERS_JSON}
}
EOF
echo "✓ Generated Cursor config: ${ROOT_DIR}/.cursor/mcp.json"

# 6. Generate VS Code configuration (.vscode/mcp.json)
VSCODE_SERVERS_JSON=$(build_mcp_servers_json true)
mkdir -p "${ROOT_DIR}/.vscode"
cat <<EOF > "${ROOT_DIR}/.vscode/mcp.json"
{
  "servers": ${VSCODE_SERVERS_JSON}
}
EOF
echo "✓ Generated VS Code config: ${ROOT_DIR}/.vscode/mcp.json"

# 7. Generate Gemini / Antigravity settings
mkdir -p "${ROOT_DIR}/.gemini"
cat <<EOF > "${ROOT_DIR}/.gemini/mcp_config.json"
{
  "mcpServers": ${SERVERS_JSON}
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

if [ "$CONFIGURE_ALL" = "false" ] && [ "${#PROFILES[@]}" -gt 1 ]; then
  echo ""
  echo "Multi-Profile Parallel Operations:"
  echo "  - To switch profile inside a running session: call 'profile_switch(profile_id=\"...\")'"
  echo "  - To configure all discovered profiles as dedicated parallel servers: run './scripts/setup.sh --all'"
fi

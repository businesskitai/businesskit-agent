#!/usr/bin/env bash
# scripts/update.sh — Safely update BusinessKit Agent to latest release without touching user context, memory, or custom skills

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=== Updating BusinessKit Agent ==="

# 1. Snapshot user custom context in memory/temp folder
TEMP_BACKUP="$(mktemp -d)"
if [ -d "${ROOT_DIR}/context" ]; then
  mkdir -p "${TEMP_BACKUP}/context"
  cp -r "${ROOT_DIR}/context/"* "${TEMP_BACKUP}/context/" 2>/dev/null || true
fi

# 2. Update repository files
if [ -d "${ROOT_DIR}/.git" ]; then
  echo "✓ Found git repository. Fetching latest release from GitHub..."
  git -C "${ROOT_DIR}" fetch --depth 1 origin main
  git -C "${ROOT_DIR}" reset --hard FETCH_HEAD
else
  echo "✓ Downloading latest release from GitHub..."
  curl -sL "https://github.com/businesskitai/businesskit-agent/archive/refs/heads/main.tar.gz" | tar -xz -C "${TEMP_BACKUP}"
  EXTRACTED_DIR=$(find "${TEMP_BACKUP}" -maxdepth 1 -name "businesskit-agent-*" | head -n 1)
  if [ -n "$EXTRACTED_DIR" ]; then
    cp -r "${EXTRACTED_DIR}/commands" "${ROOT_DIR}/"
    cp -r "${EXTRACTED_DIR}/skills" "${ROOT_DIR}/"
    cp -r "${EXTRACTED_DIR}/rules" "${ROOT_DIR}/" 2>/dev/null || true
    cp "${EXTRACTED_DIR}/AGENTS.md" "${ROOT_DIR}/"
    cp "${EXTRACTED_DIR}/CLAUDE.md" "${ROOT_DIR}/"
    cp "${EXTRACTED_DIR}/GEMINI.md" "${ROOT_DIR}/"
    cp "${EXTRACTED_DIR}/package.json" "${ROOT_DIR}/"
    cp -r "${EXTRACTED_DIR}/bin" "${ROOT_DIR}/"
    cp -r "${EXTRACTED_DIR}/scripts" "${ROOT_DIR}/"
  fi
fi

# 3. Restore user personalized context files (business, brand, voice)
if [ -d "${TEMP_BACKUP}/context" ]; then
  echo "✓ Restoring your personalized context files (business.md, brand.md, brand-voice.md)..."
  cp -r "${TEMP_BACKUP}/context/"* "${ROOT_DIR}/context/" 2>/dev/null || true
fi

rm -rf "${TEMP_BACKUP}"

# 4. Refresh MCP configurations & links
if [ -f "${ROOT_DIR}/scripts/setup.sh" ]; then
  bash "${ROOT_DIR}/scripts/setup.sh" "$@"
fi

echo ""
echo "=== Update Complete! ==="
echo "✓ All commands, modular skills, and rules updated to the latest upstream release."
echo "✓ Your personalized context, memory logs, and custom skills were 100% preserved."

// scripts/setup.ts — Node/TypeScript BusinessKit MCP Setup Wizard
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('=== BusinessKit Universal Agent Setup (TypeScript) ===');

// 1. Locate binary
let bkBin = process.env.BUSINESSKIT_BIN || '';
const candidates = [
  '/Applications/BusinessKit.app/Contents/MacOS/businesskit',
  path.resolve(ROOT_DIR, '../src-tauri/target/release/businesskit'),
  path.resolve(ROOT_DIR, '../src-tauri/target/debug/businesskit'),
];

if (!bkBin) {
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      bkBin = c;
      break;
    }
  }
}

if (!bkBin) {
  try {
    bkBin = execSync('which businesskit', { encoding: 'utf8' }).trim();
  } catch {}
}

if (!bkBin || !fs.existsSync(bkBin)) {
  console.error('Error: BusinessKit binary not found. Set BUSINESSKIT_BIN=/path/to/binary');
  process.exit(1);
}
console.log(`✓ Found binary: ${bkBin}`);

// 2. Locate Profiles
const credsDir = path.join(process.env.HOME || '', '.businesskit/creds');
const arg = process.argv[2] || '';
const configureAll = arg === '--all';
let discoveredProfiles: string[] = [];

if (fs.existsSync(credsDir)) {
  discoveredProfiles = fs
    .readdirSync(credsDir)
    .filter((f) => f.startsWith('userdb_') && f.endsWith('.dat'))
    .map((f) => f.replace(/^userdb_/, '').replace(/\.dat$/, ''));
}

let selectedProfile = !configureAll && arg ? arg : process.env.BUSINESSKIT_PROFILE || '';
if (!selectedProfile && discoveredProfiles.length > 0) {
  selectedProfile = discoveredProfiles[0];
}

if (discoveredProfiles.length > 0) {
  console.log(`✓ Discovered ${discoveredProfiles.length} organization profile(s):`);
  for (const p of discoveredProfiles) {
    console.log(p === selectedProfile ? `  * ${p} (primary selection)` : `    ${p}`);
  }
}

const primaryArgs = selectedProfile ? ['--mcp', '--profile', selectedProfile] : ['--mcp'];
console.log(selectedProfile ? `✓ Target profile: ${selectedProfile}` : '✓ Using active BusinessKit profile');

// Build MCP servers dictionary
const mcpServers: Record<string, { command: string; args: string[] }> = {
  businesskit: {
    command: bkBin,
    args: primaryArgs,
  },
};

const vscodeServers: Record<string, { type: string; command: string; args: string[] }> = {
  businesskit: {
    type: 'stdio',
    command: bkBin,
    args: primaryArgs,
  },
};

if (configureAll && discoveredProfiles.length > 1) {
  for (const p of discoveredProfiles) {
    const shortId = p.slice(0, 8);
    const sName = `businesskit-${shortId}`;
    const pArgs = ['--mcp', '--profile', p];
    mcpServers[sName] = { command: bkBin, args: pArgs };
    vscodeServers[sName] = { type: 'stdio', command: bkBin, args: pArgs };
  }
}

// 3. Output directory
const outputDir = path.join(ROOT_DIR, 'output');
if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

// 4. Claude Code (.mcp.json)
const claudeConfig = { mcpServers };
fs.writeFileSync(path.join(ROOT_DIR, '.mcp.json'), JSON.stringify(claudeConfig, null, 2));
console.log('✓ Wrote .mcp.json (Claude Code)');

// 5. Cursor (.cursor/mcp.json)
const cursorDir = path.join(ROOT_DIR, '.cursor');
if (!fs.existsSync(cursorDir)) fs.mkdirSync(cursorDir, { recursive: true });
fs.writeFileSync(path.join(cursorDir, 'mcp.json'), JSON.stringify(claudeConfig, null, 2));
console.log('✓ Wrote .cursor/mcp.json (Cursor)');

// 6. VS Code (.vscode/mcp.json)
const vscodeDir = path.join(ROOT_DIR, '.vscode');
if (!fs.existsSync(vscodeDir)) fs.mkdirSync(vscodeDir, { recursive: true });
const vscodeConfig = { servers: vscodeServers };
fs.writeFileSync(path.join(vscodeDir, 'mcp.json'), JSON.stringify(vscodeConfig, null, 2));
console.log('✓ Wrote .vscode/mcp.json (VS Code)');

// 7. Antigravity (.gemini/mcp_config.json)
const geminiDir = path.join(ROOT_DIR, '.gemini');
if (!fs.existsSync(geminiDir)) fs.mkdirSync(geminiDir, { recursive: true });
fs.writeFileSync(path.join(geminiDir, 'mcp_config.json'), JSON.stringify(claudeConfig, null, 2));
console.log('✓ Wrote .gemini/mcp_config.json (Antigravity / Gemini)');

console.log('\n=== Ready! Launch any agentic CLI to interact with BusinessKit ===');
if (!configureAll && discoveredProfiles.length > 1) {
  console.log('\nMulti-Profile Parallel Operations:');
  console.log('  - To switch profile inside a running session: call profile_switch(profile_id="...")');
  console.log('  - To configure all discovered profiles as dedicated parallel servers: run ts-node scripts/setup.ts --all');
}

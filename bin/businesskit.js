#!/usr/bin/env node
// bin/businesskit.js — BusinessKit MCP Server & CLI entrypoint

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const arg1 = process.argv[2];

if (arg1 === 'update' || arg1 === 'upgrade' || arg1 === '--update') {
  const proc = spawn('bash', [join(root, 'scripts', 'update.sh'), ...process.argv.slice(3)], {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env },
  });
  proc.on('exit', (code) => process.exit(code ?? 0));
} else if (arg1 === 'setup' || arg1 === '--setup') {
  const proc = spawn('bash', [join(root, 'scripts', 'setup.sh'), ...process.argv.slice(3)], {
    stdio: 'inherit',
    cwd: root,
    env: { ...process.env },
  });
  proc.on('exit', (code) => process.exit(code ?? 0));
} else {
  // Start the Model Context Protocol (MCP) server
  const distServer = join(root, 'dist', 'server.js');
  if (existsSync(distServer)) {
    import(distServer).then((mod) => {
      if (typeof mod.startServer === 'function') {
        mod.startServer().catch((err) => {
          console.error('[BusinessKit MCP] Server startup error:', err);
          process.exit(1);
        });
      }
    });
  } else {
    // Development fallback using tsx
    const tsServer = join(root, 'src', 'server.ts');
    const proc = spawn('npx', ['tsx', tsServer], {
      stdio: 'inherit',
      cwd: root,
      env: { ...process.env },
    });
    proc.on('exit', (code) => process.exit(code ?? 0));
  }
}

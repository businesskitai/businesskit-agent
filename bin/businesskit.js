#!/usr/bin/env node
// bin/businesskit.js — CLI entrypoint to configure BusinessKit Agent
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const setupScript = join(root, 'scripts', 'setup.sh');

const proc = spawn('bash', [setupScript, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env },
});

proc.on('exit', (code) => process.exit(code ?? 0));

#!/usr/bin/env node
// bin/businesskit.js — CLI entrypoint to configure BusinessKit Agent
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const arg1 = process.argv[2];
let targetScript = join(root, 'scripts', 'setup.sh');
let scriptArgs = process.argv.slice(2);

if (arg1 === 'update' || arg1 === 'upgrade' || arg1 === '--update') {
  targetScript = join(root, 'scripts', 'update.sh');
  scriptArgs = process.argv.slice(3);
} else if (arg1 === 'setup' || arg1 === '--setup') {
  scriptArgs = process.argv.slice(3);
}

const proc = spawn('bash', [targetScript, ...scriptArgs], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env },
});

proc.on('exit', (code) => process.exit(code ?? 0));

#!/usr/bin/env node

import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const cliTs = resolve(rootDir, 'cli.ts');

// Run the cli.ts file using tsx
const result = spawnSync('npx', ['tsx', cliTs, ...process.argv.slice(2)], { 
  stdio: 'inherit',
  cwd: process.cwd()
});

process.exit(result.status ?? 0);

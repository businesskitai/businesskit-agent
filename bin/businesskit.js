#!/usr/bin/env node
// bin/businesskit.js — npm global install entry point
// Compiled shim that launches cli.ts via tsx
// Cursor is right: bin entries must be .js for npm to execute them correctly

import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { spawn } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, '..')
const cli = join(root, 'cli.ts')

// Find tsx — from local node_modules or global
const tsx = process.execPath.replace('node', 'tsx')
const proc = spawn(tsx, [cli, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: root,
  env: { ...process.env }
})

proc.on('exit', code => process.exit(code ?? 0))
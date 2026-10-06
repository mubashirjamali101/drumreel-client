import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: { cli: 'src/cli/main.ts', mcp: 'src/mcp/main.ts' },
    outDir: 'dist',
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    clean: true,
    sourcemap: true,
    dts: false,
    banner: { js: '#!/usr/bin/env node' },
  },
  {
    entry: { index: 'src/index.ts' },
    outDir: 'dist',
    format: ['esm'],
    target: 'node20',
    platform: 'node',
    clean: false,
    sourcemap: true,
    dts: true,
  },
])

import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  outDir: 'dist',
  platform: 'node',
  target: 'node16',
  treeshake: true,
  sourcemap: false,
  shims: true,
  cjsDefault: true,
  outExtensions({ format }) {
    return {
      js: format === 'es' ? '.mjs' : '.cjs',
    }
  },
})

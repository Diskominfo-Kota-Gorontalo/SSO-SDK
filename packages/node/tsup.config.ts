import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    express: 'src/express.ts',
    next: 'src/next.ts',
    vue: 'src/vue.ts',
  },
  format: ['esm'],
  target: 'node20',
  dts: true,
  clean: true,
  sourcemap: false,
  splitting: true,
  treeshake: true,
  external: ['express', 'express-session', 'next-auth', '@auth/core', 'vue'],
});

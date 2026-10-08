import { build } from 'esbuild';

// Main process, preloads and the standalone hub, each bundled into one file
// so the installed app needs no node_modules.
await build({
  entryPoints: ['src/main.ts', 'src/preload.ts', 'src/settings-preload.ts', 'src/hub-cli.ts'],
  outdir: 'dist',
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'cjs',
  external: ['electron'],
  // the public repo installed apps update from; empty means no auto-update
  define: {
    'process.env.RIZZOTO_UPDATE_REPO': JSON.stringify(process.env.RIZZOTO_UPDATE_REPO ?? ''),
    'process.env.RIZZOTO_UPDATE_HOST': JSON.stringify(process.env.RIZZOTO_UPDATE_HOST ?? ''),
  },
  sourcemap: 'linked',
  logLevel: 'warning',
});

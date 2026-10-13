import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';

const updateRepo = process.env.RIZZOTO_UPDATE_REPO ?? '';
const publisher = process.env.RIZZOTO_UPDATE_PUBLISHER?.trim() ?? '';
if (updateRepo && (!/^[\w.-]+\/[\w.-]+$/.test(updateRepo) || !publisher)) {
  throw new Error(
    'Update builds require RIZZOTO_UPDATE_REPO and RIZZOTO_UPDATE_PUBLISHER (certificate publisher name).',
  );
}
if (process.env.RIZZOTO_UPDATE_HOST) {
  throw new Error(
    'Custom HTTP update hosts are no longer supported. Use the HTTPS release repository.',
  );
}

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
    'process.env.RIZZOTO_UPDATE_REPO': JSON.stringify(updateRepo),
    'process.env.RIZZOTO_UPDATE_PUBLISHER': JSON.stringify(publisher),
  },
  sourcemap: 'linked',
  logLevel: 'warning',
});

// JSON is also valid YAML. Pin the updater's on-disk signature policy rather
// than accepting a missing publisher in electron-builder's generated config.
await mkdir('dist', { recursive: true });
const [owner, repo] = updateRepo.split('/');
await writeFile(
  'dist/trusted-update.json',
  JSON.stringify({
    provider: 'github',
    owner,
    repo,
    publisherName: publisher ? [publisher] : [],
    updaterCacheDirName: 'rizzoto-updater',
  }),
);

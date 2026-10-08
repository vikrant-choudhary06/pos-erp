import path from 'node:path';
import { startHub } from './hub';

// Runs the hub without the desktop app, for a mini PC with no screen or for
// trying it out:  node dist/hub-cli.js --cloud https://pos.example.in

function arg(name: string, fallback?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const cloudUrl = arg('cloud', process.env.CLOUD_URL);
if (!cloudUrl) {
  console.error('Usage: node dist/hub-cli.js --cloud <url> [--port 7400] [--data ./hub-data]');
  process.exit(1);
}

startHub({
  cloudUrl,
  port: Number(arg('port', '7400')),
  dataDir: path.resolve(arg('data', 'hub-data')!),
  log: (message) => console.log(new Date().toLocaleTimeString(), message),
}).then((hub) => {
  for (const a of hub.status().addresses) console.log(`Tablets: ${a}/pos`);
  const stop = () => void hub.stop().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
});

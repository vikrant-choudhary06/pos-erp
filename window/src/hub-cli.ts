import path from 'node:path';
import fs from 'node:fs';
import { startHub } from './hub';
import { keyProtection } from './hub/protection';

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

async function run() {
  const cert = arg('tls-cert');
  const key = arg('tls-key');
  if (!!cert !== !!key) throw new Error('Provide both --tls-cert and --tls-key');
  return startHub({
    cloudUrl: cloudUrl!,
    port: Number(arg('port', '7400')),
    dataDir: path.resolve(arg('data', 'hub-data')!),
    protection: keyProtection(process.env.RIZZOTO_HUB_KEY),
    tls: cert && key ? { cert: fs.readFileSync(cert), key: fs.readFileSync(key) } : undefined,
    host: arg('host'),
    log: (message) => console.log(new Date().toLocaleTimeString(), message),
  });
}
run()
  .then((hub) => {
    console.log(`Counter: ${hub.status().localOrigin}/pos`);
    for (const a of hub.status().addresses) console.log(`Tablets: ${a}/pos`);
    const stop = () => void hub.stop().then(() => process.exit(0));
    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
  })
  .catch((err) => {
    console.error((err as Error).message);
    process.exitCode = 1;
  });

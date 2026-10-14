import type { ClientRequest } from 'node:http';
import type { Cloud } from './cloud';

type Options = {
  intervalMs?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
  log?: (message: string) => void;
};

type Result = { healthy: boolean; retryable: boolean; retryAfter: number; reason: string };
const MAX_BODY = 8192;
const MAX_DELAY = 2_147_483_647;

function retryAfter(value: string | undefined): number {
  if (!value) return 0;
  const delay = /^\d+$/.test(value) ? Number(value) * 1000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.min(MAX_DELAY, Math.max(0, delay)) : 0;
}

/** A desktop request through the web proxy, independent of sign-in and order syncing. */
export function startHealthPing(cloud: Pick<Cloud, 'open'>, options: Options = {}) {
  const interval = options.intervalMs ?? 5 * 60_000;
  const timeout = options.timeoutMs ?? 20_000;
  const retryDelay = options.retryDelayMs ?? 10_000;
  if (
    [interval, timeout, retryDelay].some(
      (value) => !Number.isFinite(value) || value < 1 || value > MAX_DELAY,
    )
  )
    throw new Error('Health ping timings must be positive milliseconds within the timer limit');
  let timer: NodeJS.Timeout | undefined;
  let request: ClientRequest | undefined;
  let stopped = false;
  let paused = false;
  let running = false;
  let failed = false;
  let generation = 0;
  let pending: Promise<Result> | undefined;

  function log(message: string) {
    // A background check must not interrupt the hub, even if its log cannot be written.
    try {
      options.log?.(`Health ping: ${message}`);
    } catch {}
  }

  function probe(): Promise<Result> {
    return new Promise((resolve) => {
      let finished = false;
      let deadline: NodeJS.Timeout | undefined;
      let req: ClientRequest | undefined;
      const finish = (result: Result) => {
        if (finished) return;
        finished = true;
        clearTimeout(deadline);
        if (request === req) request = undefined;
        resolve(result);
        req?.destroy();
      };
      const failure = (reason: string, retryable = true, delay = 0) =>
        finish({ healthy: false, retryable, retryAfter: delay, reason });
      try {
        // No cookies, credentials or automatic redirects. TLS verification stays enabled.
        req = cloud.open(
          'GET',
          '/api/health',
          { accept: 'application/json', 'cache-control': 'no-cache' },
          0,
        );
        request = req;
        deadline = setTimeout(() => failure('request timed out'), timeout);
        deadline.unref();
        req.on('error', () => failure('network or TLS error'));
        req.on('response', (res) => {
          const status = res.statusCode ?? 0;
          if (status !== 200) {
            failure(
              `HTTP ${status}`,
              status === 429 || status >= 500,
              retryAfter(res.headers['retry-after']),
            );
            res.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          res.on('data', (chunk: Buffer) => {
            size += chunk.length;
            if (size > MAX_BODY) {
              failure('health response is too large', false);
              res.destroy();
            } else chunks.push(chunk);
          });
          res.on('error', () => failure('health response interrupted'));
          res.on('aborted', () => failure('health response interrupted'));
          res.on('end', () => {
            try {
              if (JSON.parse(Buffer.concat(chunks).toString('utf8')).status !== 'ok')
                return failure('unexpected health response', false);
              finish({ healthy: true, retryable: false, retryAfter: 0, reason: '' });
            } catch {
              failure('unexpected health response', false);
            }
          });
        });
        req.end();
      } catch {
        failure('invalid health request', false);
      }
    });
  }

  function schedule(delay: number, attempt: number) {
    if (stopped || paused) return;
    timer = setTimeout(() => void run(attempt), delay);
    timer.unref();
  }
  async function run(attempt: number) {
    if (stopped || paused || running) return;
    running = true;
    const current = generation;
    pending = probe();
    const result = await pending;
    pending = undefined;
    running = false;
    if (stopped || paused || current !== generation) return;
    if (result.healthy) {
      if (failed) log('connection recovered');
      failed = false;
      schedule(interval, 0);
    } else {
      if (!failed) log(result.reason);
      failed = true;
      // One retry for transient failures. A rate limit waits at least a normal interval.
      const retry = result.retryable && result.reason !== 'HTTP 429' && attempt === 0;
      schedule(Math.max(retry ? retryDelay : interval, result.retryAfter), retry ? 1 : 0);
    }
  }
  function cancel() {
    generation++;
    clearTimeout(timer);
    request?.destroy(new Error('Health ping cancelled'));
    request = undefined;
  }
  schedule(0, 0);
  return {
    pause() {
      paused = true;
      cancel();
    },
    resume() {
      if (stopped || !paused) return;
      paused = false;
      const current = generation;
      void (pending ?? Promise.resolve()).then(() => {
        if (current === generation) schedule(0, 0);
      });
    },
    stop() {
      stopped = true;
      cancel();
    },
  };
}

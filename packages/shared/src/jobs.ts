import type { Logger } from './logging';

/** No overlapping runs; failures retry next tick. Shutdown drains the active run. */
export function startJob(name: string, run: () => Promise<unknown>, logger: Logger, intervalMs = 60_000) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1) throw new Error('Job interval must be a positive integer');
  let active: Promise<unknown> | undefined;
  let stopped = false;
  const tick = () => {
    if (stopped || active) return;
    active = run().then((result) => logger.info({ job: name, result }, 'job completed'))
      .catch((err) => logger.error({ job: name, err }, 'job failed; will retry'))
      .finally(() => { active = undefined; });
  };
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  tick();
  return async () => { stopped = true; clearInterval(timer); await active; };
}

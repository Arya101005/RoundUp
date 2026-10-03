/**
 * Server clock sync (Section 4.4).
 * Keeps the lowest-latency offset sample from the last 5 responses so timers
 * render against the server clock instead of the client clock.
 */
const SAMPLES: number[] = [];
let offsetMs = 0;

export function recordServerNow(serverNow: number): void {
  const sample = serverNow - Date.now();
  SAMPLES.push(sample);
  if (SAMPLES.length > 5) SAMPLES.shift();
  const min = Math.min(...SAMPLES);
  if (Number.isFinite(min)) {
    offsetMs = min;
  }
}

export function serverClockOffset(): number {
  return offsetMs;
}

/** Remaining milliseconds until an ISO timestamp on the server clock. */
export function remainingUntil(endsAtIso: string): number {
  return new Date(endsAtIso).getTime() - (Date.now() + offsetMs);
}

/** For tests. */
export function resetClockSamples(): void {
  SAMPLES.length = 0;
  offsetMs = 0;
}

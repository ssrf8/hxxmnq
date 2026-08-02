export class SettlementAttemptCoordinator {
  private active: Promise<boolean> | null = null;

  run(forceReady: boolean, attempt: (forceReady: boolean) => Promise<boolean>): Promise<boolean> {
    if (this.active) {
      const active = this.active;
      if (!forceReady) return active;
      return active.then((settled) => settled || this.run(true, attempt));
    }
    const task = attempt(forceReady);
    const finalized = task.finally(() => {
      if (this.active === finalized) this.active = null;
    });
    this.active = finalized;
    return finalized;
  }
}

export function reconcileHostGenerationActivity(
  active: boolean,
  transaction: { assistantResponded: boolean },
) {
  return active && !transaction.assistantResponded;
}

export function shouldTrackHostGenerationStart(dryRun: unknown) {
  return dryRun !== true;
}

export class LatestRefreshQueue {
  private requested = false;
  private active: Promise<void> | null = null;

  constructor(
    private readonly run: () => Promise<void>,
    private readonly delayMs = 80,
  ) {}

  request(): Promise<void> {
    this.requested = true;
    if (!this.active) {
      this.active = this.drain();
    }
    return this.active;
  }

  private async drain() {
    try {
      await new Promise<void>((resolve) => globalThis.setTimeout(resolve, this.delayMs));
      while (this.requested) {
        this.requested = false;
        await this.run();
      }
    } finally {
      // Clear ownership before this drain Promise resolves. A request queued by a
      // just-finished render must either be consumed above or start a fresh drain.
      this.active = null;
      if (this.requested) void this.request();
    }
  }
}

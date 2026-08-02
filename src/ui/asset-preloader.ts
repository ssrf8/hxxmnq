export type PreloadAssetKind = 'image' | 'audio';
export type AssetPriorityClass = 'entry-critical' | 'entry-contextual' | 'background-core' | 'scene-on-demand' | 'gal-deferred';
export type AssetEntryGate = 'critical' | 'contextual' | 'none';

export interface PreloadAsset {
  url: string;
  kind: PreloadAssetKind;
  /** Match later Canvas image requests so the browser never caches an opaque variant first. */
  crossOrigin?: 'anonymous';
  logicalId?: string;
  bundle?: string;
  priorityClass?: AssetPriorityClass;
  entryGate?: AssetEntryGate;
  category?: string;
}

export interface AssetPreloadSnapshot {
  total: number;
  loaded: number;
  failed: number;
  settled: number;
  percent: number;
  done: boolean;
  retrying: number;
  maxAttempts: number;
  failedUrls: string[];
  entryTotal: number;
  entrySettled: number;
  entryPercent: number;
  entryReady: boolean;
  entryTimedOut: boolean;
  destroyed: boolean;
}

type AssetLoader = (asset: PreloadAsset, signal: AbortSignal) => Promise<void>;
type SnapshotListener = (snapshot: AssetPreloadSnapshot) => void;
type TaskStatus = 'pending' | 'loading' | 'loaded' | 'failed';
type Task = { asset: PreloadAsset; status: TaskStatus; promoted: boolean };

const ASSET_URL_PATTERN = /\.(?:avif|gif|jpe?g|png|svg|webp|mp3|ogg|wav|m4a|aac)(?:[?#].*)?$/iu;
const AUDIO_URL_PATTERN = /(?:^data:audio\/|\.(?:mp3|ogg|wav|m4a|aac)(?:[?#].*)?$)/iu;
const PRIORITY: Record<AssetPriorityClass, number> = {
  'entry-critical': 0,
  'entry-contextual': 1,
  'background-core': 2,
  'scene-on-demand': 3,
  'gal-deferred': 4,
};

function isAssetUrl(value: string) {
  return value.startsWith('data:image/') || value.startsWith('data:audio/') || value.startsWith('blob:') || ASSET_URL_PATTERN.test(value);
}

function assetKind(url: string): PreloadAssetKind {
  return AUDIO_URL_PATTERN.test(url) ? 'audio' : 'image';
}

export function collectPreloadAssets(...values: unknown[]): PreloadAsset[] {
  const urls = new Set<string>();
  const visited = new Set<object>();
  const visit = (value: unknown) => {
    if (typeof value === 'string') {
      if (isAssetUrl(value)) urls.add(value);
      return;
    }
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    visited.add(value);
    if (Array.isArray(value)) value.forEach(visit);
    else Object.values(value as Record<string, unknown>).forEach(visit);
  };
  values.forEach(visit);
  return [...urls].map((url) => ({ url, kind: assetKind(url) }));
}

async function loadAsset(asset: PreloadAsset, signal: AbortSignal) {
  if (asset.kind === 'audio') {
    const response = await fetch(asset.url, { cache: 'no-cache', signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await response.arrayBuffer();
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const image = new Image();
    const abort = () => { image.src = ''; reject(new DOMException('Aborted', 'AbortError')); };
    image.decoding = 'async';
    // Canvas-bound assets must use the same request mode from their first load.
    // Otherwise a cached opaque response can make a later anonymous-CORS Image fail.
    if (asset.crossOrigin === 'anonymous' && /^https:\/\//iu.test(asset.url)) {
      image.crossOrigin = 'anonymous';
    }
    image.onload = () => { signal.removeEventListener('abort', abort); resolve(); };
    image.onerror = () => { signal.removeEventListener('abort', abort); reject(new Error(`图片载入失败：${asset.url}`)); };
    signal.addEventListener('abort', abort, { once: true });
    image.src = asset.url;
  });
}

const normalizedAsset = (asset: PreloadAsset): PreloadAsset => ({
  ...asset,
  logicalId: asset.logicalId ?? `asset:${asset.url}`,
  bundle: asset.bundle ?? 'legacy:all',
  priorityClass: asset.priorityClass ?? 'background-core',
  entryGate: asset.entryGate ?? 'critical',
  category: asset.category ?? 'legacy',
});

export class AssetPreloader {
  private readonly listeners = new Set<SnapshotListener>();
  private readonly controller = new AbortController();
  private readonly tasks: Task[];
  private readonly completionPromise: Promise<AssetPreloadSnapshot>;
  private resolveCompletion!: (snapshot: AssetPreloadSnapshot) => void;
  private started = false;
  private completionResolved = false;
  private retrying = 0;
  private entryTimedOut = false;
  private destroyedState = false;
  private hidden = false;
  private readonly visibilityHandler = () => { this.hidden = document.visibilityState === 'hidden'; };

  constructor(
    assets: PreloadAsset[],
    private readonly options: {
      concurrency?: number;
      maxAttempts?: number;
      retryDelayMs?: number;
      entryTimeoutMs?: number;
      load?: AssetLoader;
      beforeStart?: () => Promise<void>;
    } = {},
  ) {
    const unique = new Map<string, PreloadAsset>();
    assets.map(normalizedAsset).forEach((asset) => { if (!unique.has(asset.logicalId!)) unique.set(asset.logicalId!, asset); });
    this.tasks = [...unique.values()].map((asset) => ({ asset, status: 'pending', promoted: false }));
    this.completionPromise = new Promise((resolve) => { this.resolveCompletion = resolve; });
    if (typeof document !== 'undefined') {
      this.hidden = document.visibilityState === 'hidden';
      document.addEventListener('visibilitychange', this.visibilityHandler);
    }
  }

  get snapshot(): AssetPreloadSnapshot {
    const settledTasks = this.tasks.filter((task) => task.status === 'loaded' || task.status === 'failed');
    const loaded = this.tasks.filter((task) => task.status === 'loaded').length;
    const failedTasks = this.tasks.filter((task) => task.status === 'failed');
    const entryTasks = this.tasks.filter((task) => task.asset.entryGate !== 'none');
    const entrySettled = entryTasks.filter((task) => task.status === 'loaded' || task.status === 'failed').length;
    return {
      total: this.tasks.length,
      loaded,
      failed: failedTasks.length,
      settled: settledTasks.length,
      percent: this.tasks.length === 0 ? 100 : Math.round((settledTasks.length / this.tasks.length) * 100),
      done: settledTasks.length === this.tasks.length || this.destroyedState,
      retrying: this.retrying,
      maxAttempts: this.options.maxAttempts ?? 3,
      failedUrls: failedTasks.map((task) => task.asset.url),
      entryTotal: entryTasks.length,
      entrySettled,
      entryPercent: entryTasks.length === 0 ? 100 : Math.round((entrySettled / entryTasks.length) * 100),
      entryReady: entrySettled === entryTasks.length,
      entryTimedOut: this.entryTimedOut,
      destroyed: this.destroyedState,
    };
  }

  subscribe(listener: SnapshotListener) {
    this.listeners.add(listener);
    listener(this.snapshot);
    return () => this.listeners.delete(listener);
  }

  start() {
    if (!this.started) {
      this.started = true;
      void this.begin();
    }
    return this.completionPromise;
  }

  waitForCompletion() { return this.start(); }

  setEntryContext(bundles: string[]) {
    const selected = new Set(bundles);
    this.tasks.forEach((task) => {
      if (task.asset.priorityClass === 'entry-contextual') {
        task.asset.entryGate = selected.has(task.asset.bundle!) ? 'contextual' : 'none';
      }
    });
    this.emit();
  }

  async waitForEntryGate(timeoutMs = this.options.entryTimeoutMs ?? 15_000) {
    void this.start();
    if (this.entryTimedOut || this.destroyedState) return this.snapshot;
    const startedAt = Date.now();
    while (!this.snapshot.entryReady && !this.destroyedState) {
      if (Date.now() - startedAt >= timeoutMs) {
        this.entryTimedOut = true;
        this.emit();
        break;
      }
      await this.delay(25);
    }
    return this.snapshot;
  }

  async ensure(logicalIdOrBundle: string) {
    const selected = this.tasks.filter((task) => task.asset.logicalId === logicalIdOrBundle || task.asset.bundle === logicalIdOrBundle);
    selected.forEach((task) => { task.promoted = true; });
    if (!selected.length) throw new Error(`未知素材或场景包：${logicalIdOrBundle}`);
    this.emit();
    void this.start();
    while (!this.destroyedState && selected.some((task) => task.status === 'pending' || task.status === 'loading')) await this.delay(20);
    return this.snapshot;
  }

  destroy() {
    if (this.destroyedState) return;
    this.destroyedState = true;
    this.controller.abort();
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.visibilityHandler);
    this.emit();
    this.finish();
  }

  private resolveConcurrency() {
    if (this.options.concurrency) return Math.max(1, Math.min(this.tasks.length || 1, this.options.concurrency));
    const connection = typeof navigator !== 'undefined'
      ? (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
      : undefined;
    return connection?.saveData || connection?.effectiveType === 'slow-2g' || connection?.effectiveType === '2g' ? 2 : 4;
  }

  private async begin() {
    try {
      await this.options.beforeStart?.();
    } catch {
      this.tasks.filter((task) => task.status === 'pending').forEach((task) => { task.status = 'failed'; });
      this.emit();
      this.finish();
      return;
    }
    const concurrency = this.resolveConcurrency();
    await Promise.all(Array.from({ length: concurrency }, () => this.worker()));
    this.finish();
  }

  private pickTask() {
    const nonGalPending = this.tasks.some((task) => task.asset.priorityClass !== 'gal-deferred' && (task.status === 'pending' || task.status === 'loading'));
    const galLoading = this.tasks.some((task) => task.asset.priorityClass === 'gal-deferred' && task.status === 'loading');
    return this.tasks
      .filter((task) => task.status === 'pending')
      .filter((task) => task.promoted || task.asset.priorityClass !== 'gal-deferred' || !nonGalPending)
      .filter((task) => task.asset.priorityClass !== 'gal-deferred' || !galLoading)
      .filter((task) => task.promoted || !this.hidden || task.asset.entryGate !== 'none')
      .sort((left, right) => Number(right.promoted) - Number(left.promoted)
        || PRIORITY[left.asset.priorityClass!] - PRIORITY[right.asset.priorityClass!])[0];
  }

  private async worker() {
    while (!this.destroyedState) {
      const task = this.pickTask();
      if (!task) {
        if (this.tasks.every((item) => item.status === 'loaded' || item.status === 'failed')) return;
        await this.delay(25);
        continue;
      }
      task.status = 'loading';
      await this.loadWithRetry(task);
    }
  }

  private async loadWithRetry(task: Task) {
    const load = this.options.load ?? loadAsset;
    const maxAttempts = Math.max(1, this.options.maxAttempts ?? 3);
    for (let attempt = 1; attempt <= maxAttempts && !this.destroyedState; attempt += 1) {
      try {
        await load(task.asset, this.controller.signal);
        task.status = 'loaded';
        this.emit();
        return;
      } catch {
        if (this.controller.signal.aborted) return;
        if (attempt < maxAttempts) {
          this.retrying += 1;
          this.emit();
          await this.delay(Math.max(0, this.options.retryDelayMs ?? 250) * attempt);
        }
      }
    }
    if (!this.destroyedState) task.status = 'failed';
    this.emit();
  }

  private delay(ms: number) {
    return new Promise<void>((resolve) => {
      if (ms <= 0 || this.destroyedState) return resolve();
      const timer = setTimeout(() => { this.controller.signal.removeEventListener('abort', abort); resolve(); }, ms);
      const abort = () => { clearTimeout(timer); resolve(); };
      this.controller.signal.addEventListener('abort', abort, { once: true });
    });
  }

  private emit() { const snapshot = this.snapshot; this.listeners.forEach((listener) => listener(snapshot)); }

  private finish() {
    if (this.completionResolved) return;
    if (!this.destroyedState && !this.tasks.every((task) => task.status === 'loaded' || task.status === 'failed')) return;
    this.completionResolved = true;
    this.resolveCompletion(this.snapshot);
  }
}

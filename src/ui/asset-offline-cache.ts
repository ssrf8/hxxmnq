import type { RemoteReleaseManifest } from './asset-remote-resolver';

const CACHE_PREFIX = 'gg-runtime-assets:';

export class RuntimeAssetOfflineCache {
  constructor(private readonly releaseId: string) {}

  get cacheName() { return `${CACHE_PREFIX}${this.releaseId}`; }

  async estimate(requiredBytes: number) {
    const estimate = await navigator.storage?.estimate?.();
    const available = estimate?.quota == null ? null : Math.max(0, estimate.quota - (estimate.usage ?? 0));
    return { requiredBytes: Math.ceil(requiredBytes * 1.25), availableBytes: available, supported: 'caches' in globalThis };
  }

  async install(manifest: RemoteReleaseManifest, baseUrl: string, signal?: AbortSignal) {
    if (!('caches' in globalThis)) return { installed: 0, status: 'unsupported' as const };
    const budget = await this.estimate(manifest.totals.bytes);
    if (budget.availableBytes !== null && budget.availableBytes < budget.requiredBytes) return { installed: 0, status: 'insufficient-quota' as const };
    const cache = await caches.open(this.cacheName);
    let installed = 0;
    try {
      for (const file of manifest.files) {
        if (signal?.aborted) return { installed, status: 'aborted' as const };
        const request = new Request(`${baseUrl}/${file.key}`, { mode: 'cors', credentials: 'omit' });
        const response = await fetch(request, { cache: 'force-cache', signal });
        if (!response.ok) throw new Error(`离线缓存下载失败：${file.logical_id} HTTP ${response.status}`);
        await cache.put(request, response);
        installed += 1;
      }
      return { installed, status: 'installed' as const };
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') return { installed, status: 'quota-exceeded' as const };
      throw error;
    }
  }

  async clearCurrentRelease() {
    return 'caches' in globalThis ? caches.delete(this.cacheName) : false;
  }

  static async listProjectCaches() {
    return 'caches' in globalThis ? (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX)) : [];
  }
}

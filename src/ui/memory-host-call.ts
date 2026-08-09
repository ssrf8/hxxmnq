// B4-T06 安全调用壳 —— 把对宿主数据库 API 的调用包成结构化结果。
// 规则（runbook §10 B4-T06 必须证明）：
// - 故障绝不向调用方（generation coordinator）抛穿：所有异常/拒绝转成 { ok:false }；
// - 支持 promise 有界等待：timeout 后返回回退结果，迟到结果被吸收（不产生 unhandled rejection）；
// - 写失败不修改输入对象（本模块只返回结果，不改参数）；
// - 记录结构化诊断。
// 本模块是纯工具，不含任何数据库符号字符串，两个 profile 均可安全 import。

export type HostCallResult<T> = { ok: true; value: T } | { ok: false; error: { code: string; detail: string; thrown?: unknown } };

export interface HostCallOptions {
  /** promise 结果的有界等待毫秒数；同步返回值不受 timeout 影响。 */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 2500;

/**
 * 安全调用：fn 同步返回或返回 promise 均支持。
 * - 同步抛出 → { ok:false }
 * - promise reject → { ok:false }
 * - promise 超时未决 → { ok:false, code:'timeout' }（迟到结果被吸收）
 * 永不抛出。
 */
export async function safeHostCall<T>(
  fn: () => T | Promise<T>,
  options: HostCallOptions = {},
): Promise<HostCallResult<T>> {
  const timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs as number) > 0
    ? Math.floor(options.timeoutMs as number)
    : DEFAULT_TIMEOUT_MS;
  try {
    const maybePromise = fn();
    if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
      const result = await withTimeout<T>(maybePromise as Promise<T>, timeoutMs);
      return { ok: true, value: result };
    }
    return { ok: true, value: maybePromise as T };
  } catch (thrown) {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    const code = message.includes('timeout') ? 'timeout' : 'host-call-failed';
    return { ok: false, error: { code, detail: message, thrown } };
  }
}

/** 有界等待：超时返回 fallback 并吞掉迟到结果。 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`host-call timeout after ${timeoutMs}ms`)), timeoutMs);
  });
  // 迟到 promise 拒绝必须被吸收，避免 unhandled rejection
  promise.catch(() => undefined);
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/** 把同步/异步统一成 promise 的轻量辅助（供测试断言调用计数用）。 */
export async function toResult<T>(fn: () => T | Promise<T>): Promise<{ value: T } | { error: unknown }> {
  try {
    return { value: await fn() };
  } catch (error) {
    return { error };
  }
}

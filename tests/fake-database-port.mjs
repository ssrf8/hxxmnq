// B4-T06 fake database port —— 测试专用（非生产代码，不进入 src/ui 装配链）。
// 可配置故障：API 缺失、getter 抛错、方法缺失、同步返回、promise resolve/reject、
// 延迟结果、insert/update true/false/reject、多行重复、错 scope/角色/schema、超量行；
// 并录制调用计数、参数与并发峰值。
import assert from 'node:assert/strict';

export class FakeDatabaseApi {
  constructor() {
    this.mode = 'present'; // 'absent' | 'present' | 'getter-throws'
    this.methods = {
      queryTableRows: 'present', // 'present' | 'missing' | 'throws-sync'
      insertRow: 'present',
      updateRow: 'present',
      exportTableAsJson: 'present',
      registerTableUpdateCallback: 'present',
      unregisterTableUpdateCallback: 'present',
    };
    this.queryBehavior = {
      type: 'sync-return', // 'sync-return' | 'resolve' | 'reject' | 'delay-resolve' | 'delay-reject'
      delayMs: 0,
      rows: [],
    };
    this.insertResult = { value: 1 }; // { value } | { promise: 'resolve'|'reject', delayMs }
    this.updateResult = { value: true };
    this.calls = {
      queryTableRows: [],
      insertRow: [],
      updateRow: [],
      exportTableAsJson: [],
      registerTableUpdateCallback: [],
      unregisterTableUpdateCallback: [],
    };
    this.peakConcurrent = 0;
    this._active = 0;
    this.getterTouchCount = 0;
    this.exportedTables = {};
  }

  _trackStart() {
    this._active += 1;
    if (this._active > this.peakConcurrent) this.peakConcurrent = this._active;
  }

  _trackEnd() {
    this._active -= 1;
    if (this._active < 0) this._active = 0;
  }

  /** 构造与已核验宿主一致的 top-level AutoCardUpdaterAPI。 */
  buildGlobal() {
    if (this.mode === 'absent') return undefined;
    if (this.mode === 'getter-throws') {
      return Object.defineProperty({}, 'AutoCardUpdaterAPI', {
        configurable: true,
        get: () => {
          this.getterTouchCount += 1;
          throw new Error('fake: poisoned getter touched');
        },
      });
    }
    const api = {
      queryTableRows: (...args) => this._call('queryTableRows', args),
      insertRow: (...args) => this._call('insertRow', args),
      updateRow: (...args) => this._call('updateRow', args),
      exportTableAsJson: (...args) => this._call('exportTableAsJson', args),
      registerTableUpdateCallback: (...args) => this._call('registerTableUpdateCallback', args),
      unregisterTableUpdateCallback: (...args) => this._call('unregisterTableUpdateCallback', args),
    };
    return { AutoCardUpdaterAPI: api };
  }

  _call(name, args) {
    this.calls[name].push(args);
    const methodState = this.methods[name];
    if (methodState === 'missing') throw new Error(`fake: ${name} is missing`);
    if (methodState === 'throws-sync') throw new Error(`fake: ${name} throws synchronously`);
    this._trackStart();
    try {
      let result;
      if (name === 'queryTableRows') result = this._query(args);
      else if (name === 'insertRow') result = this._insert(args);
      else if (name === 'updateRow') result = this._update(args);
      else if (name === 'exportTableAsJson') result = structuredClone(this.exportedTables);
      else result = undefined;
      if (result && typeof result.then === 'function') {
        return Promise.resolve(result).finally(() => this._trackEnd());
      }
      this._trackEnd();
      return result;
    } catch (error) {
      this._trackEnd();
      throw error;
    }
  }

  _query() {
    const b = this.queryBehavior;
    const produce = () => b.result === null ? null : ({
      rows: structuredClone(b.rows),
      columns: [],
      values: [],
      sql: 'SELECT * FROM fake LIMIT ? OFFSET ?',
      limit: b.rows.length,
      offset: 0,
    });
    switch (b.type) {
      case 'sync-return':
        return produce();
      case 'resolve':
        return Promise.resolve(produce());
      case 'reject':
        return Promise.reject(new Error('fake: query rejected'));
      case 'delay-resolve':
        return new Promise((resolve) => setTimeout(() => resolve(produce()), b.delayMs));
      case 'delay-reject':
        return new Promise((_, reject) => setTimeout(() => reject(new Error('fake: delayed query rejected')), b.delayMs));
      default:
        return produce();
    }
  }

  _insert() {
    const r = this.insertResult;
    if (!r.promise && typeof r.value === 'number') return r.value;
    if (r.promise === 'resolve') return new Promise((resolve) => setTimeout(() => resolve(r.value ?? 1), r.delayMs ?? 0));
    if (r.promise === 'reject') return new Promise((_, reject) => setTimeout(() => reject(new Error('fake: insert rejected')), r.delayMs ?? 0));
    return -1;
  }

  _update() {
    const r = this.updateResult;
    if (!r.promise && typeof r.value === 'boolean') return r.value;
    if (r.promise === 'resolve') return new Promise((resolve) => setTimeout(() => resolve(r.value ?? true), r.delayMs ?? 0));
    if (r.promise === 'reject') return new Promise((_, reject) => setTimeout(() => reject(new Error('fake: update rejected')), r.delayMs ?? 0));
    return false;
  }
}

export function assertNoUnhandledRejections() {
  const original = process.on;
  const unhandled = [];
  const handler = (reason) => unhandled.push(reason);
  process.on('unhandledRejection', handler);
  const restore = () => process.off('unhandledRejection', handler);
  return { unhandled, restore };
}

export async function assertEventually(fn, timeoutMs = 500) {
  const start = Date.now();
  for (;;) {
    if (fn()) return true;
    if (Date.now() - start > timeoutMs) throw new Error('assertEventually timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
}

export { assert };

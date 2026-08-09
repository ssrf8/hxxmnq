// B4-T01 唯一 selection import —— 业务代码（app/bridge）只 import 本模块与 memory-port。
// esbuild resolve plugin（scripts/build-ui.mjs）把 `@card/memory-adapter` 解析为
// standalone-mvu.ts 或 database-assisted.ts；tsc 通过 tsconfig paths 解析到 standalone
// 作为静态类型目标，两个 adapter 文件本身都处于 tsconfig include 范围内，均被类型检查。
import { createMemoryAdapter } from '@card/memory-adapter';
import type { MemoryArchiveRecallPort } from './memory-port';

export const memoryPort: MemoryArchiveRecallPort = createMemoryAdapter();

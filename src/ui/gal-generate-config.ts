// 第三批 B3-T02 —— 统一 generate-config builder（send 与 regenerate 共用）。
//
// 合同：project/gal-character-memory-batch-3-regeneration-runbook.md §6.1–6.3
//   - 普通 send 与 regenerate 使用同一份 V2 冻结请求与同一套 generate 配置构造规则；
//   - regenerate 只推进 attempt（generation_id 变化），不改变 request 冻结字段；
//   - builder 是纯函数：不读取 activeMessages/MVU/global，不写楼层，不调用 generate；
//   - V2 仍要求恰好一条非空 system synthetic history；
//   - with_depth_entries:false，user_input === request.modelUserInput；
//   - tool-call/空结果规则由执行层处理，不塞进 builder。
// 禁止：本模块读宿主、写聊天、等待事件、调用 generate、操作 DOM。

import {
  computeContextFingerprint,
  REQUEST_SCHEMA_V2,
  type GalGenerationRequestV2,
  type SyntheticHistoryMessage,
} from './gal-generation-request';
import {
  GAL_PROMPT_REVISION,
  isValidGalPromptInjection,
  LEGACY_GAL_PROMPT_REVISION,
  type GalPromptInjection,
} from './gal-prompt-injection';

export const GAL_GENERATE_CONFIG_SCHEMA_V1 = 'gal-generate-config.v1' as const;

/** 统一 V2 generate config 产物（send 与 regenerate 共用；generation_id 由 attempt 提供）。 */
export interface BuiltGalGenerateConfig {
  schema: typeof GAL_GENERATE_CONFIG_SCHEMA_V1;
  config: {
    generation_id: string;
    user_input: string;
    should_stream: false;
    should_silence: true;
    overrides: {
      chat_history: {
        prompts: SyntheticHistoryMessage[];
        with_depth_entries: false;
      };
    };
    injects?: GalPromptInjection[];
  };
  /** 稳定 fingerprint（覆盖除 generation_id 外的全部 config 字段；同输入必同值）。 */
  configFingerprint: string;
}

export type BuildGalGenerateConfigResult =
  | { ok: true; built: BuiltGalGenerateConfig }
  | { ok: false; code: 'not-v2' | 'invalid-history' | 'invalid-injection' | 'unknown-prompt-revision' };

/** attempt 视角：builder 只消费 generationId，不读 attempt 其它字段（request 冻结字段不改）。 */
export interface GalGenerateAttemptRef {
  generationId: string;
}

function isNonEmptySystemOnly(history: unknown): history is SyntheticHistoryMessage[] {
  return Array.isArray(history) && history.length === 1
    && history[0]?.role === 'system'
    && typeof history[0]?.content === 'string'
    && history[0].content.trim().length > 0;
}

/** 稳定序列化：key 排序 + JSON，供 fingerprint 使用（不记录完整私密正文之外的结构）。 */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * 从冻结 V2 请求 + attempt 构造 generate config（纯函数）。
 * - request 不被修改（逐字节保留冻结字段）；
 * - generation_id 取 attempt.generationId；
 * - 历史 = request.syntheticHistory（恰好一条非空 system），旧 assistant 文本永不进入 prompts；
 * - fingerprint 覆盖除 generation_id 外的全部 config（send/regenerate 深相等时 fingerprint 相同）。
 */
export function buildGalGenerateConfig(
  request: GalGenerationRequestV2,
  attempt: GalGenerateAttemptRef,
): BuildGalGenerateConfigResult {
  if (request.schema !== REQUEST_SCHEMA_V2) return { ok: false, code: 'not-v2' };
  if (!isNonEmptySystemOnly(request.syntheticHistory)) return { ok: false, code: 'invalid-history' };
  if (request.promptRevision !== LEGACY_GAL_PROMPT_REVISION && request.promptRevision !== GAL_PROMPT_REVISION) {
    return { ok: false, code: 'unknown-prompt-revision' };
  }
  if (request.promptRevision === GAL_PROMPT_REVISION
    && (!Array.isArray(request.promptInjects)
      || request.promptInjects.length !== 1
      || !isValidGalPromptInjection(request.promptInjects[0])
      || request.promptInjectsHash !== computeContextFingerprint(request.promptInjects[0].content))) {
    return { ok: false, code: 'invalid-injection' };
  }
  if (request.promptRevision === LEGACY_GAL_PROMPT_REVISION
    && (request.promptInjects !== undefined || request.promptInjectsHash !== undefined)) {
    return { ok: false, code: 'invalid-injection' };
  }

  const config: BuiltGalGenerateConfig['config'] = {
    generation_id: attempt.generationId,
    user_input: request.modelUserInput,
    should_stream: false,
    should_silence: true,
    ...(request.promptRevision === GAL_PROMPT_REVISION ? {
      injects: request.promptInjects!.map((item) => ({ ...item })),
    } : {}),
    overrides: {
      chat_history: {
        prompts: request.syntheticHistory.map((item) => ({ role: 'system' as const, content: item.content })),
        with_depth_entries: false,
      },
    },
  };

  const { generation_id: _excluded, ...fingerprintInput } = config;
  const configFingerprint = computeContextFingerprint(stableStringify(fingerprintInput));

  return {
    ok: true,
    built: {
      schema: GAL_GENERATE_CONFIG_SCHEMA_V1,
      config,
      configFingerprint,
    },
  };
}

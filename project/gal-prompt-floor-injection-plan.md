# GAL 提示词楼层注入专项计划

> 状态：历史 v3 实施记录（当时 710/710；未做实机 prompt 观察）；当前 v5 合同与 719/719 静态证据见 `project/gal-real-user-message-dual-format-plan.md`
> 日期：2026-08-09
> 执行者：主 Agent 直接实施
> 目标运行时：SillyTavern 1.18.0 + Tavern Helper / JS-Slash-Runner 4.8.18
> 性质：只改 GAL 生成请求中的模型可见上下文布局；不与存档、数据库、R2、打包或发布混做。

> 2026-08-10 所有者新裁定与实施：`gal-prompt.v5` 已在维护源码完成静态施工，改为先把玩家原文、正文协议、在场快照、场景事实和道具授权写入真实 user 楼层，再逐字复用并在生成前复读校验；常驻世界书恢复完整格式定义与正确示范，原生发送只依赖世界书格式强调。synthetic history 与真实旧楼层隔离保持不变。完整合同与 719/719 静态证据见 `project/gal-real-user-message-dual-format-plan.md`。本文件其余部分保留 v2/v3/v4 迁移历史；v5 尚未实机验收、打包或发布。

> 2026-08-09 后续修订：新请求已升级为 `gal-prompt.v3`。正文协议、在场快照、场景事实与本轮道具授权改为 `position:'in_chat' / depth:0 / role:'system' / should_scan:false`，在最终提示中位于玩家输入之后；角色、道具和开场的不透明路由键进入第二条 `position:'none' / should_scan:true` 扫描胶囊，不出现在最终模型提示中。旧 `gal-prompt.v1` 无注入和 `gal-prompt.v2` 单条 depth 1 注入继续按冻结 metadata 原样恢复。下文保留 v2 的原始实施基线，涉及“唯一 depth 1 注入”的段落均由本修订覆盖。

## 1. 本次裁定

本专项把当前拼接在 `modelUserInput` 后面的庭园规则和动态状态全部移出玩家输入，改成受控的请求期楼层注入。

目标请求结构固定为：

```text
[宿主预设 / 角色卡 / 常驻世界书]

[chat_history：合成召回，system，较旧]
  只来自每角色 MVU 记忆：48 条剧情梗概 + 12 条关系记忆的既有裁剪结果
  不读取、不复制、不发送 SillyTavern 真实旧聊天楼层

[injects：本轮庭园规则与当前状态，system，in_chat depth:1]
  庭园正文协议
  当前在场快照
  当前场景事实
  本轮道具授权
  角色绿灯
  道具绿灯

  输出只要求庭园正文中的 narration/dialogue；不要求第二份 GAL 表现 JSON

[user_input：玩家本轮原文，user，最后]
```

这里的“最新楼层”是**请求发给模型时临时出现的 in-chat system 注入层**，不是向真实聊天记录永久创建一条 system 消息。聊天界面与聊天文件中只保留正常的玩家楼层和 assistant 楼层。

“不发送原版上下文”专指：不让 SillyTavern 的真实聊天历史进入 `chat_history`。角色卡、当前预设和常驻世界书仍按宿主正常生成流程工作；本专项不把它们一起清空。

## 2. 为什么采用这一结构

当前实现已经用 `overrides.chat_history.prompts` 覆盖真实历史，且 `with_depth_entries:false`，因此“旧楼层不发送”的地基已经存在。现在剩下的问题是：

- `withGardenNarrativeContract()` 把玩家原文、正文协议、场景事实、道具授权和绿灯拼成一个大字符串；
- 这个大字符串作为 `generate.user_input` 发送，导致模型眼里玩家仿佛亲口说了全部系统规则；
- `modelUserInput` 又持久化进玩家楼层 metadata，规则正文与玩家原文的职责混在一起；
- 后续调整规则时，很难分别判断“玩家说了什么”和“系统临时注入了什么”。

改造后：

- 玩家原文只承担玩家表达；
- synthetic history 只承担跨楼层召回；
- 单条 prompt injection 只承担本轮规则和动态事实；
- 三者分别冻结、分别指纹化，但由同一请求构造器一次生成；
- send、retry、regenerate 继续复用同一冻结请求，不在重生成时偷读新状态。

## 3. 已核验的运行时依据

### 3.1 `generate()` 公共接口

目标 Helper 4.8.18 的声明：

```text
F:/agent airp/SillyTavern/public/scripts/extensions/third-party/
JS-Slash-Runner/@types/function/generate.d.ts
```

确认支持：

- `user_input?: string`
- `injects?: Omit<InjectionPrompt, 'id'>[]`
- `overrides.chat_history.prompts?: RolePrompt[]`
- `overrides.chat_history.with_depth_entries?: boolean`

`InjectionPrompt` 的目标字段来自：

```text
F:/agent airp/SillyTavern/public/scripts/extensions/third-party/
JS-Slash-Runner/src/function/inject.ts
```

字段为：

```ts
{
  position: 'in_chat';
  depth: number;
  role: 'system' | 'assistant' | 'user';
  content: string;
  should_scan?: boolean;
}
```

本项目只使用公开参数名 `injects`。Helper 内部转换后的私有字段 `inject` 不得出现在项目代码中。

### 3.2 历史覆盖语义

Helper 4.8.18 的 `dataProcessor.ts` 已确认：提供自建 `overrides.chat_history` 后，生成器直接消费自建 prompts，不再从宿主 `chat` 数组构造真实历史。

本专项继续保持：

```ts
overrides: {
  chat_history: {
    prompts: request.syntheticHistory,
    with_depth_entries: false,
  },
}
```

禁止改成 `true`。否则宿主世界书深度条目可能再次插入自建历史，破坏“模型历史完全由项目控制”的边界。

### 3.3 注入位置

沿用 `docs/03-正文识别与变量更新.md` 与 Helper 4.8.18 的实现语义：

```ts
{
  position: 'in_chat',
  depth: 1,
  role: 'system',
  content: currentTurnInjection,
  should_scan: false,
}
```

它位于玩家 `user_input` 之前、合成召回之后。`should_scan:false` 防止本轮控制文本反过来触发世界书扫描。

本专项只生成**一条**注入，不把正文协议、场景事实和绿灯拆成多个同深度条目，避免同深度条目的宿主排序差异。

## 4. 数据合同

### 4.1 玩家输入

新请求中：

```text
request.visibleUserText = 玩家可见原文
request.modelUserInput   = 清理内部绿灯标记后的玩家原文
generate.user_input      = request.modelUserInput
```

`modelUserInput` 中不得再出现以下项目生成的控制段：

- `【庭园正文协议】`
- `【庭园在场快照】`
- `【场景事实】`
- `【本轮道具授权】`
- 角色绿灯正文
- 道具绿灯正文

玩家输入中伪造这些标题，也不能阻止真实注入生成。旧实现通过扫描玩家文本判断 `hasContract/hasPresence/hasSceneFacts` 的去重方式必须删除；系统注入是否存在只能由请求构造器决定，不能由玩家正文决定。

### 4.2 合成召回

继续复用 `src/ui/synthetic-history.ts`，输出仍是恰好一条：

```ts
{ role: 'system', content: syntheticHistoryContent }
```

它只进入 `overrides.chat_history.prompts`，不进入 `injects`，也不拼入 `user_input`。

保持现有记忆语义：

- 过去入场只作历史背景，禁止续接旧地点、姿势、动作进行态和未完台词；
- 当前 visit 可用于维持本次入场连续性；
- 关系记忆继续与剧情梗概共同投影；
- 无可用记忆时仍发送固定 `HISTORY_BOUNDARY_MESSAGE`；
- 仍不读取真实楼层正文。

### 4.3 本轮注入

新增一个纯函数构造器，建议文件：

```text
src/ui/gal-prompt-injection.ts
```

建议公共合同：

```ts
export const GAL_PROMPT_REVISION = 'gal-prompt.v2' as const;

export interface GalPromptInjection {
  position: 'in_chat';
  depth: 1;
  role: 'system';
  content: string;
  should_scan: false;
}

export function sanitizeGalPlayerInput(text: string): string;

export function buildGalCurrentTurnInjection(input: {
  state: GardenState;
  explicitCharacterIds?: readonly string[];
}): GalPromptInjection;
```

`content` 的顺序固定为：

1. `gardenNarrativeContract`
2. `presenceNarrativeContext(state)`
3. `buildPromptContext(state, { kind: 'ordinary' })`
4. `sceneItemAuthorizationContext(state)`
5. `characterGreenlightContext(state, explicitCharacterIds)`
6. `itemGreenlightContext(state)`

空段落过滤后用两个换行连接。构造器必须是纯函数，不读宿主、不写 MVU、不写楼层、不调用 `generate()`。

### 4.4 冻结请求与兼容

不为这次改造创建一套平行发送器。继续使用 `GalGenerationRequestV2`，但按 `promptRevision` 区分旧请求和新请求。

新请求增加冻结字段：

```ts
promptRevision: 'gal-prompt.v2';
promptInjects: GalPromptInjection[]; // 新请求必须恰好一条
promptInjectsHash: string;
```

兼容规则：

- 旧聊天中的 `gal-prompt.v1` V2 请求没有 `promptInjects`：恢复和旧重生成继续走旧版 `modelUserInput` 内嵌协议路径；
- 新请求 `gal-prompt.v2`：`modelUserInput` 只能是清理后的玩家原文，必须带恰好一条合法注入；
- 不允许把旧请求在恢复时悄悄升级成 v2；
- 不允许新请求缺少注入时退回“重新拼进 user_input”；应在创建玩家楼层前失败闭合；
- metadata 中保存冻结注入是为了 retry/regenerate/reload 后仍逐字节复用同一次请求；它不是聊天正文，不直接展示给玩家。

`contextFingerprint` 与 generate config fingerprint 必须纳入：

- `promptRevision`
- `promptInjectsHash`
- synthetic history hash
- 清理后的玩家输入 hash
- 既有角色、visit 与状态基线身份

不得只 hash 玩家原文而漏掉注入。

## 5. 实施步骤

### P01：冻结现状测试

先补现状测试，证明改造前：

- `modelUserInput` 当前确实包含庭园协议和场景事实；
- `syntheticHistory` 是唯一 chat history；
- send 与 regenerate 共用 `buildGalGenerateConfig()`；
- `with_depth_entries` 当前为 `false`。

这些测试用于明确迁移差异，不作为最终行为保留。

### P02：抽离玩家输入清理与注入内容构造

修改：

- `src/ui/target-actions.ts`
- 新增 `src/ui/gal-prompt-injection.ts`

要求：

- 将 `withGardenNarrativeContract(message, ...)` 拆成“清理玩家输入”和“构造 system 注入”两个职责；
- `presenceNarrativeContext`、`sceneItemAuthorizationContext` 可移动或导出，但必须只有一个生产实现；
- 不复制两份 `gardenNarrativeContract`；
- 玩家伪造标题不会跳过系统真实注入；
- 玩家输入为空白时仍按既有规则拒绝请求。

完成后，旧函数可暂时作为兼容适配器保留给 `gal-prompt.v1` 恢复，但新请求不得调用它拼接 `user_input`。

### P03：扩展冻结请求

修改：

- `src/ui/gal-generation-request.ts`
- 对应 request builder/parser/metadata/recovery 测试

要求：

- 新请求生成 `gal-prompt.v2`；
- `buildGalGenerationRequestV2()` 一次性产生清理后的 `modelUserInput` 和冻结注入；
- `promptInjects` 深拷贝进入 request 与 metadata；
- parser 按 revision 做条件校验；
- 新请求只接受一条 system、`in_chat`、depth 1、`should_scan:false` 的非空注入；
- 旧 v1 metadata 仍可恢复；
- 未知 prompt revision 明确拒绝，不猜测。

### P04：统一 generate config

修改：

- `src/ui/gal-generate-config.ts`
- `tests/gal-generate-config-builder.test.mjs`

新请求 config 应为：

```ts
{
  generation_id,
  user_input: request.modelUserInput,
  should_stream: false,
  should_silence: true,
  injects: request.promptInjects,
  overrides: {
    chat_history: {
      prompts: request.syntheticHistory,
      with_depth_entries: false,
    },
  },
}
```

旧 `gal-prompt.v1` 请求仍生成不带 `injects` 的旧 config，以保证历史重生成可解释。

config fingerprint 排除 `generation_id`，但必须包含 `injects`。同一冻结请求的 send/retry/regenerate fingerprint 必须一致。

### P05：接入三个生产请求入口

修改 `src/ui/bridge.ts` 中当前三个 `contractInjector` 调用点：

- 普通 GAL 发送；
- 异变解决发送；
- 决斗胜利对话发送。

所有入口必须改为同一个 V2 请求构造器生成 injection，禁止调用点各自拼字符串。

检查所有失败边界：

- 注入构造失败时，不创建玩家楼层；
- `generate()` 抛错时，不创建 assistant 楼层；
- stop/retry 不重建注入；
- reload recovery 不读取当前新 MVU 重建旧请求；
- regenerate 复用原冻结 `promptInjects` 与 `syntheticHistory`，只更换 attempt/generation ID；
- 指定 swipe 替换、旧结算回滚和 MVU 重算逻辑保持不变。

### P06：删除新路径中的旧拼接

全局检查并保证新请求路径不存在：

```text
contractInjector: (t) => withGardenNarrativeContract(...)
modelUserInput = 玩家原文 + 庭园协议
user_input 中出现【庭园正文协议】
user_input 中出现【场景事实】
```

不得为了让测试通过而删掉协议内容；协议必须完整迁移到 `promptInjects[0].content`。

### P07：静态与纯逻辑验收

至少覆盖以下断言：

1. 玩家原文只在 `user_input` 出现一次。
2. `user_input` 不含任何庭园控制段。
3. chat history 恰好只含 synthetic history，不含真实 user/assistant 楼层。
4. injects 恰好一条，角色为 system，位置 `in_chat`，深度 1，`should_scan:false`。
5. 注入包含原有六类协议/状态块，内容不丢失。
6. synthetic history 不进入 injects，也不进入 user_input。
7. 玩家伪造 `【庭园正文协议】` 不会关闭系统注入。
8. `with_depth_entries:false` 保持不变。
9. send 与 regenerate 除 generation ID 外 config 深相等。
10. retry/reload 后复用冻结注入，不读取新状态重建。
11. 旧 `gal-prompt.v1` metadata 可恢复并按旧语义重生成。
12. 新请求缺注入、双注入、错误 role/depth/position 或空 content 时失败闭合。
13. config fingerprint 对注入内容变化敏感，对 generation ID 变化不敏感。
14. 当前已有 synthetic history 的 48/12 预算、角色隔离和 visit 边界测试继续通过。
15. 存档读档、MVU 结算、指定 swipe 与诊断导出测试不得回退。
16. 注入协议不得要求第二份 GAL 表现 JSON；`dialogue` 属性是新回复唯一的立绘提示来源。

最终运行：

```powershell
npm run check:ui
npm test
git diff --check
```

本专项不要求探针，不要求时机演示，不运行 R2 上传，不打包卡片。若静态实现后需要正式晋升，再另行决定是否做真实宿主 prompt 观察；不得把静态测试冒充运行时消息顺序证据。

## 6. 禁区

- 不把 inject 内容创建成真实聊天 system 楼层。
- 不恢复发送 SillyTavern 原生旧聊天历史。
- 不把 `with_depth_entries` 改成 `true`。
- 不使用 `generateRaw()` 重建整套预设。
- 不动态改写世界书；本轮不实现临时世界书生命周期。
- 不修改角色卡常驻世界书、预设或 CoT 的内容与开关。
- 不改变 synthetic history 的 48 条剧情梗概、12 条关系记忆及现有预算。
- 不改变数据库 profile；两个 profile 仍获得相同的卡内 synthetic history。
- 不改变存档 schema、存档世界书、MVU 写回或读档重建楼层。
- 不改变 assistant 落楼、MVU parse/settlement、stop、retry、regenerate 或 swipe 的事务语义。
- 不把完整 prompt、玩家正文或召回正文新增进诊断导出。
- 不打包、不上传 R2、不改正式/测试通道清单。
- 不修改或提交 `reasonix`。

## 7. 完成定义

只有同时满足以下条件，专项才可静态封账：

- 新生成请求的玩家输入是单纯玩家原文，不再携带庭园规则；
- 本轮规则与动态状态只存在于一条冻结的 depth 1 system inject；
- 角色召回只存在于更早的 synthetic chat history；
- 真实旧聊天楼层仍完全不进入模型请求；
- send、retry、regenerate 使用同一冻结请求与同一 config builder；
- 旧请求仍能按旧 revision 恢复，不被悄悄换成新 prompt；
- 全部测试与类型检查通过；
- 没有存档、数据库、世界书、R2、打包或发布方面的越界改动。

最终模型可见次序应稳定表达为：

```text
合成召回（较旧）
  → 本轮庭园规则与当前状态（depth 1 system inject）
    → 玩家本轮原文（最后一条 user_input）
      → 模型生成 assistant 回复
```

这就是本专项的唯一主线。以后若要把某些常驻规则迁入临时世界书，应另开优化，不在本次施工中顺手扩张。

## 8. 实施封账（2026-08-09）

- 新增 `src/ui/gal-prompt-injection.ts`，统一清理玩家输入并构造唯一的 depth 1 `system/in_chat` 注入。
- 新建 V2 请求使用 `gal-prompt.v2`，冻结 `promptInjects` 与 `promptInjectsHash`；旧 `gal-prompt.v1` metadata 继续按无 inject 语义恢复。
- `buildGalGenerateConfig()` 按 revision 生成配置：v2 带一条 `injects`，v1 不带；两者都只把 synthetic history 放进 `overrides.chat_history.prompts`，并保持 `with_depth_entries:false`。
- 普通发送、异变收束和决斗胜利三个入口统一复用 V2 builder；动作消息和结束消息不再预拼庭园协议。
- metadata restore、重生成 target 与 generate config 均校验注入的数量、role、position、depth、`should_scan`、非空内容和 hash；损坏后失败闭合。
- 脱敏诊断只允许显示受控 revision 名，不导出注入正文、玩家正文或召回正文。
- 静态验收：`npm run check:ui` PASS；`npm test` 702/702 PASS；`git diff --check` PASS。
- 按本专项约定未运行探针、实机时机演示、打包、R2 上传或发布；真实宿主最终提示次序仍属于后续可选观察项。

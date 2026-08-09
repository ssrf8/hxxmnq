# R2 UI 测试通道打包与发布规划

> 状态：**规划稿，尚未实施**
> 适用范围：幻想乡物语 UI 的构建、测试版上传、一次性测试入口、回滚与正式版晋升
> 参考文档：`project/r2-packaging-runbook.md`、`project/live-asset-publish.md`、`project/r2-deployment-readiness.md`
> 核心原则：**正式 UI 与测试 UI 完全分目录、分指针、分版本名；图片等公共资产继续共享。**

---

## 0. 给执行 agent 的一句话任务

在不改动现有正式版 R2 对象、正式版 UI manifest、正式版卡名的前提下，为 UI 新增一个独立的 `test` 发布通道；测试通道复用正式版当前的图片等共享资产，但拥有独立的 UI 构建产物、R2 目录、UI manifest、版本号与回滚链。测试入口只需初始化一次，后续前端更新只打包并上传 UI，不重新打包卡片。

如果任何步骤需要覆盖、删除、重命名正式版对象，说明实现走偏了，立刻停止。别想着“顺手整理”，这种顺手通常很贵。

---

## 1. 目标与非目标

### 1.1 本期目标

1. 新增独立的 UI 测试发布通道。
2. 测试 UI 不占用正式版的对象名、版本号、manifest 或卡名。
3. R2 中正式版与测试版 UI 放在不同目录。
4. 本地测试 UI 构建产物使用独立目录和显眼名称。
5. 正式版与测试版共同读取现有图片、音频等公共资产，不复制第二份。
6. 测试版可以独立更新和回滚，不触碰正式版。
7. 测试通过后，使用正式流程重新构建并发布；禁止让正式指针直接引用测试目录。
8. 测试入口固定读取测试 UI manifest；日常测试 UI 更新不得要求重新打包卡片。

### 1.2 本期非目标

1. 不迁移现有公共资产目录。
2. 不把 `gensokyo-moving-garden/live/` 整体改名为 `shared/`。
3. 不为测试版建立第二套图片仓库。
4. 不改造提示词注入、楼层注入或生成事务逻辑。
5. 不执行真实 R2 上传；本文只规划命令、脚本改造与验收标准。
6. 不删除历史正式版或测试版不可变对象。
7. 不把每次 UI 更新绑定到角色卡版本或角色卡重新打包。

---

## 2. 现状基线

当前公共域名：

```text
https://ssrfrrt.ccwu.cc
```

当前 R2 bucket：

```text
hxxwy
```

当前正式 UI 发布链：

```text
正式 UI 不可变文件：gensokyo-moving-garden/live/ui/ui-mount-r<N>.js
正式 UI 可变指针：  gensokyo-moving-garden/live/ui/ui-manifest.json
```

当前公共资产发布链：

```text
公共资产清单：gensokyo-moving-garden/live/manifest.json
公共资产文件：gensokyo-moving-garden/live/<source>
```

这里存在两个不同的 manifest，执行时必须叫全名：

| 名称 | 路径 | 用途 | 测试版是否共用 |
|---|---|---|---|
| 公共资产 manifest | `gensokyo-moving-garden/live/manifest.json` | 图片、音频等资源映射 | **共用，只读** |
| 正式 UI manifest | `gensokyo-moving-garden/live/ui/ui-manifest.json` | 正式 UI 当前版本指针 | **绝不共用** |

---

## 3. 冻结后的目录与命名

### 3.1 R2 目录

现有正式目录不动，只新增测试 UI 目录：

```text
gensokyo-moving-garden/
├─ live/
│  ├─ manifest.json                         # 公共资产 manifest，正式/测试共同读取
│  ├─ <source>                              # 公共图片、音频等，正式/测试共同读取
│  └─ ui/                                   # 正式 UI 专用目录
│     ├─ ui-manifest.json                   # 正式 UI 指针
│     └─ ui-mount-r<N>.js                   # 正式 UI 不可变文件
└─ test/
   └─ ui/                                   # 测试 UI 专用目录
      ├─ ui-manifest.json                   # 测试 UI 指针
      └─ ui-mount-test-r<N>.js              # 测试 UI 不可变文件
```

冻结规则：

- 正式 UI 前缀固定为 `gensokyo-moving-garden/live/ui/`。
- 测试 UI 前缀固定为 `gensokyo-moving-garden/test/ui/`。
- 公共资产继续使用 `gensokyo-moving-garden/live/manifest.json`，本期不迁移。
- 不允许通过命令行传任意 R2 前缀；脚本只能从固定通道表中选择。
- 不创建 `test/assets/`，否则“共用图片”会悄悄变成两套资源。

### 3.2 版本号

| 通道 | 版本格式 | 示例 |
|---|---|---|
| 正式版 | `r<N>` | `r96` |
| 测试版 | `test-r<N>` | `test-r1`、`test-r2` |

规则：

1. 正式序号与测试序号各自独立递增；`test-r8` 不占用正式版 `r8`，因为名称和目录都不同。
2. 每次测试 UI 内容变化只把测试序号加一，例如 `test-r8` → `test-r9`。
3. 测试版不得使用纯 `r<N>`，正式版不得使用 `test-` 前缀。
4. 相同测试版本名只允许对应完全相同的字节；内容不同必须生成下一个测试序号。
5. SHA-256 仍写入 manifest 用于完整性校验，但不拼进版本名。
6. 不使用 `latest.js`、`test.js`、`ui-mount.js` 作为远端对象名。

### 3.3 固定测试入口和本地目录

如果当前角色卡内嵌的是正式 loader，则首次建立测试环境时需要生成一个固定的测试入口。它只用于选择测试 manifest，不跟随每个 UI 版本重新打包：

```text
卡片显示名：幻想乡物语 [UI测试版]
固定读取：  https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/test/ui/ui-manifest.json
初始化目录：dist/checkpoint-ui-test-entry/
运行时目录：dist/runtime/test/
```

首次初始化后，`test-r1`、`test-r2`、`test-r3` 等更新都只构建并发布 UI。只有测试 loader 本身、卡内嵌入位置或其他卡内配置发生变化时，才重新打包测试入口。正式版继续使用现有名称和目录；初始化测试入口不得覆盖正式 JSON/PNG。

---

## 4. 通道契约

| 项目 | `production` 正式通道 | `test` 测试通道 |
|---|---|---|
| UI R2 前缀 | `.../live/ui/` | `.../test/ui/` |
| UI manifest | `.../live/ui/ui-manifest.json` | `.../test/ui/ui-manifest.json` |
| UI 版本 | `r<N>` | `test-r<N>` |
| UI 本地输出 | 维持现有正式输出 | `dist/runtime/test/` |
| UI 入口 | 正式 loader，固定读正式 manifest | 测试 loader，固定读测试 manifest；只初始化一次 |
| 公共资产 manifest | `.../live/manifest.json` | 同左，只读共用 |
| 允许改正式指针 | 仅正式发布流程 | 禁止 |
| 允许改测试指针 | 禁止 | 仅测试发布流程 |

### 4.1 UI manifest 最低字段

测试 UI manifest 至少包含：

```json
{
  "schema_version": "gensokyo-ui-live.v1",
  "channel": "test",
  "version": "test-r9",
  "sha256": "<64 位十六进制>",
  "bytes": 123456,
  "published_at": "<ISO 8601 UTC>"
}
```

兼容策略：

- 保留现有 `schema_version`，不强迫旧正式 manifest 迁移。
- 新 loader 将缺失 `channel` 的旧 manifest 解释为 `production`。
- 测试 loader 必须要求 `channel === "test"`；缺少字段时也要拒绝。
- loader 根据自身编译时通道计算允许的 manifest URL 和 UI 对象路径，不能信任 manifest 提供任意远程 URL。

---

## 5. 需要实施的脚本改造

以下是目标能力，**当前脚本并未全部支持，不能把示例命令直接当成现成命令执行**。

### 5.1 `scripts/build-ui.mjs`

新增参数：

```text
--ui-channel=production|test
```

行为要求：

1. 远程 UI 构建时必须显式传入 `--ui-channel`。
2. `production` 只接受 `r<N>`。
3. `test` 只接受 `test-r<N>`。
4. 测试构建输出到 `dist/runtime/test/`。
5. 测试 loader 中注入：
   - 测试 UI manifest URL；
   - 期望通道 `test`；
   - 公共资产 origin 与公共资产 manifest 仍保持现值。
6. 测试构建完成后打印并写入构建报告：通道、版本、UI manifest URL、公共资产 manifest URL、输出文件、字节数、SHA-256。
7. 同名版本文件存在且字节不同则失败；相同则允许幂等复用。

### 5.2 `src/runtime/ui-loader.js`

新增编译时占位符，例如：

```text
__UI_CHANNEL__
```

loader 必须校验：

1. manifest origin 与预期公共域名相同。
2. manifest path 与当前通道固定路径完全相符。
3. manifest 通道与 loader 的编译通道一致。
4. 版本格式与通道一致。
5. 派生出的 UI mount 路径仍位于当前通道目录。
6. UI 字节数与 SHA-256 匹配后才执行。
7. 正式 loader 不接受 `/test/ui/`，测试 loader 不接受 `/live/ui/`。

### 5.3 `scripts/publish-ui.mjs`

新增且强制要求：

```text
--channel=production|test
```

内部使用固定映射，不接收任意 `--prefix`：

```js
const CHANNELS = {
  production: {
    prefix: 'gensokyo-moving-garden/live/ui',
    versionPattern: /^r[1-9]\d*$/,
  },
  test: {
    prefix: 'gensokyo-moving-garden/test/ui',
    versionPattern: /^test-r[1-9]\d*$/,
  },
};
```

发布顺序沿用现有安全语义：

1. 解析参数并校验通道、版本、本地文件。
2. 生成发布计划，打印 bucket、对象 key、manifest key、字节数与 SHA-256。
3. `--dry-run` 到此结束，不进行远端写入。
4. 上传不可变 UI 文件，使用 `If-None-Match: *`。
5. 从公共域名读回，校验状态码、MIME、缓存头、字节数与 SHA-256。
6. 使用 ETag 条件写更新当前通道的 `ui-manifest.json`。
7. 再次读回 manifest，确认通道、版本、字节数与哈希。

额外停止线：

- `channel=test` 时，计划中任意写入 key 以 `gensokyo-moving-garden/live/ui/` 开头，立即失败。
- `channel=production` 时，计划中任意写入 key 以 `gensokyo-moving-garden/test/ui/` 开头，立即失败。
- 远端同名不可变对象已存在但哈希不同，立即失败，不覆盖。
- manifest 在读取后被其他发布更新，条件写失败；不得无条件重试覆盖。

### 5.4 一次性测试入口初始化

如果现有正式卡只嵌入正式 loader，则改造 `scripts/package-checkpoint.mjs` 或新增专用薄适配器，支持一次性生成测试入口：

```text
--release-kind=test
--ui-channel=test
--runtime-root=dist/runtime/test
```

测试入口初始化必须：

1. 读取测试 loader，而不是正式 loader。
2. 卡片显示名固定为 `幻想乡物语 [UI测试版]`，不加入具体 UI 版本。
3. 输出到固定、独立的 `checkpoint-ui-test-entry/` 目录。
4. 不更新正式 release 清单、正式卡版本或正式文件名。
5. 构建报告记录其 UI manifest 为 `/test/ui/ui-manifest.json`。
6. 在写文件前提供 dry-run；dry-run 列出所有计划输出路径。
7. 完成初始化后，普通测试 UI 发布流程不再调用本步骤。

### 5.5 NPM 命令

实施后建议提供显式命令，减少手敲参数：

```json
{
  "scripts": {
    "build:ui:test": "node scripts/build-ui.mjs --asset-mode=remote-r2-live --asset-base-url=https://ssrfrrt.ccwu.cc --ui-delivery=remote --ui-channel=test",
    "publish:ui:test:dry": "node scripts/publish-ui.mjs --channel=test --dry-run"
  }
}
```

UI 版本号和文件路径仍由调用者显式提供，不藏在脚本默认值里。测试入口不接收 UI 版本号，因为它始终读取测试 manifest。

---

## 6. 目标操作流程

下面命令是脚本改造完成后的目标接口。实施前先运行 `--help` 或查看参数解析，确认接口已存在。

### Phase A：只读预检

1. 确认工作区和目标版本。
2. 确认测试版本未使用正式格式。
3. 运行现有静态检查与测试。

```powershell
npm run check:ui
npm test
```

通过标准：

- 测试全绿。
- 版本格式为 `test-r<N>`。
- 没有修改正式发布文件的计划。

### Phase B：构建测试 UI

示例：

```powershell
node scripts/build-ui.mjs `
  --asset-mode=remote-r2-live `
  --asset-base-url=https://ssrfrrt.ccwu.cc `
  --ui-delivery=remote `
  --ui-channel=test `
  --ui-version=test-r9
```

期望输出：

```text
dist/runtime/test/ui-mount.js
dist/runtime/test/ui-mount-test-r9.js
dist/runtime/test/ui-loader.js
dist/runtime/test/ui-build-report.json
```

检查构建报告：

```text
ui_channel            = test
ui_manifest_url       = https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/test/ui/ui-manifest.json
asset_manifest_url    = https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json
```

上面两个 URL 一个必须是 `test/ui`，另一个必须是 `live/manifest.json`。都变成 `test` 或都变成 `live`，同样算错。

### Phase C：生成发布计划（禁止写入）

```powershell
node scripts/publish-ui.mjs `
  --channel=test `
  --version=test-r9 `
  --file=dist/runtime/test/ui-mount-test-r9.js `
  --dry-run
```

dry-run 必须明确显示：

```text
bucket       = hxxwy
ui key       = gensokyo-moving-garden/test/ui/ui-mount-test-r9.js
manifest key = gensokyo-moving-garden/test/ui/ui-manifest.json
```

只要输出中出现以下任意写目标，立即停止：

```text
gensokyo-moving-garden/live/ui/
release/
正式版 UI manifest
```

### Phase D：真实上传（需单独明确授权）

只有操作者明确说“把这个测试版本上传到 R2”后，才允许去掉 `--dry-run`。

```powershell
node scripts/publish-ui.mjs `
  --channel=test `
  --version=test-r9 `
  --file=dist/runtime/test/ui-mount-test-r9.js
```

发布凭据只从本地环境或未提交的 `.env` 读取。日志不得打印 access key、secret key 或带签名请求。

### Phase E：读回验收

真实上传后必须读回：

```text
https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/test/ui/ui-manifest.json
https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/test/ui/ui-mount-test-r9.js
```

验收内容：

1. manifest 的 `channel` 为 `test`。
2. version、bytes、sha256 与本地报告一致。
3. UI mount MIME 为 JavaScript 可接受类型。
4. UI mount 使用不可变长缓存；manifest 使用禁止缓存或强制再验证语义。
5. 正式 UI manifest 在发布前后字节完全一致。

第 5 条需要在上传前后分别保存正式 UI manifest 的哈希。不是看看网页“好像没变”，而是比哈希。

### Phase F：初始化或复用固定测试入口

首次建立测试环境时，初始化一个只嵌入测试 loader 的固定测试入口。已经存在且 loader 合同未变化时，直接复用，**不要随 UI 版本重新打包**。

打包后静态检查：

1. 卡名固定包含 `[UI测试版]`，不包含 `test-r<N>`。
2. 卡内 loader 只引用测试 UI manifest。
3. 卡内公共资产配置仍引用共享的 `live/manifest.json`。
4. 卡内不包含正式 UI mount 的旧副本。
5. 输出目录不在正式 release 目录。

日常发布 `test-r<N>` 时，Phase F 应显示为“复用既有测试入口”，不产生新的卡文件。

真实 SillyTavern 运行验收属于发布后的独立 gate；不能用静态检查冒充实机 PASS，也不能因为暂未做实机验收就改写成“已通过”。

---

## 7. 共享图片的边界

正式版和测试版共同读取：

```text
https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/manifest.json
```

这样做的结果：

- 已发布图片只保存一份。
- 正式和测试 UI 对同一路径得到同一份图片字节。
- UI 测试版不会因为目录隔离而复制全部素材。

同时必须接受一个限制：

> **测试版不能在不影响正式版的情况下试用“覆盖同路径的新图片”。**

因为图片是共用的，只要覆盖公共资产路径，正式版也会看到变化。若未来需要测试新图片而不影响正式版，应另立“资产候选通道”规划，例如内容寻址对象或 `candidate-assets/`；那是新的范围，不能偷偷塞进本次 UI 测试通道。

本期若 UI 需要新增图片：

1. 优先使用全新的公共资产路径，不覆盖旧路径。
2. 先按 `project/live-asset-publish.md` 完成资产发布与读回。
3. 明确评估该新增资产进入共享清单是否会影响正式版。
4. 未获授权时，UI 测试通道只使用已经存在的公共资产。

---

## 8. 测试版回滚

回滚只操作：

```text
gensokyo-moving-garden/test/ui/ui-manifest.json
```

流程：

1. 读取当前测试 manifest 和 ETag。
2. 确认目标旧测试 UI 对象仍存在且公开可读。
3. 校验旧对象字节数与 SHA-256。
4. 用 ETag 条件写把测试 manifest 指回旧测试版本。
5. 读回并校验。
6. 验证正式 UI manifest 哈希未变化。

禁止：

- 删除有问题的测试对象来“回滚”。
- 覆盖旧测试对象内容。
- 修改正式 manifest 完成测试回滚。
- 让测试 manifest 指向正式目录。

---

## 9. 从测试版晋升为正式版

晋升不是把测试文件改名，也不是让正式 manifest 指向 `/test/ui/`。

正确流程：

1. 记录已验收测试版的源码 commit、构建参数和 SHA-256。
2. 工作区必须与该验收源码一致；不一致则重新测试。
3. 使用正式通道和正式版本号重新构建：`production + r<N>`。
4. 对正式发布先生成 dry-run 计划。
5. 单独取得“发布正式版”的明确授权。
6. 上传新的正式不可变对象。
7. 校验公开读回后，条件更新正式 UI manifest。
8. 打包正式卡并走正式发布验收。

必须保持：

```text
正式 manifest -> /live/ui/ui-mount-r<N>.js
测试 manifest -> /test/ui/ui-mount-test-r<N>.js
```

即使两个文件内容哈希相同，也要保持对象和指针分通道。多占一点 UI 脚本空间，比混掉正式版便宜得多。

---

## 10. 测试要求

至少补充以下自动化测试：

### 10.1 构建测试

- 测试通道拒绝 `r96`。
- 正式通道拒绝 `test-r9`。
- 测试 loader 注入测试 manifest URL。
- 测试构建仍注入共享资产 manifest URL。
- 测试输出只进入 `dist/runtime/test/`。
- 同名异内容构建失败。

### 10.2 loader 合同测试

- 测试 loader 拒绝 `channel=production`。
- 测试 loader 拒绝缺失 `channel` 的 manifest。
- 正式 loader 为兼容旧 manifest，可把缺失 channel 视为 production。
- 两类 loader 都拒绝跨目录 UI 路径。
- 字节数或 SHA-256 不一致时不执行脚本。

### 10.3 发布计划测试

- `--channel=test --dry-run` 只生成 `/test/ui/` 写目标。
- `--channel=production --dry-run` 只生成 `/live/ui/` 写目标。
- 未提供 channel 时失败。
- 任意自定义前缀参数失败。
- 测试版本与正式版本格式交叉使用时失败。
- dry-run 不发出写请求。
- 远端同名异哈希时失败。
- manifest 条件写冲突时失败且不自动覆盖。

### 10.4 固定测试入口测试

- 测试入口名称与正式卡名不同，且不包含具体 UI 版本。
- 测试入口输出目录与正式输出目录不同。
- 测试入口只含测试 loader。
- 初始化测试入口不修改 `project/manifest.json` 的正式发布状态。
- 从 `test-r8` 更新到 `test-r9` 时，只生成 UI 与 R2 发布计划，不生成新卡文件。

---

## 11. 总验收清单

### A. 静态结构

- [ ] 正式 R2 UI 目录仍为 `live/ui/`。
- [ ] 测试 R2 UI 目录为 `test/ui/`。
- [ ] 两个通道拥有独立 `ui-manifest.json`。
- [ ] 测试版对象名包含 `test-r<N>`，不占用正式 `r<N>` 对象名。
- [ ] 固定测试入口与正式卡名、输出目录不同。
- [ ] 公共资产没有被复制到测试目录。

### B. 安全发布

- [ ] 所有真实发布前都生成 dry-run 计划。
- [ ] 测试发布计划不存在正式前缀写目标。
- [ ] 不可变对象使用创建条件，不允许覆盖。
- [ ] manifest 使用 ETag 条件更新。
- [ ] 上传后从公共域名读回校验。
- [ ] 日志不包含凭据。

### C. 隔离证明

- [ ] 测试发布前后，正式 UI manifest 哈希相同。
- [ ] 固定测试入口的 loader 只引用测试 UI manifest。
- [ ] 普通测试 UI 更新没有重新打包测试入口。
- [ ] 正式卡 loader 不引用测试目录。
- [ ] 测试回滚只改变测试 manifest。
- [ ] 正式晋升重新走正式构建和正式授权。

### D. 共享资产

- [ ] 两个通道使用同一公共资产 manifest。
- [ ] UI 测试没有覆盖现有公共图片路径。
- [ ] 如新增公共资产，已单独完成影响评估和发布验收。

---

## 12. 硬停止线

遇到以下任一情况，执行 agent 必须停止并报告，不得自行猜测：

1. 测试发布计划准备写入 `gensokyo-moving-garden/live/ui/`。
2. 初始化测试入口准备覆盖正式卡文件或进入正式 release 目录。
3. 测试 UI 版本号没有 `test-` 前缀，或重复使用已有版本号发布不同内容。
4. 需要覆盖已经存在且哈希不同的不可变对象。
5. 需要覆盖公共图片路径才能继续 UI 测试。
6. 无法读取或校验上传后的公开对象。
7. 正式 UI manifest 在测试发布期间发生变化。
8. manifest ETag 条件写冲突。
9. 脚本实际参数与本文目标接口不一致。
10. 操作者只授权测试上传，但流程即将更新正式版。

---

## 13. 实施顺序与交付物

建议分四次小改动实施，别揉成一个看不清的“大聪明提交”：

### Patch 1：通道建模与构建隔离

- 修改 `scripts/build-ui.mjs`。
- 修改 `src/runtime/ui-loader.js`。
- 增加构建与 loader 合同测试。
- 交付 `dist/runtime/test/` 的离线构建证据。

### Patch 2：R2 测试发布适配器

- 修改 `scripts/publish-ui.mjs`。
- 增加通道固定映射、dry-run 和停止线测试。
- 只提交 dry-run 输出，不执行真实上传。

### Patch 3：固定测试入口初始化

- 改造检查点脚本或增加测试入口薄适配器。
- 增加固定入口名称、输出目录、loader 来源检查。
- 初始化一次测试入口，并证明后续 UI 更新不再打包卡片。

### Patch 4：经授权的首次测试上传

- 记录授权的测试版本。
- 执行测试 UI 上传。
- 保存公开读回、哈希、缓存头、manifest 前后值。
- 证明正式 UI manifest 未变。

每个 Patch 都应更新实施日志，记录：改动、命令、结果、遗留项、是否发生远端写入。没有证据的 PASS 只是一种比较自信的愿望。

---

## 14. 最终裁定

本方案采用：

```text
UI：正式版和测试版分目录、分 manifest、分版本、分卡名
资产：正式版和测试版共用现有公共资产目录与 manifest
晋升：从相同源码重新走正式构建与正式发布，不跨目录借用测试对象
```

它满足“不占正式版名字、不与正式版混放、图片两版共用、正式和测试文件夹分开”的要求，同时保留现有正式发布路径，避免为了目录看起来漂亮而迁移一整条已经在用的资源链。

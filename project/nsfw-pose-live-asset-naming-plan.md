# 体位图片固定命名与 R2 免重打包更新规划

> 决策日期：2026-08-03  
> 状态：命名合同已确定；客户端 sexual resolver、动态 live manifest 消费与发布工具适配仍待实现  
> 适用范围：GAL `visual_mode="sexual"` 图片；不改变 `normal`、`nude`、战斗 cut-in 或 MVU 变量  
> 内容边界：只登记已确认可公开分发、角色明确成年且情境自愿的素材  
> 原图决策：sexual CG 只发布所有者提供的原始 PNG 字节；不转 WebP、不压缩、不缩放、不改 Alpha、不量化、不重编码

> 未来主 Agent／子 Agent 的逐步执行、台账状态、碰撞检查、staging、上传与回滚以
> `project/nsfw-cg-agent-execution-runbook.md` 为准。

## 1. 目标

首个公开轻量包必须一次性内置完整的稳定姿势语义、行为白名单、固定 R2 路径规则和动态 manifest
解析能力。此后在既有语义范围内补图、替换图片或增加同池候选时，只更新唯一 R2 桶的
`live/**` 对象与 `live/manifest.json`，不重新构建或打包角色卡。

灵梦当前图片不完整不阻止发布：首发 manifest 只登记已经人工确认并实际上传的候选；缺失池按既定
fallback 显示 `nude`／`normal`。以后补齐时使用本文件预留的相同路径并最后更新 manifest，已发布的
轻量卡即可在下次 manifest 重验证后发现新图。

这里的“免重打包”只覆盖本文件已经冻结的 `character_id × pose_id × act_id` 语义和 `01–99`
候选序号。新增角色 ID、修改字段结构、增加全新姿势语义、改变 fallback 或改变选择算法仍属于客户端
合同变更，必须重新构建、测试和打包。

## 2. 唯一命名合同

### 2.1 五层名称

| 层 | 固定格式 | 灵梦示例 |
|---|---|---|
| 所有者原始文件 | `CG/<中文角色>/<可读语义>.png`；保留原名，由台账映射 | `CG/灵梦/后入.png` |
| 机器上传计划 | `CG/<中文角色>/r2-upload-plan.json` | `CG/灵梦/r2-upload-plan.json` |
| live manifest `source`／R2 相对 key | `characters/<character_id>/gal/sexual/<pose_id>/<act_id>/<nn>.png` | `characters/reimu/gal/sexual/rear/vaginal/01.png` |
| 可推导候选 ID（不单独存 manifest） | `gal_<character_id>_sexual_<pose_id>_<act_id>_<nn>` | `gal_reimu_sexual_rear_vaginal_01` |
| 逻辑池 ID | `gal.<character_id>.sexual.<pose_id>.<act_id>` | `gal.reimu.sexual.rear.vaginal` |

真实公开 URL 固定为：

```text
https://ssrfrrt.ccwu.cc/gensokyo-moving-garden/live/characters/<character_id>/gal/sexual/<pose_id>/<act_id>/<nn>.png
```

`<nn>` 使用 `01–99` 两位十进制编号。同一池第一张图始终为 `01`；后续不同构图候选依次使用
`02`、`03`，不得插队重排。替换同一候选时覆盖原 key，不创建 `final`、`new`、`fix`、日期或版本后缀。

### 2.2 字符规则

- 全部运行名称使用小写 ASCII；只允许 `a-z`、`0-9`、下划线、短横线、句点和路径斜杠。
- 语义 ID 内使用下划线，例如 `rear_standing`；目录层级之间使用 `/`。
- 所有者原始文件可以保留中文可读名；每个角色以 `CG/<中文角色>/上传台账.md` 记录其固定 R2 映射、
  哈希与上传状态，同目录 `r2-upload-plan.json` 是经审核映射的机器可读镜像。运行 source 与 R2 key 不得包含中文、空格、作者名、模型名、生成流水号、提示词、
  尺寸、日期、哈希或 `nsfw` 泛称。
- `visual_mode` 固定写作 `sexual`；不得另造 `h`、`r18`、`adult`、`explicit` 等同义目录。
- `act_id="none"` 必须显式进入路径、可推导候选 ID 和池 ID，不能省略。
- 所有者原图、delta staging 与 live 运行对象都是同一份原始 PNG 字节，MIME 固定为 `image/png`。
- 禁止生成 WebP、JPEG、AVIF 或任何派生运行副本；禁止压缩优化、去元数据、调色、裁切、缩放、改 Alpha、
  量化或重编码。维护源 SHA-256 必须与 R2 对象 SHA-256 完全一致。

## 3. 冻结的姿势与行为目录

以下目录在首个公开包发布前全部进入客户端白名单。是否有图片由 live manifest 决定；白名单存在不等于
素材已经发布，也不授予模型或玩家任何行为事实。

| `pose_id` | 中文说明 | 允许的 `act_id` | 第一候选文件名模板 |
|---|---|---|---|
| `missionary` | 传教士式 | `vaginal`、`anal` | `<character>-sexual-missionary-<act>-01.png` |
| `rear` | 后入／跪趴 | `vaginal`、`anal` | `<character>-sexual-rear-<act>-01.png` |
| `prone` | 俯卧式 | `vaginal`、`anal` | `<character>-sexual-prone-<act>-01.png` |
| `rear_standing` | 站立后入；普通站立、把尿式、独轮车式均为同池候选 | `vaginal`、`anal` | `<character>-sexual-rear_standing-<act>-01.png` |
| `cowgirl` | 女上位 | `vaginal`、`anal` | `<character>-sexual-cowgirl-<act>-01.png` |
| `reverse_cowgirl` | 反向女上位 | `vaginal`、`anal` | `<character>-sexual-reverse_cowgirl-<act>-01.png` |
| `side` | 侧卧 | `vaginal`、`anal` | `<character>-sexual-side-<act>-01.png` |
| `front_standing` | 站立正面 | `vaginal`、`anal` | `<character>-sexual-front_standing-<act>-01.png` |
| `seated` | 坐姿 | `vaginal`、`anal` | `<character>-sexual-seated-<act>-01.png` |
| `lotus` | 莲花式 | `vaginal`、`anal` | `<character>-sexual-lotus-<act>-01.png` |
| `leg_raise_split` | 一字马／高抬腿 | `vaginal`、`anal` | `<character>-sexual-leg_raise_split-<act>-01.png` |
| `sixty_nine` | 69 | `none` | `<character>-sexual-sixty_nine-none-01.png` |
| `breast` | 乳交 | `none` | `<character>-sexual-breast-none-01.png` |
| `oral` | 口交 | `none` | `<character>-sexual-oral-none-01.png` |
| `manual` | 手交 | `none` | `<character>-sexual-manual-none-01.png` |
| `foot_single` | 单脚足交 | `none` | `<character>-sexual-foot_single-none-01.png` |
| `foot_double` | 双脚足交 | `none` | `<character>-sexual-foot_double-none-01.png` |

插入类共 22 个逻辑池，非插入类共 6 个逻辑池，每个角色共预留 28 个池。每池允许 `01–99` 候选。
`rear_standing` 的细分构图首版不新增 `variant_id`；它们只占用同池的不同候选编号。

## 4. 灵梦首发与后续补图

### 4.1 预留的 28 个灵梦首候选 key

以下 key 现在全部冻结，缺图时保持未登记，不上传空文件或伪造占位图：

```text
characters/reimu/gal/sexual/missionary/vaginal/01.png
characters/reimu/gal/sexual/missionary/anal/01.png
characters/reimu/gal/sexual/rear/vaginal/01.png
characters/reimu/gal/sexual/rear/anal/01.png
characters/reimu/gal/sexual/prone/vaginal/01.png
characters/reimu/gal/sexual/prone/anal/01.png
characters/reimu/gal/sexual/rear_standing/vaginal/01.png
characters/reimu/gal/sexual/rear_standing/anal/01.png
characters/reimu/gal/sexual/cowgirl/vaginal/01.png
characters/reimu/gal/sexual/cowgirl/anal/01.png
characters/reimu/gal/sexual/reverse_cowgirl/vaginal/01.png
characters/reimu/gal/sexual/reverse_cowgirl/anal/01.png
characters/reimu/gal/sexual/side/vaginal/01.png
characters/reimu/gal/sexual/side/anal/01.png
characters/reimu/gal/sexual/front_standing/vaginal/01.png
characters/reimu/gal/sexual/front_standing/anal/01.png
characters/reimu/gal/sexual/seated/vaginal/01.png
characters/reimu/gal/sexual/seated/anal/01.png
characters/reimu/gal/sexual/lotus/vaginal/01.png
characters/reimu/gal/sexual/lotus/anal/01.png
characters/reimu/gal/sexual/leg_raise_split/vaginal/01.png
characters/reimu/gal/sexual/leg_raise_split/anal/01.png
characters/reimu/gal/sexual/sixty_nine/none/01.png
characters/reimu/gal/sexual/breast/none/01.png
characters/reimu/gal/sexual/oral/none/01.png
characters/reimu/gal/sexual/manual/none/01.png
characters/reimu/gal/sexual/foot_single/none/01.png
characters/reimu/gal/sexual/foot_double/none/01.png
```

当前 `CG/灵梦/` 的原始流水号文件不由程序猜测语义，也不得通过文件顺序自动对应上述 key。所有者或
人工审核者只需提供 `原文件名 → pose_id → act_id` 对照；之后入库工具按本合同生成维护名、运行 key、
候选 ID 和 manifest 项。没有对照的图片保持原位，不进入发布清单。

### 4.2 缺图发布规则

- 首发只把实际存在、人工确认、原始 PNG 可解码且通过原字节哈希校验的候选加入 `live/manifest.json`。
- 缺失池不创建 manifest 项，不上传零字节文件、透明占位图、重复图或错误行为的替代图。
- 请求缺失的 `sexual` 池时，先尝试同角色、同 `pose_id + act_id` 的其他候选；池为空则回退当前反应的
  `nude`，再回退 `normal`。
- `anal` 不得回退到 `vaginal`，`vaginal` 也不得回退到 `anal`。
- 新图补齐后可以新增 `01`，或在已有池增加 `02–99`；只要语义仍属于本文件目录，就不需要重新打包。

## 5. 首个公开包必须一次完成的客户端合同

只有以下项目全部实现并通过后，才能承诺后续 R2-only 更新：

1. `GalPortraitCue`、注册表和 resolver 同时使用 `character_id + visual_mode + pose_id + act_id`；不能继续
   使用当前仅含 `pose_id` 的 sexual pool key。
2. 八名已登记角色共享本文件冻结的 17 个 `pose_id` 与对应 `act_id` 白名单；角色是否实际可选由经过
   验证的 live manifest 候选决定，不能根据 R2 目录枚举，也不能接受模型输出的路径。
3. resolver 从已校验 manifest 动态组成每个逻辑池的 `01–99` 候选，按 source 稳定抽取具体候选；新增候选
   不要求前端代码里增加一条硬编码路径。
4. `normal`／`nude` 继续固定 `pose_id="default"`、`act_id="none"`；非法组合直接降级，不能猜测。
5. adult-content 本地开关关闭时不请求 sexual 对象；开关只是显示控制，不是 R2 访问控制。
6. live manifest 项必须包含 `logical_id`、`source`、`pool_id`、`bytes`、`mime`、`sha256`、`weight`；客户端
   拒绝未知角色、未知池、错误 MIME、越界序号、重复 source／logical ID 或不匹配固定路径的项目。
7. 稳定抽取种子至少包含 `manifest generation + chatId + assistantMessageId + swipeId + characterId +
   poseId + actId`；同一消息与 Swipe 重绘不跳图，新 generation 可以重新选择。
8. manifest 或图片失败不能阻断正文、消息事务、Swipe、结算或返回庭园。

未完成这些条件时，把图片上传到固定名称只会得到“R2 上有文件，但已发布客户端不会选它”的假完成；
不得把这种状态报告为免重打包链路已成立。

## 6. 后续只更新 R2 的标准流程

1. 人工确认角色、`pose_id`、`act_id`、候选序号、来源许可、成年与自愿边界；不由程序查看或猜测图片语义。
2. 按 §2 生成维护名与目标 key；检查该 key 是否已存在。新增候选使用下一个空闲序号；替换必须明确记录
   旧哈希并保留可回滚副本。
3. 不做任何图片转换。验证原始 PNG 的签名、`image/png` MIME、可解码性、字节数和 SHA-256；准备上传的
   文件必须与维护源逐字节一致。
4. 先上传所有新增或替换的 `live/characters/...` 媒体，逐项 GET／HEAD 与本地字节、MIME、哈希核对。
5. 生成单调递增 `generation` 的完整 `live/manifest.json`；确认旧客户端能够忽略新增候选且 fallback 不变。
6. 最后覆盖 `live/manifest.json`。manifest 是唯一发布完成标记，不能先传 manifest 再慢慢补图。
7. 从生产域名重新读取 manifest 与代表性新图，验证 CORS、缓存头、哈希和 resolver 命中；已有会话可能需要
   刷新或重新进入 GAL 才会取新 generation，不能承诺当前已经加载的画面无刷新热替换。

回滚时按相反原则处理：先恢复上一次已校验的同名媒体，逐项验证，再最后恢复对应 manifest 内容并使用
新的单调 generation；不得删除对象后等待 404 自愈。

## 7. 禁止事项与变更门槛

- 禁止查看文件名后用序号、目录顺序、提示词或脚本自动猜测体位和行为。
- 禁止把同一张图同时登记进互相冲突的 `vaginal` 与 `anal` 池来凑数。
- 禁止因当前灵梦缺图而删减或改名预留语义；缺图应由 manifest 缺项和 fallback 表达。
- 禁止发布未列入完整 manifest 的孤儿对象，并禁止客户端扫描 R2 目录发现图片。
- 禁止在公开发布后重定义既有 `pose_id`、`act_id`、编号或路径含义。
- 禁止对 sexual CG 运行现有 WebP 压缩器或任何图片优化器；发布清单必须把它们排除在压缩任务之外。
- 新增第 18 个姿势语义、第三种插入行为、超过 `99` 个候选或新的角色 ID，必须先做合同版本升级与客户端
  兼容评审；不能假装仍是 R2-only 素材更新。

## 8. 验收清单

- [ ] 17 个 `pose_id`、28 个池／角色及路径正则写入客户端合同测试。
- [ ] sexual resolver 使用 `act_id`，且 `anal`／`vaginal` 不交叉回退。
- [ ] live manifest 可新增原本为空的 `01`，无需改变角色卡字节。
- [ ] 每个 sexual CG 的维护源、staging 文件与 R2 GET 响应 SHA-256 三方完全一致，MIME 为 `image/png`。
- [ ] 同池新增 `02` 后客户端能从 manifest 发现并稳定抽取。
- [ ] 缺图、404、错误 MIME、错误哈希、错误池 ID 和离线状态均安全回退。
- [ ] manifest 最后上传与 generation 换代测试通过。
- [ ] 内容开关关闭时不请求 sexual 对象。
- [ ] 真实 SillyTavern 中验证新聊天、旧聊天、Swipe、刷新、慢网、断网和窄屏。
- [ ] 记录首个具备 R2-only sexual 更新能力的角色卡版本；早于该版本的包不作免重打包承诺。

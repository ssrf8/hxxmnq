# 弹幕音效候选源 V1

- 所有者提供目录：`音效/web-sfx/`
- 入库日期：2026-07-31
- 原始声明：这些音效均已通过 AI 重新生成，无版权风险，可用于本项目。
- 原始格式：WAV、单声道、22050Hz；共 26 个文件、660,862 bytes。
- 运行范围：允许在本项目开发预览、自包含角色卡与后续固定版本素材托管中使用。

本目录保存所有者提供的原始字节，不参与运行时加载。实际运行文件位于
`src/assets/audio/runtime/battle/`，首版为从本目录逐字节选取并稳定重命名的 14 个事件音效；
未做重采样、裁切、归一化或重新编码。

## 首版映射

| 事件 | 原始文件 |
|---|---|
| `player_shot` | `玩家_射击_plst00.wav` |
| `boss_hit` | `敌人_Boss受伤_damage00.wav` |
| `mob_defeat` | `敌人_普通击破_enep00.wav` |
| `graze` | `玩家_擦弹_graze.wav` |
| `item_pickup` | `道具_拾取_item00.wav` |
| `player_miss` | `玩家_中弹死亡_pldead00.wav` |
| `bomb` | `符卡_灵梦B魔理沙A发动_power1.wav` |
| `wave_start` | `特效_闪光魔法粒子1_kira00.wav` |
| `spell_declare` | `符卡_通用发动_cat00.wav` |
| `phase_break` | `特效_闪光魔法粒子3_kira02.wav` |
| `laser_warning` | `战斗_强力能量效果_power0.wav` |
| `laser_fire` | `激光_Boss激光2_lazer01.wav` |
| `battle_win` | `道具_获得残机1UP_extend.wav` |
| `battle_lose` | `菜单_返回取消_cancel00.wav` |

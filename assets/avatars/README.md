# 角色素材目录

- `volcano/`：火山哥六阶段与熔岩路障，独立于旧角色整理脚本；背景处理状态见该目录 README。
- `master/`：1024px 透明背景 PNG 母版。
- `icons/`：供游戏使用的 256px 透明背景 PNG。主黄色统一到 `#F9D23A` 附近，透明边界长边统一为画布约 84%。
- `cutins/samples/`：用户提供的 17 张大招原稿及补生成的美团袋鼠原稿，保留原文件名与格式。
- `cutins/runtime/`：供游戏使用的 17 张 1536×512、不透明 WebP 大招横幅，沿用以下角色编号。

运行图由 `scripts/process-avatars.py` 从 `master/` 可重复生成。脚本只选择性处理黄色像素并保留原有明暗、透明度和非黄色细节；1024px 母版不会被修改。

大招运行图由 `scripts/process-cutins.py` 整理，依赖 Pillow；尺寸与格式已符合要求的 WebP 直接复制，其余原稿按中心等比裁切并转为 WebP，不修改角色眼神或造型。原稿对应关系及美团袋鼠生成提示词见 `cutins/README.md`。

角色素材统一使用以下编号与文件名（大招原稿除外）：

| 编号 | 文件名 | 角色 |
| --- | --- | --- |
| 01 | `01-pikachu` | 皮卡丘 |
| 02 | `02-psyduck` | 可达鸭 |
| 03 | `03-spongebob` | 海绵宝宝 |
| 05 | `05-minion` | 小黄人 |
| 06 | `06-bumblebee` | 大黄蜂 |
| 07 | `07-smiley` | Smiley |
| 08 | `08-invincible` | 无敌少侠 |
| 09 | `09-lei-yi` | 雷伊 |
| 10 | `10-bart-simpson` | 巴特·辛普森 |
| 11 | `11-nai-long` | 奶龙 |
| 12 | `12-nai-wa` | 奶蛙 |
| 13 | `13-niu-lai` | 牛来 |
| 14 | `14-meituan-kangaroo` | 美团 |
| 15 | `15-yellow-mms` | 黄色 M&M’s 豆 |
| 16 | `16-pacman` | 吃豆人 |
| 17 | `17-hong-kong-yellow-duck` | 大黄鸭 |
| 18 | `18-among-us-crewmate` | among us船员 |

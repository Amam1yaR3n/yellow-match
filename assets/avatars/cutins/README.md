# 大招横幅素材

`samples/` 保留当前 17 个角色的原稿（含内置 `image_gen` 生成的美团袋鼠原稿）。`runtime/` 是游戏实际引用的 17 张独立 WebP，均为 1536×512、3:1、RGB 不透明图；文字由 DOM 叠加。

在已安装 Pillow 的 Python 环境执行 `python3 scripts/process-cutins.py` 即可从项目根目录重新整理素材。脚本按实际文件格式读取，不依赖扩展名；符合尺寸和格式的 WebP 直接复制，其余原稿等比居中裁切并转存。原稿均不覆盖、不重命名。

运行图命名为 `编号-角色标识.webp`，与 `src/types.ts` 中的 `CHARACTER_IDS` 及 `src/characters.ts` 的角色配置一致。源文件到运行图的完整映射在 `scripts/process-cutins.py` 中维护，生产构建只引用 `runtime/`。

## 美团袋鼠生成记录

- 工具：内置 `image_gen`，2026-09-03，单张生成。
- 角色身份参考：`../master/14-meituan-kangaroo.png`。
- 横幅风格参考：`samples/03-spongebob-cutin.webp`。
- 保存的原稿：`samples/14-meituan-kangaroo-cutin.png`。
- 游戏使用文件：`runtime/14-meituan-kangaroo.webp`。
- 原稿实际尺寸为 1536×1024，整理时以眼部所在的中央区域裁切至 1536×512。

最终生成提示词：

```text
Use case: stylized-concept. Asset type: a finished ultimate-attack cut-in banner for a yellow character matching game. Input 1 is the exact Meituan kangaroo character identity reference; input 2 is the existing SpongeBob banner style/composition reference only. Create ONE new wide opaque 1536×512 image, exactly 3:1. The kangaroo is the only character. Enlarge the kangaroo's face to a dramatic close-up with both eyes in the middle horizontal safety zone; preserve the reference's yellow color, flat clean cartoon shading, asymmetric head angle, long ears, brown rounded nose, smile, and recognizable face geometry. Change ONLY the eyes and brow region to a sharp determined ultimate-attack glare with slanted upper eyelids and bright small highlights; no redesign of the snout or other facial features. Keep recognizable ear roots even if ear tips fall outside the top crop. Black/almost-black navy background with vivid gold diagonal speed streaks matching image 2. Yellow and black high contrast, polished clean contours. Keep both eyes inside the central 60% width and middle 50% height so responsive crops retain them. Full-bleed rectangular banner, no blank margins. No text, letters, captions, logos, watermarks, frame, other characters, transparency or interface elements.
```


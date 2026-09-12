# 吃豆人嚼嚼嚼素材

- `closed-mouth.png`：使用内置 image_gen 编辑生成的闭嘴帧，保留生成的透明通道，未抠图。
- 张嘴帧直接引用 `../../avatars/master/16-pacman.png`，闭嘴帧保持金黄色渐变、黑色圆眼和无嘴线的完整圆形。
- 两帧保留原始文件，通过渲染尺寸与水平偏移校准透明留白。
- 演出保留通用特写，400 毫秒放大入场、120 毫秒停顿、700 毫秒水平穿越并咀嚼四轮；接触魔王时结算一次原有伤害，随后向右淡出。

## 生成提示词

Use case: precise-object-edit. Edit target: attached existing Pac-Man game sprite. Create the matching CLOSED-MOUTH animation frame. Change ONLY the right-facing wedge mouth opening: fill it to complete the original golden yellow circular body, with seamless matching soft yellow shading. Preserve exactly the black round eye position and size, existing outer circle location, body size, original canvas framing, soft lighting, colors and simple game-art style. No mouth line, no lips, no new features, no limbs, no text. Output same square canvas 1024x1024 with genuinely transparent background (alpha), including outside the circle. This frame alternates with original so precise registration matters. Original circle approximately center (525,512), radius 366 pixels; keep it in place. No background, no checkerboard.

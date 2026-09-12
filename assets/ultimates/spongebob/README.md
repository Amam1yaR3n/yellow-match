# 抓水母网兜

- 游戏素材：`jellyfish-net.png`，1024 × 1536，透明 PNG。
- 由内置 imagegen 生成，生成图未包含透明通道；最终采用用户提供的抠图版本，代理未自行抠图。
- 参考用户提供的长柄网兜外形，结合游戏已有蜂蜜罐的卡通描边风格。
- 保留原画布与留白。演出在 CSS 中镜像图片，并沿原图 y = 270 分成前后遮挡层；柄尾、网口坐标记录在 `src/net.ts` 中。
- 后续替换应保留画布、网框及柄尾位置；若位置变化，需要同步调整演出坐标。

## 生成时使用的完整提示词

```text
Use case: stylized-concept.
Asset type: transparent PNG game sprite for a flat cartoon jellyfish-catching ultimate animation.
Primary request: one isolated jellyfish catching net, tan yellow-brown long wooden handle, thick oval wooden hoop, loose dark teal mesh bag. Reference image 1 supplies the net design ONLY; reference image 2 supplies the game's bold clean cartoon outline and warm palette ONLY. Do not include hands, arms, characters, honey pot, lettering, water, scenery, shadow backdrop or a checkerboard.
Composition: the net is in its downward-catching pose, seen from a slightly elevated front three-quarter view. Horizontal oval hoop near the upper center, clearly open mouth facing downward; rounded mesh bag hanging BELOW the hoop so a boss face can be seen through the mesh. Long straight wooden handle attaches at the RIGHT side of the hoop and extends diagonally down-right to a rounded grip near bottom-right. Entire net visible with generous small clear margin, vertical canvas. Hoop approximately from x=15% to 72%, y=12% to 28%; bag descends to y=58%; handle ends near x=90%, y=92%. Nothing inside the bag.
Style: very clean flat 2D cartoon sprite, warm ochre wood, thick dark brown outlines, dark teal simple sparse crisscross mesh lines, at most two flat color shades, no realistic rendering or gradients. The holes of the mesh and hoop interior must be actual fully transparent pixels, not white, tinted fills or blue ocean. True transparent alpha background around the entire object. No text or watermark.
This is a NEW sprite; references are not edit targets.
```

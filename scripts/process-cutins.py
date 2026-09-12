#!/usr/bin/env python3
"""保留原稿，将大招横幅整理为独立的 1536×512 不透明 WebP。"""

from pathlib import Path
from shutil import copy2

from PIL import Image, ImageOps


ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "assets" / "avatars" / "cutins" / "samples"
OUTPUT = ROOT / "assets" / "avatars" / "cutins" / "runtime"
SIZE = (1536, 512)
SOURCE_FILES = {
    "01-pikachu": "pikachu-cutin-closeup.webp",
    "02-psyduck": "02-psyduck-cutin-v1.png",
    "03-spongebob": "03-spongebob-cutin.webp",
    "05-minion": "05-minion-cutin-sample.webp",
    "06-bumblebee": "06-bumblebee-cutin-sample-v2.webp",
    "07-smiley": "07-smiley-cutin-sample-v2.webp",
    "08-invincible": "08-invincible-cutin-sample-v2.webp",
    "09-lei-yi": "09-lei-yi-cutin-sample-v2.webp",
    "10-bart-simpson": "10-bart-simpson-cutin.webp",
    "11-nai-long": "11-nai-long-cutin-sample-v2.webp",
    "12-nai-wa": "12-nai-wa-cutin-sample.webp",
    "13-niu-lai": "13-niu-lai-cutin-sample-v2.webp",
    "14-meituan-kangaroo": "14-meituan-kangaroo-cutin.png",
    "15-yellow-mms": "15-yellow-mms-cutin-sample-v2.webp",
    "16-pacman": "16-pacman-cutin-sample-v2.webp",
    "17-hong-kong-yellow-duck": "17-hong-kong-yellow-duck-cutin-sample-v2.webp",
    "18-among-us-crewmate": "18-among-us-crewmate-cutin-sample-v2.webp",
}


def main() -> None:
    OUTPUT.mkdir(parents=True, exist_ok=True)
    for stem, filename in SOURCE_FILES.items():
        source_path = SOURCES / filename
        output_path = OUTPUT / f"{stem}.webp"
        with Image.open(source_path) as source:
            # 已符合交付格式的文件直接复制，避免再次有损压缩。
            if source.format == "WEBP" and source.size == SIZE and source.mode == "RGB":
                copy2(source_path, output_path)
            else:
                image = ImageOps.exif_transpose(source).convert("RGBA")
                opaque = Image.new("RGBA", image.size, "#080e14")
                opaque.alpha_composite(image)
                banner = ImageOps.fit(
                    opaque.convert("RGB"), SIZE, Image.Resampling.LANCZOS,
                    centering=(0.5, 0.5),
                )
                banner.save(output_path, "WEBP", quality=92, method=6)
        print(f"{output_path.relative_to(ROOT)}：{output_path.stat().st_size:,} 字节")


if __name__ == "__main__":
    main()

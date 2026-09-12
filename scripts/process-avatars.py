#!/usr/bin/env python3
"""Normalize the runtime avatars without changing the transparent masters."""

from __future__ import annotations

import colorsys
from pathlib import Path

from PIL import Image


PROJECT_ROOT = Path(__file__).resolve().parent.parent
MASTER_DIR = PROJECT_ROOT / "assets" / "avatars" / "master"
OUTPUT_DIR = PROJECT_ROOT / "assets" / "avatars" / "icons"
OUTPUT_SIZE = 256
CONTENT_SIZE = 215  # 84% of the output canvas.
TARGET_RGB = (249, 210, 58)  # #F9D23A
TARGET_HSV = colorsys.rgb_to_hsv(*(channel / 255 for channel in TARGET_RGB))


def is_yellow(red: int, green: int, blue: int, alpha: int) -> bool:
    if alpha < 8:
        return False
    hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
    hue_degrees = hue * 360
    return 34 <= hue_degrees <= 72 and saturation >= 0.22 and value >= 0.45


def fit_to_canvas(image: Image.Image) -> Image.Image:
    alpha = image.getchannel("A")
    bounding_box = alpha.getbbox()
    if bounding_box is None:
        return Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE))

    cropped = image.crop(bounding_box)
    scale = CONTENT_SIZE / max(cropped.size)
    resized_size = (
        max(1, round(cropped.width * scale)),
        max(1, round(cropped.height * scale)),
    )
    resized = cropped.resize(resized_size, Image.Resampling.LANCZOS)
    resized_alpha = resized.getchannel("A")

    alpha_total = 0
    weighted_x = 0
    weighted_y = 0
    alpha_pixels = resized_alpha.load()
    for y in range(resized.height):
        for x in range(resized.width):
            weight = alpha_pixels[x, y]
            alpha_total += weight
            weighted_x += x * weight
            weighted_y += y * weight

    centroid_x = weighted_x / max(1, alpha_total)
    centroid_y = weighted_y / max(1, alpha_total)
    left = round(OUTPUT_SIZE / 2 - centroid_x)
    top = round(OUTPUT_SIZE / 2 - centroid_y)
    margin = 8
    left = max(margin, min(left, OUTPUT_SIZE - margin - resized.width))
    top = max(margin, min(top, OUTPUT_SIZE - margin - resized.height))

    canvas = Image.new("RGBA", (OUTPUT_SIZE, OUTPUT_SIZE))
    canvas.alpha_composite(resized, (left, top))
    return canvas


def normalize_yellow(image: Image.Image) -> tuple[Image.Image, int]:
    pixels = image.load()
    yellow_samples: list[tuple[float, float, float]] = []

    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if is_yellow(red, green, blue, alpha):
                yellow_samples.append(colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255))

    if not yellow_samples:
        return image, 0

    mean_saturation = sum(sample[1] for sample in yellow_samples) / len(yellow_samples)
    mean_value = sum(sample[2] for sample in yellow_samples) / len(yellow_samples)
    target_hue, target_saturation, target_value = TARGET_HSV

    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, alpha = pixels[x, y]
            if not is_yellow(red, green, blue, alpha):
                continue

            hue, saturation, value = colorsys.rgb_to_hsv(red / 255, green / 255, blue / 255)
            normalized_hue = target_hue + (hue - target_hue) * 0.12
            normalized_saturation = max(
                0,
                min(1, target_saturation + (saturation - mean_saturation) * 0.22),
            )
            normalized_value = max(
                0,
                min(1, target_value + (value - mean_value) * 0.72),
            )
            new_red, new_green, new_blue = colorsys.hsv_to_rgb(
                normalized_hue,
                normalized_saturation,
                normalized_value,
            )
            pixels[x, y] = (
                round(new_red * 255),
                round(new_green * 255),
                round(new_blue * 255),
                alpha,
            )

    return image, len(yellow_samples)


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    source_files = sorted(path for path in MASTER_DIR.glob("[0-9][0-9]-*.png") if int(path.name[:2]) <= 18)
    if len(source_files) != 17:
        raise RuntimeError(f"Expected 17 transparent masters, found {len(source_files)}")

    for source_path in source_files:
        with Image.open(source_path) as source:
            canvas = fit_to_canvas(source.convert("RGBA"))
        normalized, yellow_count = normalize_yellow(canvas)
        output_path = OUTPUT_DIR / source_path.name
        normalized.save(output_path, "PNG", optimize=True)
        print(f"{source_path.name}: normalized {yellow_count} yellow pixels")


if __name__ == "__main__":
    main()

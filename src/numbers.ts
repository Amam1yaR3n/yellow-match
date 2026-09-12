const SCIENTIFIC_AT = 12;
const canvas = document.createElement("canvas");
const measureContext = canvas.getContext("2d");

export function decimalText(value: bigint, fractionDigits = 0): string {
  const sign = value < 0n ? "−" : "";
  const digits = (value < 0n ? -value : value).toString().padStart(fractionDigits + 1, "0");
  return sign + (fractionDigits ? `${digits.slice(0, -fractionDigits)}.${digits.slice(-fractionDigits)}` : digits);
}

export function scientificText(value: bigint, fractionDigits = 0): string {
  if (value === 0n) return fractionDigits ? "0.0" : "0";
  const sign = value < 0n ? "−" : "";
  const digits = (value < 0n ? -value : value).toString();
  let exponent = digits.length - 1 - fractionDigits;
  let rounded = BigInt(digits.slice(0, 4).padEnd(4, "0"));
  if (digits.length > 4 && digits[4] >= "5") rounded += 1n;
  if (rounded === 10_000n) { rounded = 1_000n; exponent += 1; }
  const significant = rounded.toString().padStart(4, "0");
  return `${sign}${significant[0]}.${significant.slice(1)}e${exponent}`;
}

export function formatInteger(value: bigint, fractionDigits = 0): string {
  const digits = (value < 0n ? -value : value).toString();
  return digits.length - fractionDigits > SCIENTIFIC_AT ? scientificText(value, fractionDigits) : decimalText(value, fractionDigits);
}

interface NumericTextOptions {
  prefix?: string;
  fractionDigits?: number;
  minimumFontSize?: number;
  allowLines?: boolean;
  levelLabel?: boolean;
}

/** 格式只影响显示；四位有效数字通过十进制字符串取整，不转为 Number。 */
export function fitNumericText(element: HTMLElement, value: bigint, width: number, options: NumericTextOptions = {}): void {
  fitText(element, options.prefix ?? "", value, width, options);
}

export function fitText(element: HTMLElement, prefix: string, value: bigint | null, width: number, options: NumericTextOptions = {}): void {
  element.style.fontSize = "";
  element.style.whiteSpace = "pre";
  const style = getComputedStyle(element);
  const original = parseFloat(style.fontSize) || 12;
  const minimum = Math.min(original, options.minimumFontSize ?? 12);
  const fractionDigits = options.fractionDigits ?? 0;
  const padding = [style.paddingLeft, style.paddingRight, style.borderLeftWidth, style.borderRightWidth].reduce((total, part) => total + (parseFloat(part) || 0), 0);
  const available = Math.max(1, width - padding);
  const spacing = parseFloat(style.letterSpacing) || 0;
  const measure = (text: string, size: number): number => {
    if (measureContext) measureContext.font = `${style.fontWeight} ${size}px ${style.fontFamily}`;
    return Math.max(...text.split("\n").map((line) => (measureContext?.measureText(line).width ?? line.length * size) + Math.max(0, line.length - 1) * spacing * size / original));
  };
  let text = prefix + (value === null ? "" : formatInteger(value, fractionDigits));
  // 等级通常只有几位：先拆分前缀，避免把 30 扩展成更长的 3.000e1。
  if (options.levelLabel && measure(text, original) > available && value !== null) {
    text = `${prefix.trim()}\n${formatInteger(value, fractionDigits)}`;
  } else if (measure(text, original) > available && value !== null) text = prefix + scientificText(value, fractionDigits);
  let size = Math.max(minimum, Math.min(original, original * available / Math.max(1, measure(text, original))));
  if (measure(text, size) > available && options.allowLines && !options.levelLabel) {
    const numeric = value === null ? "" : scientificText(value, fractionDigits).replace("e", "×\n10^");
    text = value === null ? prefix.replace(/\s+/g, "\n") : (prefix ? `${prefix.trim()}\n` : "") + numeric;
    size = Math.min(original, Math.max(minimum, original * available / Math.max(1, measure(text, original))));
  }
  // 极窄容器最后按实测宽度收敛，始终保留完整文本而不是裁切或省略号。
  while (size > minimum && measure(text, size) > available) size = Math.max(minimum, size - 0.25);
  element.style.fontSize = `${size}px`;
  element.textContent = text;
  // Range 只测真实文本，不会把等级标签的扫光等伪元素误判为文字溢出。
  const renderedTextWidth = (): number => {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rendered = range.getBoundingClientRect().width;
    range.detach();
    return rendered;
  };
  // 再按浏览器实际排版收敛，覆盖字体回退、字距与取整误差，并守住配置的最小字号。
  for (let attempt = 0; attempt < 4 && size > minimum; attempt += 1) {
    const rendered = renderedTextWidth();
    if (rendered <= Math.ceil(available)) break;
    size = Math.max(minimum, size * available / Math.max(1, rendered) - 0.25);
    element.style.fontSize = `${size}px`;
  }
  element.title = prefix + (value === null ? "" : decimalText(value, fractionDigits));
}

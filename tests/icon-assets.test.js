const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const zlib = require("node:zlib");

const root = path.join(__dirname, "..");

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

function decodeRgbaPng(file) {
  const buffer = fs.readFileSync(file);
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  assert.equal(bitDepth, 8);
  assert.equal(colorType, 6);
  const packed = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  const pixels = Buffer.alloc(stride * height);
  let packedOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = packed[packedOffset++];
    const rowOffset = y * stride;
    for (let x = 0; x < stride; x += 1) {
      const raw = packed[packedOffset++];
      const left = x >= 4 ? pixels[rowOffset + x - 4] : 0;
      const up = y > 0 ? pixels[rowOffset - stride + x] : 0;
      const upperLeft = y > 0 && x >= 4 ? pixels[rowOffset - stride + x - 4] : 0;
      if (filter === 0) pixels[rowOffset + x] = raw;
      else if (filter === 1) pixels[rowOffset + x] = (raw + left) & 255;
      else if (filter === 2) pixels[rowOffset + x] = (raw + up) & 255;
      else if (filter === 3) pixels[rowOffset + x] = (raw + Math.floor((left + up) / 2)) & 255;
      else if (filter === 4) pixels[rowOffset + x] = (raw + paeth(left, up, upperLeft)) & 255;
      else assert.fail(`unsupported PNG filter ${filter}`);
    }
  }
  return { width, height, pixels };
}

function alphaAt(decoded, x, y) {
  return decoded.pixels[(y * decoded.width + x) * 4 + 3];
}

function alphaBounds(decoded) {
  let minX = decoded.width;
  let minY = decoded.height;
  let maxX = -1;
  let maxY = -1;
  let visible = 0;
  let strong = 0;
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const alpha = alphaAt(decoded, x, y);
      // Ignore sub-32 Lanczos fringe pixels: the measured rectangle represents
      // the visually effective mark rather than resampling noise.
      if (alpha >= 32) {
        visible += 1;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
      if (alpha >= 224) strong += 1;
    }
  }
  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX >= minX ? maxX - minX + 1 : 0,
    height: maxY >= minY ? maxY - minY + 1 : 0,
    visible,
    strong
  };
}

function rgbaAt(decoded, x, y) {
  const offset = (y * decoded.width + x) * 4;
  return [...decoded.pixels.subarray(offset, offset + 4)];
}

function countNearColor(decoded, expected, tolerance = 24) {
  let count = 0;
  for (let y = 0; y < decoded.height; y += 1) {
    for (let x = 0; x < decoded.width; x += 1) {
      const pixel = rgbaAt(decoded, x, y);
      if (
        pixel[3] >= 192 &&
        Math.abs(pixel[0] - expected[0]) <= tolerance &&
        Math.abs(pixel[1] - expected[1]) <= tolerance &&
        Math.abs(pixel[2] - expected[2]) <= tolerance
      ) {
        count += 1;
      }
    }
  }
  return count;
}

const actionSpecs = {
  16: { safeX: 5, safeY: 9 },
  20: { safeX: 6, safeY: 11 },
  24: { safeX: 7, safeY: 14 },
  32: { safeX: 10, safeY: 18 },
  48: { safeX: 14, safeY: 27 }
};
const badgeStarts = {
  one: Object.fromEntries(Object.entries(actionSpecs).map(([size, spec]) => [
    Number(size),
    Math.max(spec.safeX, Math.round(Number(size) * 0.64))
  ])),
  two: Object.fromEntries(Object.entries(actionSpecs).map(([size, spec]) => [
    Number(size),
    Math.max(spec.safeX, Math.round(Number(size) * 0.46))
  ])),
  wide: Object.fromEntries(Object.entries(actionSpecs).map(([size, spec]) => [
    Number(size),
    spec.safeX
  ]))
};

test("action icon generator uses dedicated optical geometry instead of resizing the full mark", () => {
  const source = fs.readFileSync(path.join(root, "store-assets", "generate-icons.py"), "utf8");
  const actionBody = source.match(/def draw_action_mark\(size, badge_width\):([\s\S]*?)\n\ndef main\(\):/);
  assert.ok(actionBody);
  assert.doesNotMatch(actionBody[1], /draw_mark\(/);
  assert.match(actionBody[1], /ACTION_SPECS\[size\]/);
  assert.match(actionBody[1], /ACTION_BADGE_STARTS\[badge_width\]\[size\]/);
  assert.match(actionBody[1], /rounded\(\s*draw/);
  assert.match(actionBody[1], /arc\(/);
});

test("badge-safe toolbar icons reserve the 1, 28, and 99+ Chrome overlay regions", () => {
  const variants = [
    { name: "one", file: (size) => `action1-${size}.png`, text: "1" },
    { name: "two", file: (size) => `action2-${size}.png`, text: "28" },
    { name: "wide", file: (size) => `action${size}.png`, text: "99+" }
  ];
  for (const [sizeText, spec] of Object.entries(actionSpecs)) {
    const size = Number(sizeText);
    for (const variant of variants) {
      const decoded = decodeRgbaPng(path.join(root, "icons", variant.file(size)));
      assert.equal(decoded.width, size);
      assert.equal(decoded.height, size);
      const region = { text: variant.text, startX: badgeStarts[variant.name][size] };
      for (let y = spec.safeY; y < size; y += 1) {
        for (let x = region.startX; x < size; x += 1) {
          assert.equal(
            alphaAt(decoded, x, y),
            0,
            `${variant.file(size)} ${region.text} badge pixel ${x},${y}`
          );
        }
      }
    }
  }
});

test("badge-safe toolbar icons maximize effective bounds and retain strong brand pixels", () => {
  const palette = [
    [16, 27, 78, 255],
    [255, 255, 255, 255],
    [96, 165, 250, 255],
    [34, 211, 238, 255],
    [196, 139, 250, 255]
  ];
  for (const size of Object.keys(actionSpecs).map(Number)) {
    for (const filename of [`action1-${size}.png`, `action2-${size}.png`, `action${size}.png`]) {
      const decoded = decodeRgbaPng(path.join(root, "icons", filename));
      const bounds = alphaBounds(decoded);
      assert.ok(bounds.width >= Math.floor(size * 0.88), `${filename} width ${bounds.width}`);
      assert.ok(bounds.height >= Math.floor(size * 0.88), `${filename} height ${bounds.height}`);
      assert.ok(bounds.strong >= Math.floor(size * size * 0.24), `${filename} strong pixels ${bounds.strong}`);
      for (const color of palette) {
        const smallIconTolerance = size <= 20 ? 56 : 36;
        assert.ok(
          countNearColor(decoded, color, smallIconTolerance) > 0,
          `${filename} should retain ${color.join(",")}`
        );
      }
    }
  }
});

test("full brand icons keep exact declared dimensions", () => {
  for (const size of [16, 20, 24, 32, 48, 128]) {
    const decoded = decodeRgbaPng(path.join(root, "icons", `icon${size}.png`));
    assert.equal(decoded.width, size);
    assert.equal(decoded.height, size);
  }
});

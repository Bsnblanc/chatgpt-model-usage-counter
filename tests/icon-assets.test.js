const assert = require("node:assert/strict");
const crypto = require("node:crypto");
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

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

const fullSizes = [16, 20, 24, 32, 48, 128];
const actionSizes = [16, 20, 24, 32, 48];
const palette = {
  ink: [18, 18, 20, 255],
  paper: [247, 244, 236, 255],
  cobalt: [24, 24, 255, 255]
};

test("generator uses a full-size toolbar drawing without badge-shaped cutouts", () => {
  const source = fs.readFileSync(path.join(root, "store-assets", "generate-icons.py"), "utf8");
  assert.match(source, /def draw_brand_mark\(size, \*, toolbar=False\):/);
  assert.match(source, /def draw_action_mark\(size\):/);
  assert.match(source, /draw_brand_mark\(size, toolbar=True\)/);
  assert.doesNotMatch(source, /ACTION_SPECS|ACTION_BADGE_STARTS|safe_x|safe_y/);
});

test("all native-badge text variants retain the same unshrunk toolbar identity", () => {
  for (const size of actionSizes) {
    const files = [
      path.join(root, "icons", `action${size}.png`),
      path.join(root, "icons", `action1-${size}.png`),
      path.join(root, "icons", `action2-${size}.png`)
    ];
    assert.equal(sha256(files[0]), sha256(files[1]), `one-character ${size}px variant`);
    assert.equal(sha256(files[0]), sha256(files[2]), `two-character ${size}px variant`);

    const decoded = decodeRgbaPng(files[0]);
    const bounds = alphaBounds(decoded);
    assert.ok(bounds.width >= Math.floor(size * 0.94), `action${size}.png width ${bounds.width}`);
    assert.ok(bounds.height >= Math.floor(size * 0.94), `action${size}.png height ${bounds.height}`);
    assert.ok(bounds.strong >= Math.floor(size * size * 0.62), `action${size}.png strong pixels ${bounds.strong}`);

    const interior = Math.floor(size * 0.75);
    assert.ok(alphaAt(decoded, interior, interior) >= 224, `action${size}.png must not contain a badge notch`);
  }
});

test("toolbar icons retain the restrained publishing palette at every declared size", () => {
  for (const size of actionSizes) {
    const decoded = decodeRgbaPng(path.join(root, "icons", `action${size}.png`));
    const tolerance = size <= 20 ? 48 : 28;
    assert.ok(countNearColor(decoded, palette.ink, tolerance) > 0, `${size}px ink`);
    assert.ok(countNearColor(decoded, palette.paper, tolerance) > 0, `${size}px paper`);
    assert.ok(countNearColor(decoded, palette.cobalt, tolerance) > 0, `${size}px cobalt`);
  }
});

test("full brand icons keep exact dimensions, normal optical size, and all identity colors", () => {
  for (const size of fullSizes) {
    const decoded = decodeRgbaPng(path.join(root, "icons", `icon${size}.png`));
    assert.equal(decoded.width, size);
    assert.equal(decoded.height, size);

    const bounds = alphaBounds(decoded);
    assert.ok(bounds.width >= Math.floor(size * 0.9), `icon${size}.png width ${bounds.width}`);
    assert.ok(bounds.height >= Math.floor(size * 0.9), `icon${size}.png height ${bounds.height}`);

    const tolerance = size <= 20 ? 48 : 28;
    assert.ok(countNearColor(decoded, palette.ink, tolerance) > 0, `${size}px ink`);
    assert.ok(countNearColor(decoded, palette.paper, tolerance) > 0, `${size}px paper`);
    assert.ok(countNearColor(decoded, palette.cobalt, tolerance) > 0, `${size}px cobalt`);
  }
});

test("vector master carries the same orbital counter geometry", () => {
  const svg = fs.readFileSync(path.join(root, "icons", "usage-counter-mark.svg"), "utf8");
  assert.match(svg, /#121214/);
  assert.match(svg, /#F7F4EC/);
  assert.match(svg, /#1818FF/);
  assert.equal((svg.match(/<path[^>]+stroke="#F7F4EC"/g) || []).length, 3);
  assert.equal((svg.match(/fill="#1818FF"/g) || []).length, 3);
  assert.doesNotMatch(svg, /<text|font-family|>B<|>C</);
});

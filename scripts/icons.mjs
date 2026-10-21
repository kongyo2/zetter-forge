// build/icon.svg から、配布するアプリのアイコンを作る（npm run icons）。
// - build/icon.png: macOS 用。1024 四方のまま渡し、icns への変換は electron-builder に任せる
// - build/icons/512x512.png: Linux 用（アイコンのテーマが探すのは 512 四方まで）。Linux の窓のアイコンにも使う
// - build/icon.ico: Windows 用。サイズごとに描き分けて 1 つにまとめる
// 描くのは electron-builder が SVG を描くときと同じ resvg。
import { mkdir, readFile, writeFile } from "node:fs/promises";

import { Resvg, initWasm } from "@resvg/resvg-wasm";

const SOURCE = new URL("../build/icon.svg", import.meta.url);
const MASTER_VIEWBOX = 'viewBox="0 0 1024 1024"';
/** Windows 向けの枠の幅。macOS 用の余白（100）をほぼなくし、角丸をいっぱいに描く */
const WINDOWS_FRAME = 848;
const WINDOWS_VIEWBOX = `viewBox="88 88 ${WINDOWS_FRAME} ${WINDOWS_FRAME}"`;
const WINDOWS_SIZES = [16, 20, 24, 32, 40, 48, 64, 128, 256];
/** このサイズまでは、罫と印の字がにじむだけなので省き、Z を太くする */
const SIMPLIFY_UP_TO = 40;

await initWasm(await readFile(new URL(import.meta.resolve("@resvg/resvg-wasm/index_bg.wasm"))));
const master = await readFile(SOURCE, "utf8");
if (!master.includes(MASTER_VIEWBOX))
  throw new Error(`build/icon.svg に ${MASTER_VIEWBOX} がありません。`);

function render(svg, size) {
  return new Resvg(svg, { fitTo: { mode: "width", value: size } }).render().asPng();
}

function windowsIcon(size) {
  // 影は消し、代わりに縁を内側 1px の太さで引く（縁は角丸の内側だけに見えるので、線の太さはその 2 倍）
  let css = `#tile{filter:none}#edge{stroke-width:${(2 * WINDOWS_FRAME) / size}px;stroke-opacity:.2}`;
  if (size <= SIMPLIFY_UP_TO) css += "#grid,#seal-mark{display:none}#z{stroke-width:120px}";
  const svg = master
    .replace(MASTER_VIEWBOX, WINDOWS_VIEWBOX)
    .replace(/<defs>/u, `<style>${css}</style><defs>`);
  return render(svg, size);
}

/** PNG を並べて ICO にする。electron-builder が作る ICO と同じく、どのサイズも PNG のまま入れる */
function ico(images) {
  const header = Buffer.alloc(6 + images.length * 16);
  header.writeUInt16LE(1, 2); // 種類: アイコン
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  for (const [index, { size, png }] of images.entries()) {
    const entry = 6 + index * 16;
    header.writeUInt8(size % 256, entry); // 幅と高さ。256 は 0 と書く
    header.writeUInt8(size % 256, entry + 1);
    header.writeUInt16LE(1, entry + 4); // 色面の数
    header.writeUInt16LE(32, entry + 6); // 1 画素のビット数
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  }
  return Buffer.concat([header, ...images.map(({ png }) => png)]);
}

const output = (file) => new URL(`../build/${file}`, import.meta.url);
await mkdir(output("icons"), { recursive: true });
await writeFile(output("icon.png"), render(master, 1024));
await writeFile(output("icons/512x512.png"), render(master, 512));
await writeFile(
  output("icon.ico"),
  ico(WINDOWS_SIZES.map((size) => ({ size, png: windowsIcon(size) }))),
);
console.log("build/icon.png・build/icons/512x512.png・build/icon.ico を作りました。");

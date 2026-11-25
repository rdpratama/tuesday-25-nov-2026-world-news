// Wednesday 25 November 2026 — newspaper front page, 48 stories, 6 regions + space.
// Node 22 standard library only. Draws the front page and writes /output/entry.png.
// Own PNG encoder (zlib + CRC32), own canvas, own 5x7 bitmap font. All art original.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';

const W = 1024, H = 1024;
const PAPER = [246, 241, 227];
const INK = [20, 20, 20];
const RED = [179, 35, 27];
const BLUE = [29, 78, 137];
const GREY = [122, 118, 106];
const SKY = [178, 206, 226];
const TAN = [216, 198, 152];
const GREEN = [46, 110, 62];
const ORANGE = [214, 110, 30];
const GOLD = [198, 152, 40];
const PURPLE = [104, 74, 140];
const WHITE = [255, 255, 255];

// ---- CRC32 ----
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function pngEncode(rgb: Uint8Array, w: number, h: number): Buffer {
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    raw.set(rgb.subarray(y * w * 3, (y + 1) * w * 3), y * (1 + w * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---- Canvas ----
class Canvas {
  buf = new Uint8Array(W * H * 3);
  constructor() { this.fill(PAPER); }
  fill(c: number[]) {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = c[0]; this.buf[i * 3 + 1] = c[1]; this.buf[i * 3 + 2] = c[2];
    }
  }
  px(x: number, y: number, c: number[]) {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0]; this.buf[i + 1] = c[1]; this.buf[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: number[]) {
    const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
    const x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) this.px(xx, yy, c);
  }
  border(x: number, y: number, w: number, h: number, c: number[], t = 1) {
    this.rect(x, y, w, t, c); this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c); this.rect(x + w - t, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: number[]) {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    for (;;) {
      this.px(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  circle(cx: number, cy: number, r: number, c: number[]) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) {
      if (x * x + y * y <= r * r) this.px(cx + x, cy + y, c);
    }
  }
  ring(cx: number, cy: number, r: number, c: number[]) {
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * Math.PI) / 180;
      this.px(Math.round(cx + r * Math.cos(rad)), Math.round(cy + r * Math.sin(rad)), c);
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number[]) {
    for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
      if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) this.px(cx + x, cy + y, c);
    }
  }
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: number[]) {
    const minY = Math.min(y0, y1, y2), maxY = Math.max(y0, y1, y2);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      const edges = [[x0, y0, x1, y1], [x1, y1, x2, y2], [x2, y2, x0, y0]];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
        }
      }
      if (xs.length >= 2) {
        const a = Math.min(...xs), b = Math.max(...xs);
        for (let x = Math.floor(a); x <= Math.ceil(b); x++) this.px(x, y, c);
      }
    }
  }
}

// ---- 5x7 bitmap font (rows as "01010/..." strings, 1 = ink) ----
const FONT: Record<string, string> = {
  A: '01110/10001/10001/11111/10001/10001/10001',
  B: '11110/10001/10001/11110/10001/10001/11110',
  C: '01110/10001/10000/10000/10000/10001/01110',
  D: '11110/10001/10001/10001/10001/10001/11110',
  E: '11111/10000/10000/11110/10000/10000/11111',
  F: '11111/10000/10000/11110/10000/10000/10000',
  G: '01110/10001/10000/10111/10001/10001/01111',
  H: '10001/10001/10001/11111/10001/10001/10001',
  I: '01110/00100/00100/00100/00100/00100/01110',
  J: '00111/00010/00010/00010/00010/10010/01100',
  K: '10001/10010/10100/11000/10100/10010/10001',
  L: '10000/10000/10000/10000/10000/10000/11111',
  M: '10001/11011/10101/10101/10001/10001/10001',
  N: '10001/11001/10101/10011/10001/10001/10001',
  O: '01110/10001/10001/10001/10001/10001/01110',
  P: '11110/10001/10001/11110/10000/10000/10000',
  Q: '01110/10001/10001/10001/10101/10010/01101',
  R: '11110/10001/10001/11110/10100/10010/10001',
  S: '01111/10000/10000/01110/00001/00001/11110',
  T: '11111/00100/00100/00100/00100/00100/00100',
  U: '10001/10001/10001/10001/10001/10001/01110',
  V: '10001/10001/10001/10001/10001/01010/00100',
  W: '10001/10001/10001/10101/10101/10101/01010',
  X: '10001/10001/01010/00100/01010/10001/10001',
  Y: '10001/10001/01010/00100/00100/00100/00100',
  Z: '11111/00001/00010/00100/01000/10000/11111',
  '0': '01110/10001/10011/10101/11001/10001/01110',
  '1': '00100/01100/00100/00100/00100/00100/01110',
  '2': '01110/10001/00001/00110/01000/10000/11111',
  '3': '11110/00001/00001/01110/00001/00001/11110',
  '4': '00010/00110/01010/10010/11111/00010/00010',
  '5': '11111/10000/11110/00001/00001/10001/01110',
  '6': '01110/10000/10000/11110/10001/10001/01110',
  '7': '11111/00001/00010/00100/01000/01000/01000',
  '8': '01110/10001/10001/01110/10001/10001/01110',
  '9': '01110/10001/10001/01111/00001/00001/01110',
  ' ': '00000/00000/00000/00000/00000/00000/00000',
  '.': '00000/00000/00000/00000/00000/01100/01100',
  ',': '00000/00000/00000/00000/01100/00100/01000',
  ':': '00000/01100/01100/00000/01100/01100/00000',
  ';': '00000/01100/01100/00000/01100/00100/01000',
  '!': '00100/00100/00100/00100/00100/00000/00100',
  '?': '01110/10001/00001/00110/00100/00000/00100',
  "'": '00100/00100/01000/00000/00000/00000/00000',
  '"': '01010/01010/00000/00000/00000/00000/00000',
  '-': '00000/00000/00000/01110/00000/00000/00000',
  '/': '00001/00010/00010/00100/01000/01000/10000',
  '(': '00010/00100/01000/01000/01000/00100/00010',
  ')': '01000/00100/00010/00010/00010/00100/01000',
  '&': '01100/10010/10100/01000/10101/10010/01101',
  '%': '11001/11010/00010/00100/01000/01011/10011',
  '$': '00100/01111/10100/01110/00101/11110/00100',
  '+': '00000/00100/00100/01110/00100/00100/00000',
  '=': '00000/00000/11111/00000/11111/00000/00000',
  '*': '00000/00100/10101/01110/10101/00100/00000',
  '#': '01010/01010/11111/01010/11111/01010/01010',
  '@': '01110/10001/10111/10101/10110/10000/01110',
  _: '00000/00000/00000/00000/00000/00000/11111',
  '<': '00010/00100/01000/10000/01000/00100/00010',
  '>': '01000/00100/00010/00001/00010/00100/01000',
  '|': '00100/00100/00100/00100/00100/00100/00100',
};

function drawChar(cv: Canvas, ch: string, x: number, y: number, s: number, c: number[]) {
  // Newspaper style: lowercase renders as capitals (font has capitals only).
  const cc = ch >= 'a' && ch <= 'z' ? ch.toUpperCase() : ch;
  const g = FONT[cc] ?? FONT['?'] ?? '01110/10001/00001/00110/00100/00000/00100';
  const rows = g.split('/');
  for (let r = 0; r < 7; r++) {
    for (let col = 0; col < 5; col++) {
      if (rows[r][col] === '1') cv.rect(x + col * s, y + r * s, s, s, c);
    }
  }
}
function textW(s: string, sc: number): number {
  return s.length * 6 * sc - sc;
}
function drawText(cv: Canvas, str: string, x: number, y: number, sc: number, c: number[], align: 'l' | 'c' | 'r' = 'l') {
  let sx = x;
  if (align === 'c') sx = x - Math.floor(textW(str, sc) / 2);
  if (align === 'r') sx = x - textW(str, sc);
  for (let i = 0; i < str.length; i++) drawChar(cv, str[i], sx + i * 6 * sc, y, sc, c);
}
function wrapText(str: string, maxW: number, sc: number): string[] {
  const words = str.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const test = cur ? cur + ' ' + w : w;
    if (textW(test, sc) <= maxW) cur = test;
    else {
      if (cur) lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

// ---- Story data: 48 stories, 6 regions + space (41 official edition + 7 verified extras) ----
type Story = { t: string; s: string; tag: string; scene: string };
const HEROES: Story[] = [
  { t: 'SHENZHOU-24 LIFTS OFF', s: 'China launches Shenzhou-24 with the first foreign astronaut to Tiangong. The 41st crewed flight.', tag: 'OFFICIAL', scene: 'rocket' },
  { t: 'FLINDERS ISLAND BUSHFIRE', s: 'Residents told it is too late to leave as a bushfire burns. Lightning strike, 3,000+ hectares.', tag: 'CONFIRMED', scene: 'fire' },
  { t: 'THANKSGIVING-EVE DATA PILE', s: 'US Q3 GDP, October PCE and jobless claims all due at 13:30 UTC, a day early for the holiday.', tag: 'OFFICIAL', scene: 'chart' },
];
const MEDIUMS: Story[] = [
  { t: 'AUSTRALIA CPI DUE', s: 'October CPI after September ran 4.3% y/y.', tag: 'REPORTED', scene: 'cpi' },
  { t: 'EU-BALKANS SUMMIT', s: 'EU and Western Balkans leaders meet in Brussels.', tag: 'OFFICIAL', scene: 'summit' },
  { t: 'MEPS VOTE PHARMA REFORM', s: 'MEPs vote on EU pharma reform in Strasbourg.', tag: 'REPORTED', scene: 'pharma' },
  { t: 'PSG HOST ROMA', s: 'Champions League. Doue out, Kvaratskhelia also out.', tag: 'CONFIRMED', scene: 'soccer' },
  { t: 'SA STORM WARNING', s: 'Level 4 warnings in five provinces. Wind, hail.', tag: 'CONFIRMED', scene: 'storm' },
  { t: 'GERMANY-AFRICA SUMMIT', s: 'Steinmeier urges firms to invest more in Africa.', tag: 'CONFIRMED', scene: 'globe' },
  { t: '16 DAYS OF ACTIVISM', s: 'March opens in Mexico City against violence.', tag: 'REPORTED', scene: 'march' },
  { t: 'EMERGING NATIONS FINAL', s: 'Ireland face unbeaten Sri Lanka in the final.', tag: 'CONFIRMED', scene: 'cricket' },
  { t: 'TAIWAN VOTE TEST', s: 'Taiwan voters choose 11,000+ local officials.', tag: 'REPORTED', scene: 'vote' },
  { t: 'MISS INTERNATIONAL', s: 'Crowning held in Tokyo with 73 entrants.', tag: 'CONFIRMED', scene: 'crown' },
];
const LIST: string[] = [
  'SPAIN SNAP POLL - LAST POLL: PP+VOX 186-194 SEATS; MAJORITY NEEDS 176',
  'FED BEIGE BOOK - FED RELEASES BEIGE BOOK AHEAD OF DECEMBER FOMC',
  'TURKISH HELICOPTER CRASH - FIVE KILLED AS MILITARY HELICOPTER CRASHES IN TRAINING',
  'DR CONGO REBELS PULL BACK - REBELS CALL OFF ADVANCE ON BUNIA AFTER DAYS OF FIGHTING',
  '175 MIGRANTS MISSING - BOAT FROM SENEGAL VANISHES EN ROUTE TO EUROPE',
  'HUAWEI GUILTY - US JURY CONVICTS HUAWEI OF STEALING TRADE SECRETS',
  'HAMAS SECURITY CHIEF KILLED - KILLED IN ISRAELI AIR STRIKE ON GAZA CITY',
  'RIYADH TOWER HIT TWICE - SAUDI CONDEMNS ATTACK AFTER PIF SKYSCRAPER HIT TWICE IN A WEEK',
  'TRUMP PARDONS TURKEYS - TRUMP PARDONS THANKSGIVING TURKEYS AT WHITE HOUSE',
  'US CLAIMS DATA - JOBLESS CLAIMS AND POLES CLAIMS MOVED TO WEDNESDAY',
  'DURABLE GOODS - US OCTOBER DURABLE GOODS ORDERS DUE',
  'PCE INFLATION - US OCTOBER PCE INFLATION, INCOME, SPENDING DUE',
  'NEW HOME SALES - US OCTOBER NEW HOME SALES DUE',
  'LAST TRADING DAY - LAST FULL US TRADING DAY BEFORE THANKSGIVING',
  'NBA CUP: PISTONS AT MAGIC - ORLANDO CAN CLINCH HOME COURT',
  'NBA CUP: MAVS AT NUGGETS - BOTH 2-0',
  'NHL: KNIGHTS AT KINGS - ALL TIMES ET',
  'EU BUDGET SIGNED - METSOLA SIGNS 2027 EU BUDGET INTO LAW',
  'UKRAINE SECURITY PACKAGE - MEPS DEBATE SECURITY PACKAGE FOR UKRAINE',
  'UCL: QARABAG V BARCA - IN BAKU',
  'UCL: SLAVIA V VILLARREAL - IN PRAGUE',
  'UCL: CLUB BRUGGE V LIVERPOOL',
  'UCL: LILLE V BAYERN',
  'UCL: INTER V ATLETICO',
  'UCL: ATHLETIC V PLZEN',
  'UCL: SHAKHTAR V FENERBACHE',
  'UCL: COPENHAGEN V MAN UTD',
  'LUX FILM AWARD - LUX AUDIENCE FILM AWARD 2027 SHORTLIST',
  'RESILIENCE DAYS - DISASTER RESILIENCE DAYS, MUNICH, DAY 2',
  'MARSEILLE SHIPS - PHILIPPE NOT TO GET NEW SHIPS, SUBMARINES',
  'MARSEILLE FLOOD AID - AID ORDERED TO 25,000 FLOODED MAGHREBIANS\' HOMES',
  'SHENZHOU-24 DOCKS - SET TO DOCK AT TIANHE FORWARD PORT',
  'ACIE: KETHE V JENIBOB',
  'ACL: GAMBA OSAKA V PORT',
  'ILT20: DUBAI V DESERT VIPERS',
];
const UTC: [string, string][] = [
  ['00:30', 'AUSTRALIA OCTOBER CPI DUE'],
  ['09:00', 'EU-BALKANS SUMMIT OPENS'],
  ['10:00', 'SHENZHOU-24 LIFTS OFF'],
  ['12:00', 'MEPS VOTE PHARMA REFORM'],
  ['13:30', 'US DATA PILE: GDP, PCE'],
  ['20:00', 'CHAMPIONS LEAGUE: 8 TIES'],
  ['21:00', 'LAST US TRADING DAY ENDS'],
];
const NUMBERS: [string, string][] = [
  ['41', 'SHENZHOU-24, CHINA\'S 41ST CREWED FLIGHT'],
  ['3,000', 'HECTARES BURNT, FLINDERS ISLAND'],
  ['3.4%', 'US Q3 GDP SECOND ESTIMATE SEEN'],
  ['11,000', 'LOCAL OFFICIALS TAIWAN VOTERS CHOOSE'],
  ['175', 'MIGRANTS MISSING OFF SENEGAL'],
  ['25,000', 'FLOODED HOMES TO GET AID, MARSEILLE'],
];
const PREDATED = ['COP31 COLLAPSE - ANTALYA, 22 NOV', 'US MIDTERMS - 3 NOV'];
const NOTYET = ['THANKSGIVING DAY - 26 NOV', 'TAIWAN LOCAL VOTE - SAT 29 NOV'];
const REGIONS: [string, number][] = [
  ['EUROPE', 19], ['MIDDLE EAST', 2], ['ASIA', 8], ['AFRICA', 4], ['AMERICAS', 13], ['OCEANIA', 2],
];

// ---- Illustrated scenes (each draws inside its own box) ----
function sbox(cv: Canvas, x: number, y: number, w: number, h: number, bg: number[]) {
  cv.rect(x, y, w, h, bg);
  cv.border(x, y, w, h, INK, 1);
}
const SCENES: Record<string, (cv: Canvas, x: number, y: number, w: number, h: number) => void> = {
  rocket(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [28, 58, 108]);
    for (const [sx, sy] of [[8, 10], [30, 26], [52, 8], [74, 30], [92, 14], [110, 26], [20, 44], [96, 44]] as const)
      cv.circle(x + (sx * w) / 120, y + (sy * h) / 60, 1, WHITE);
    const cx = x + w / 2, top = y + 8, bot = y + h - 26;
    cv.tri(cx - 12, top + 18, cx + 12, top + 18, cx, top, RED);
    cv.rect(cx - 12, top + 18, 24, bot - top - 18, WHITE);
    cv.rect(cx - 12, top + 26, 24, 4, RED);
    cv.tri(cx - 12, bot, cx - 22, bot + 12, cx - 12, bot + 2, RED);
    cv.tri(cx + 12, bot, cx + 22, bot + 12, cx + 12, bot + 2, RED);
    cv.tri(cx - 8, bot, cx + 8, bot, cx, bot + 18, ORANGE);
    cv.tri(cx - 4, bot, cx + 4, bot, cx, bot + 11, GOLD);
    cv.rect(x, y + h - 8, w, 8, [40, 40, 40]);
    cv.circle(x + w - 26, y + 16, 9, [200, 210, 220]);
    cv.ring(x + w - 26, y + 16, 9, INK);
  },
  fire(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [232, 122, 44]);
    cv.rect(x, y, w, Math.floor(h * 0.45), [244, 164, 66]);
    for (const [sx, sy, r] of [[18, 12, 7], [44, 8, 9], [76, 14, 6], [100, 9, 8]] as const)
      cv.circle(x + (sx * w) / 120, y + (sy * h) / 60, r, [120, 118, 116]);
    const gy = y + h - 22;
    cv.rect(x + 8, gy, 34, 22, [60, 48, 40]);
    cv.tri(x + 6, gy, x + 44, gy, x + 25, gy - 14, [40, 32, 28]);
    cv.tri(x + w - 46, gy + 6, x + w - 30, gy + 6, x + w - 38, gy - 12, [40, 80, 40]);
    for (const [fx, fh, c] of [[14, 26, GOLD], [34, 34, ORANGE], [56, 22, RED], [76, 30, GOLD], [96, 24, ORANGE]] as const) {
      const bx = x + (fx * w) / 120;
      cv.tri(bx - 8, gy + 4, bx + 8, gy + 4, bx, gy + 4 - (fh * h) / 60, c);
    }
  },
  chart(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, WHITE);
    const base = y + h - 12;
    const bw = Math.floor(w / 6);
    const vals = [0.3, 0.45, 0.62, 0.85];
    vals.forEach((v, i) => {
      const bh = Math.floor((h - 30) * v);
      cv.rect(x + 10 + i * (bw + 4), base - bh, bw, bh, i === 3 ? RED : BLUE);
      cv.border(x + 10 + i * (bw + 4), base - bh, bw, bh, INK, 1);
    });
    cv.line(x + 8, base - Math.floor((h - 30) * 0.28), x + w - 8, y + 8, RED);
    cv.line(x + w - 8, y + 8, x + w - 18, y + 10, RED);
    cv.line(x + w - 8, y + 8, x + w - 10, y + 18, RED);
    drawText(cv, '3.4%', x + w - 34, y + 4, 1, INK);
  },
  cpi(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [214, 232, 200]);
    const cx = x + w / 2, cy = y + h / 2;
    cv.rect(cx - 26, cy - 8, 52, 26, GOLD);
    cv.border(cx - 26, cy - 8, 52, 26, INK, 1);
    cv.tri(cx - 26, cy - 8, cx - 26, cy + 18, cx - 38, cy + 5, GOLD);
    cv.circle(cx - 30, cy + 5, 3, PAPER);
    drawText(cv, '4.3%', cx - 14, cy - 2, 2, INK);
    cv.circle(x + 14, y + 10, 5, GOLD); cv.ring(x + 14, y + 10, 5, INK);
    cv.circle(x + w - 14, y + h - 12, 5, GOLD); cv.ring(x + w - 14, y + h - 12, 5, INK);
  },
  summit(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [196, 216, 232]);
    const cx = x + w / 2, cy = y + h / 2 + 6;
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 * Math.PI) / 180;
      cv.circle(cx + Math.round(30 * Math.cos(a)), y + 12 + Math.round(7 * Math.sin(a)), 2, GOLD);
    }
    cv.ellipse(cx, cy, 34, 12, [120, 82, 50]);
    cv.rect(cx - 4, cy + 8, 8, 10, [90, 60, 36]);
    for (const dx of [-40, -20, 20, 40]) cv.rect(cx + dx - 5, cy - 2, 10, 12, INK);
    drawText(cv, 'EU', cx - 8, cy - 5, 1, WHITE);
  },
  pharma(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, WHITE);
    const cx = x + w / 2, cy = y + h / 2 - 6;
    cv.rect(cx - 34, cy - 8, 30, 16, RED); cv.border(cx - 34, cy - 8, 30, 16, INK, 1);
    cv.rect(cx - 4, cy - 8, 30, 16, WHITE); cv.border(cx - 4, cy - 8, 30, 16, INK, 1);
    cv.circle(cx - 34, cy, 8, RED); cv.circle(cx + 26, cy, 8, WHITE);
    cv.rect(cx - 22, y + h - 24, 44, 18, BLUE); cv.border(cx - 22, y + h - 24, 44, 18, INK, 1);
    cv.rect(cx - 10, y + h - 26, 20, 4, INK);
    cv.rect(cx - 3, y + h - 40, 6, 14, WHITE); cv.border(cx - 3, y + h - 40, 6, 14, INK, 1);
  },
  soccer(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [120, 190, 110]);
    cv.rect(x, y + h - 10, w, 10, [80, 150, 80]);
    const gx = x + 8, gy = y + 6;
    cv.rect(gx, gy, 4, 26, WHITE); cv.rect(gx + 34, gy, 4, 26, WHITE); cv.rect(gx, gy, 38, 4, WHITE);
    for (let i = 1; i < 5; i++) cv.line(gx + i * 7, gy + 4, gx + i * 7, gy + 26, [200, 200, 200]);
    const cx = x + w - 34, cy = y + h - 26;
    cv.circle(cx, cy, 13, WHITE); cv.ring(cx, cy, 13, INK);
    cv.circle(cx, cy, 4, INK);
    for (const [dx, dy] of [[-9, -6], [9, -6], [-9, 6], [9, 6], [0, -11]] as const) cv.circle(cx + dx, cy + dy, 2, INK);
  },
  storm(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [150, 164, 180]);
    cv.circle(x + 30, y + 16, 12, [110, 114, 122]);
    cv.circle(x + 48, y + 12, 14, [110, 114, 122]);
    cv.circle(x + 66, y + 18, 11, [110, 114, 122]);
    cv.rect(x + 18, y + 18, 62, 8, [110, 114, 122]);
    const bx = x + 48;
    cv.line(bx, y + 26, bx - 8, y + 40, GOLD); cv.line(bx - 8, y + 40, bx + 2, y + 40, GOLD);
    cv.line(bx + 2, y + 40, bx - 6, y + 54, GOLD); cv.line(bx - 6, y + 54, bx + 6, y + 54, GOLD);
    for (const rx of [16, 34, 66, 84] as const) cv.line(x + rx, y + h - 16, x + rx - 3, y + h - 6, BLUE);
    drawText(cv, 'LVL 4', x + 8, y + h - 12, 1, RED);
  },
  globe(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [196, 216, 232]);
    const cx = x + 26, cy = y + h / 2;
    cv.circle(cx, cy, 18, BLUE); cv.ring(cx, cy, 18, INK);
    cv.ellipse(cx - 4, cy - 4, 6, 9, TAN); cv.ellipse(cx + 7, cy + 6, 5, 6, TAN);
    const bx = x + w - 34, by = y + h - 26;
    cv.rect(bx, by, 30, 16, [120, 82, 50]); cv.border(bx, by, 30, 16, INK, 1);
    cv.rect(bx + 10, by - 6, 10, 6, INK);
    cv.line(bx, by + 8, bx + 30, by + 8, INK);
    drawText(cv, 'EU', bx + 10, by + 2, 1, WHITE);
    cv.line(x + 46, cy - 6, bx + 4, by + 2, RED);
  },
  march(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [232, 214, 232]);
    const base = y + h - 10;
    const cols = [PURPLE, RED, BLUE, GREEN];
    cols.forEach((c, i) => {
      const px = x + 14 + i * 20;
      cv.circle(px, base - 26, 5, c);
      cv.rect(px - 5, base - 20, 10, 20, c);
    });
    cv.rect(x + 8, y + 6, w - 16, 12, WHITE); cv.border(x + 8, y + 6, w - 16, 12, INK, 1);
    cv.line(x + 12, y + 18, x + 12, base - 8, INK); cv.line(x + w - 12, y + 18, x + w - 12, base - 8, INK);
    drawText(cv, '16 DAYS', x + w / 2, y + 9, 1, RED, 'c');
  },
  cricket(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [130, 196, 120]);
    const base = y + h - 8;
    for (const dx of [-8, 0, 8]) cv.rect(x + w / 2 + dx - 2, base - 26, 4, 26, GOLD);
    cv.rect(x + w / 2 - 12, base - 28, 24, 3, GOLD);
    const bx = x + 16;
    cv.rect(bx, y + 12, 7, 26, [120, 82, 50]); cv.border(bx, y + 12, 7, 26, INK, 1);
    cv.rect(bx + 1, y + 38, 5, 8, [90, 60, 36]);
    cv.circle(x + w - 18, y + 16, 6, RED); cv.ring(x + w - 18, y + 16, 6, INK);
    drawText(cv, 'FINAL', x + w / 2, y + 4, 1, INK, 'c');
  },
  vote(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [210, 224, 238]);
    const cx = x + w / 2, by = y + h - 22;
    cv.rect(cx - 24, by, 48, 18, BLUE); cv.border(cx - 24, by, 48, 18, INK, 1);
    cv.rect(cx - 12, by - 3, 24, 4, INK);
    cv.rect(cx - 14, by - 22, 28, 18, WHITE); cv.border(cx - 14, by - 22, 28, 18, INK, 1);
    cv.line(cx - 8, by - 14, cx - 2, by - 6, GREEN); cv.line(cx - 2, by - 6, cx + 10, by - 18, GREEN);
    cv.line(cx - 8, by - 14, cx - 2, by - 6, GREEN);
    drawText(cv, '11,000', cx, y + 6, 1, INK, 'c');
  },
  crown(cv, x, y, w, h) {
    sbox(cv, x, y, w, h, [244, 226, 180]);
    const cx = x + w / 2, cy = y + h / 2 + 2;
    cv.tri(cx - 26, cy + 6, cx - 14, cy + 6, cx - 22, cy - 14, GOLD);
    cv.tri(cx - 10, cy + 6, cx + 10, cy + 6, cx, cy - 20, GOLD);
    cv.tri(cx + 14, cy + 6, cx + 26, cy + 6, cx + 22, cy - 14, GOLD);
    cv.rect(cx - 26, cy + 6, 52, 10, GOLD); cv.border(cx - 26, cy + 6, 52, 10, INK, 1);
    for (const [jx, jy, c] of [[cx - 22, cy - 14, RED], [cx, cy - 20, BLUE], [cx + 22, cy - 14, RED]] as const)
      cv.circle(jx, jy, 3, c);
    cv.rect(x + 6, y + h - 8, w - 12, 8, [60, 60, 60]);
    cv.line(x + 10, y + 4, cx - 10, cy - 8, GOLD); cv.line(x + w - 10, y + 4, cx + 10, cy - 8, GOLD);
    drawText(cv, '73', cx, y + 4, 1, INK, 'c');
  },
};

// ---- Layout helpers ----
function panel(cv: Canvas, x: number, y: number, w: number, h: number) {
  cv.rect(x, y, w, h, [252, 248, 238]);
  cv.border(x, y, w, h, INK, 1);
}
function trunc(s: string, maxW: number, sc: number): string {
  // Cut at a word boundary so lines never end mid-word.
  let t = s;
  while (t.length > 0 && textW(t, sc) > maxW) t = t.slice(0, -1);
  const sp = t.lastIndexOf(' ');
  if (sp > maxW / (6 * sc) / 2 && t.length < s.length) t = t.slice(0, sp);
  return t;
}
function rule(cv: Canvas, y: number, x0: number, x1: number, t = 2) {
  cv.rect(x0, y, x1 - x0, t, INK);
}

// ---- Build the front page ----
function build(): Canvas {
  const cv = new Canvas();

  // Masthead
  drawText(cv, 'WEDNESDAY 25 NOVEMBER 2026', 512, 14, 5, INK, 'c');
  drawText(cv, 'THE WORLD IN ONE IMAGE', 512, 58, 2, RED, 'c');
  rule(cv, 82, 16, 1008, 3);
  rule(cv, 88, 16, 1008, 1);

  // Count line
  drawText(cv, '48 STORIES  |  6 REGIONS + SPACE  |  14 FIELDS', 512, 96, 2, INK, 'c');

  // UTC strip (label column on the left, 7 entries on the right)
  cv.rect(16, 118, 992, 40, [238, 232, 214]);
  cv.border(16, 118, 992, 40, INK, 1);
  drawText(cv, 'THE DAY IN', 24, 124, 2, RED);
  drawText(cv, 'UTC', 24, 140, 2, RED);
  cv.rect(176, 120, 1, 36, GREY);
  const uw = 832 / 7;
  UTC.forEach(([tm, label], i) => {
    const ex = 176 + (i + 1) * uw;
    if (i > 0) cv.rect(Math.floor(ex), 120, 1, 36, GREY);
    const cx = 176 + i * uw + uw / 2;
    drawText(cv, tm, cx, 122, 2, INK, 'c');
    const ls = wrapText(label, uw - 10, 1);
    ls.slice(0, 2).forEach((ln, j) => drawText(cv, ln, cx, 140 + j * 8, 1, INK, 'c'));
  });

  // Numbers strip (label column on the left, 6 entries on the right)
  cv.rect(16, 164, 992, 44, [238, 232, 214]);
  cv.border(16, 164, 992, 44, INK, 1);
  drawText(cv, 'THE DAY IN', 24, 172, 2, RED);
  drawText(cv, 'NUMBERS', 24, 188, 2, RED);
  cv.rect(176, 166, 1, 40, GREY);
  const nw = 832 / 6;
  NUMBERS.forEach(([num, label], i) => {
    const ex = 176 + (i + 1) * nw;
    if (i > 0) cv.rect(Math.floor(ex), 166, 1, 40, GREY);
    const cx = 176 + i * nw + nw / 2;
    drawText(cv, num, cx, 168, 3, RED, 'c');
    const ls = wrapText(label, nw - 10, 1);
    ls.slice(0, 2).forEach((ln, j) => drawText(cv, ln, cx, 190 + j * 8, 1, INK, 'c'));
  });

  // Hero panels (3)
  HEROES.forEach((st, i) => {
    const x = 16 + i * 336, y = 216, w = 320, h = 178;
    panel(cv, x, y, w, h);
    SCENES[st.scene](cv, x + 1, y + 1, w - 2, 106);
    const hl = wrapText(st.t, w - 16, 2);
    hl.slice(0, 2).forEach((ln, j) => drawText(cv, ln, x + 8, y + 114 + j * 15, 2, INK));
    const sl = wrapText(st.s, w - 16, 1);
    sl.slice(0, 2).forEach((ln, j) => drawText(cv, ln, x + 8, y + 146 + j * 8, 1, INK));
    drawText(cv, st.tag, x + 8, y + h - 12, 1, RED);
  });

  // Medium panels (10, 2 rows x 5)
  MEDIUMS.forEach((st, i) => {
    const row = Math.floor(i / 5), col = i % 5;
    const x = 16 + col * 200, y = 402 + row * 88, w = 192, h = 80;
    panel(cv, x, y, w, h);
    SCENES[st.scene](cv, x + 1, y + 1, w - 2, 34);
    const hl = wrapText(st.t, w - 12, 1);
    hl.slice(0, 1).forEach((ln, j) => drawText(cv, ln, x + 6, y + 40 + j * 8, 1, INK));
    const sl = wrapText(st.s, w - 12, 1);
    sl.slice(0, 2).forEach((ln, j) => drawText(cv, ln, x + 6, y + 50 + j * 8, 1, INK));
    drawText(cv, st.tag, x + 6, y + h - 10, 1, RED);
  });

  // Map + Date Check
  const my = 578, mh = 96;
  panel(cv, 16, my, 624, mh);
  drawText(cv, 'WHERE IT HAPPENED', 24, my + 6, 2, RED);
  const mx = 16, mw = 624;
  cv.ellipse(mx + 110, my + 46, 70, 20, TAN);
  cv.ellipse(mx + 150, my + 76, 26, 18, TAN);
  cv.ellipse(mx + 300, my + 38, 28, 14, TAN);
  cv.ellipse(mx + 312, my + 66, 30, 20, TAN);
  cv.ellipse(mx + 430, my + 42, 78, 22, TAN);
  cv.ellipse(mx + 540, my + 76, 22, 10, TAN);
  const dots: [number, number, string][] = [
    [mx + 110, my + 46, '13'], [mx + 150, my + 76, ''], [mx + 300, my + 38, '19'],
    [mx + 312, my + 66, '4'], [mx + 430, my + 42, '8'], [mx + 540, my + 76, '2'],
  ];
  for (const [dx, dy, n] of dots) {
    cv.circle(dx, dy, 7, RED);
    if (n) drawText(cv, n, dx, dy - 3, 1, WHITE, 'c');
  }
  cv.circle(mx + 596, my + 16, 5, RED);
  drawText(cv, 'SPACE', mx + 596, my + 26, 1, RED, 'c');
  drawText(cv, 'EUROPE 19  |  MIDDLE EAST 2  |  ASIA 8  |  AFRICA 4  |  AMERICAS 13  |  OCEANIA 2', mx + mw / 2, my + mh - 12, 1, INK, 'c');

  // Date Check
  panel(cv, 656, my, 352, mh);
  drawText(cv, 'DATE CHECK', 664, my + 6, 2, RED);
  drawText(cv, 'PRE-DATED - LEFT OUT:', 664, my + 26, 1, INK);
  PREDATED.forEach((s, j) => drawText(cv, '- ' + s, 664, my + 36 + j * 9, 1, INK));
  drawText(cv, 'NOT YET:', 664, my + 58, 1, INK);
  NOTYET.forEach((s, j) => drawText(cv, '- ' + s, 664, my + 68 + j * 9, 1, INK));

  // Numbered list (14-48), two columns
  drawText(cv, 'THE REST OF THE DAY', 16, 684, 2, RED);
  rule(cv, 702, 16, 1008, 1);
  const left = LIST.slice(0, 18), right = LIST.slice(18);
  left.forEach((s, i) => {
    const line = `${14 + i}. ${s}`;
    drawText(cv, trunc(line, 484, 1), 16, 710 + i * 15, 1, INK);
  });
  right.forEach((s, i) => {
    const line = `${32 + i}. ${s}`;
    drawText(cv, trunc(line, 484, 1), 524, 710 + i * 15, 1, INK);
  });

  // Footer
  rule(cv, 990, 16, 1008, 1);
  drawText(cv, 'ALL STORIES DATED 25 NOVEMBER 2026  |  DRAWN, NOT PHOTOGRAPHED', 512, 998, 1, GREY, 'c');
  return cv;
}

// ---- Main ----
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(out, { recursive: true });
writeFileSync(join(out, 'entry.png'), pngEncode(build().buf, W, H));

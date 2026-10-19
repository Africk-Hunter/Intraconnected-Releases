// Generates the animated SVGs used by README.md.  Run: node docs/readme/build.cjs
// Pure SVG + CSS keyframes (no JS) so GitHub renders them inside <img>. The scenes copy the
// real app and landing page: stock theme colors, neobrutal cards, the grid-paper background.
// Fonts (DM Sans, Space Grotesk, Courier Prime) are embedded as data URIs, subset to the
// characters each SVG uses via Google Fonts' `text=` parameter. Offline, DM Sans and Courier
// Prime fall back to the full @fontsource files in node_modules and Space Grotesk to system fonts.
const fs = require('fs');
const path = require('path');

const OUT = __dirname;
const ROOT = path.join(__dirname, '..', '..');

// Stock colors from src/utilities/theme.ts (TOKENS).
const C = {
  bg: '#E9F9E5', panel: '#D3DED1', ink: '#111111', white: '#FFFFFF',
  root: '#A3703E', leaf: '#41BC28', parent: '#00A9D8', link: '#E8E879',
  checklist: '#2049C5', note: '#2B701D', vault: '#4B1F8F', vaultSlot: '#2A1052',
  back: '#C84600', home: '#CC5500', danger: '#C80000', pink: '#DB44A4', gold: '#D4A000',
  p1: '#C80000', p2: '#EC8A13', p3: '#D4A000', grid: 'rgba(65,188,40,0.2)', muted: '#3d473b',
};

/* ------------------------------------------------------------------ fonts */
const FAMILIES = {
  dm: { css: 'DM Sans', query: 'DM+Sans:opsz,wght@9..40,100..1000', local: '@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2', weight: '100 1000' },
  sg: { css: 'Space Grotesk', query: 'Space+Grotesk:wght@500;700', weight: '300 700' },
  mono: { css: 'Courier Prime', query: 'Courier+Prime:wght@400', local: '@fontsource/courier-prime/files/courier-prime-latin-400-normal.woff2', weight: '400' },
};
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

async function fontFaces(key, chars) {
  const f = FAMILIES[key];
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${f.query}&text=${encodeURIComponent(chars)}`, { headers: { 'User-Agent': UA } })).text();
    const urls = [...new Set([...css.matchAll(/url\((.*?)\)/g)].map((m) => m[1]))];
    if (!urls.length) throw new Error('no font url');
    const faces = [];
    for (const u of urls) {
      const buf = Buffer.from(await (await fetch(u)).arrayBuffer());
      faces.push(`@font-face{font-family:'${f.css}';src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');font-weight:${f.weight}}`);
    }
    return faces.join('');
  } catch (e) {
    if (!f.local) { console.warn(`  ${f.css}: offline, using system fallback`); return ''; }
    console.warn(`  ${f.css}: offline, embedding the full local file`);
    const buf = fs.readFileSync(path.join(ROOT, 'node_modules', f.local));
    return `@font-face{font-family:'${f.css}';src:url(data:font/woff2;base64,${buf.toString('base64')}) format('woff2');font-weight:${f.weight}}`;
  }
}

/* ------------------------------------------------------------------ doc + animation helpers */
class Doc {
  constructor(w, h, D, title) {
    this.w = w; this.h = h; this.D = D; this.title = title;
    this.css = []; this.n = 0;
  }
  pct(t) { return +((t / this.D) * 100).toFixed(3); }
  // Wrap `inner` in a <g> animated by keyframe steps [[seconds, 'css'], ...].
  g(steps, inner, extra = '') {
    steps = steps.map(([t, s]) => [Math.max(0, Math.min(this.D, t)), s]).sort((a, b) => a[0] - b[0]);
    if (steps[0][0] > 0) steps.unshift([0, steps[0][1]]);
    if (steps[steps.length - 1][0] < this.D) steps.push([this.D, steps[steps.length - 1][1]]);
    const name = 'k' + ++this.n;
    this.css.push(`@keyframes ${name}{${steps.map(([t, s]) => `${this.pct(t)}%{${s}}`).join('')}}`);
    this.css.push(`.${name}{transform-box:fill-box;transform-origin:center;animation:${name} ${this.D}s ease-in-out infinite;${extra}}`);
    return `<g class="${name}">${inner}</g>`;
  }
  // Visible during each [on, off] range (on <= 0 means visible from the start, off >= D to the end).
  vis(ranges, inner, o = {}) {
    const f = o.fade ?? 0.25;
    const hide = o.hide ?? 'opacity:0';
    const show = o.show ?? 'opacity:1';
    const steps = [];
    if (ranges[0][0] > 0) steps.push([0, hide]);
    for (const [a, b] of ranges) {
      if (a <= 0) steps.push([0, show]); else steps.push([a, hide], [a + f, show]);
      if (b < this.D) steps.push([b, show], [b + f, hide]); else steps.push([this.D, show]);
    }
    return this.g(steps, inner, o.extra);
  }
  // Card-style entrance: grows in with a small overshoot.
  pop(ranges, inner) {
    return this.vis(ranges, inner, { fade: 0.35, hide: 'opacity:0;transform:scale(.6)', show: 'opacity:1;transform:scale(1)', extra: 'animation-timing-function:cubic-bezier(.3,1.5,.6,1)' });
  }
  // The app's level change: ideas fade in rising slightly.
  rise(ranges, inner) {
    return this.vis(ranges, inner, { fade: 0.3, hide: 'opacity:0;transform:translateY(10px)', show: 'opacity:1;transform:translateY(0)' });
  }
  async svg(body) {
    // Collect the characters each family draws so the embedded fonts are subset to them.
    const chars = { dm: new Set(), sg: new Set(), mono: new Set() };
    for (const m of body.matchAll(/<text([^>]*)>([\s\S]*?)<\/text>/g)) {
      const fam = /class="[^"]*\bsg\b/.test(m[1]) ? 'sg' : /class="[^"]*\bmono\b/.test(m[1]) ? 'mono' : 'dm';
      for (const ch of m[2].replace(/<[^>]+>/g, '')) chars[fam].add(ch);
    }
    let faces = '';
    for (const k of Object.keys(chars)) if (chars[k].size) faces += await fontFaces(k, [...chars[k]].join(''));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${this.w} ${this.h}" width="${this.w}" height="${this.h}" role="img" aria-label="${this.title}">
<title>${this.title}</title>
<defs><pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M32 0H0V32" fill="none" stroke="${C.grid}" stroke-width="1.2"/></pattern></defs>
<style>
${faces}
text{font-family:'DM Sans',system-ui,-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;dominant-baseline:central}
.sg{font-family:'Space Grotesk','Helvetica Neue',Helvetica,Arial,sans-serif}
.mono{font-family:'Courier Prime','Courier New',monospace}
${this.css.join('\n')}
</style>
${body}
</svg>
`;
  }
}

const T = (x, y, s, o = {}) =>
  `<text x="${x}" y="${y}" font-size="${o.size || 18}" font-weight="${o.weight || 500}" fill="${o.fill || C.ink}" text-anchor="${o.anchor || 'middle'}"` +
  `${o.cls ? ` class="${o.cls}"` : ''}${o.style ? ` style="${o.style}"` : ''}${o.op !== undefined ? ` fill-opacity="${o.op}"` : ''}>${s}</text>`;

const tr = (x, y) => `transform:translate(${x}px,${y}px)`;
const dragTr = (x, y, r, s, op = 1) => `transform:translate(${x}px,${y}px) rotate(${r}deg) scale(${s});opacity:${op}`;

/* ------------------------------------------------------------------ app parts */
// A neobrutal block: hard shadow (offset + spread) under a bordered face.
const shadowRect = (x, y, w, h, off = 5, spread = 1.5, rx = 5) =>
  `<rect x="${x + off - spread}" y="${y + off - spread}" width="${w + spread * 2}" height="${h + spread * 2}" rx="${rx + 1}" fill="${C.ink}"/>`;
const faceRect = (x, y, w, h, fill, sw = 3.5, rx = 5) =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${C.ink}" stroke-width="${sw}"/>`;
const block = (x, y, w, h, fill, inner = '', o = {}) =>
  shadowRect(x, y, w, h, o.off ?? 4, o.spread ?? 1, o.rx ?? 5) + faceRect(x, y, w, h, fill, o.sw ?? 3, o.rx ?? 5) + inner;

const dots = (x, y, fill) => [0, 6, 12].map((dx) => `<circle cx="${x + dx}" cy="${y}" r="1.7" fill="${fill}"/>`).join('');

// Priority ribbon: hangs over the card's top edge (border-radius 6px 0 8px 8px in idea.scss).
function ribbon(x, y, prio) {
  const w = 17, h = [0, 34, 26, 18][prio], fill = [0, C.p1, C.p2, C.p3][prio];
  const p = (ox, oy) => `M${x + ox + 5} ${y + oy}H${x + ox + w}V${y + oy + h - 6}Q${x + ox + w} ${y + oy + h} ${x + ox + w - 6} ${y + oy + h}H${x + ox + 6}Q${x + ox} ${y + oy + h} ${x + ox} ${y + oy + h - 6}V${y + oy + 5}Q${x + ox} ${y + oy} ${x + ox + 5} ${y + oy}Z`;
  return `<path d="${p(2.5, 2.5)}" fill="${C.ink}"/><path d="${p(0, 0)}" fill="${fill}" stroke="${C.ink}" stroke-width="2.2"/>`;
}

const TEXT_ON = { parent: C.ink, leaf: C.ink, link: C.ink, checklist: C.white, note: C.white, vault: C.white };
const FILL = { parent: C.parent, leaf: C.leaf, link: C.link, checklist: C.checklist, note: C.note, vault: C.vault };

function lines(arr, x, y, gap, o) {
  const top = y - ((arr.length - 1) * gap) / 2;
  return arr.map((s, i) => T(x, top + i * gap, s, o)).join('');
}

function checkbox(x, y, checked, fill) {
  return checked
    ? `<rect x="${x}" y="${y - 6}" width="12" height="12" rx="2.5" fill="${C.white}" fill-opacity=".25" stroke="${C.white}" stroke-opacity=".6" stroke-width="1.4"/>` +
      `<path d="M${x + 2.6} ${y} l2.6 2.8 l4.4 -5.6" fill="none" stroke="${C.white}" stroke-opacity=".7" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>`
    : `<rect x="${x}" y="${y - 6}" width="12" height="12" rx="2.5" fill="${fill}" stroke="${C.white}" stroke-opacity=".85" stroke-width="1.6"/>`;
}

// What is drawn on a card's face for each node type (see IdeaNode.tsx).
function cardContent(c) {
  const { x, y, w, h, kind } = c;
  const ink = TEXT_ON[kind];
  const label = Array.isArray(c.label) ? c.label : [c.label];
  const pad = c.prio ? 12 : 0;
  let s = dots(x + w - 26, y + 14, ink);
  if (kind === 'parent' || kind === 'link') s += lines(label, x + w / 2 + pad / 2, y + h / 2 + 3, 26, { size: c.size || 22, fill: ink });
  if (kind === 'leaf') s += lines(label, x + 18 + pad, y + h / 2 + 3, 24, { size: c.size || 19, fill: ink, anchor: 'start' });
  if (kind === 'note') {
    s += T(x + 16 + pad, y + 20, label[0], { size: 15, weight: 700, fill: ink, anchor: 'start' }) +
      `<line x1="${x + 2}" y1="${y + 38}" x2="${x + w - 2}" y2="${y + 38}" stroke="${C.white}" stroke-opacity=".25" stroke-width="1.4"/>` +
      c.body.map((b, i) => T(x + 14, y + 58 + i * 18, b, { size: 13, weight: 400, fill: ink, anchor: 'start', cls: 'mono' })).join('');
  }
  if (kind === 'vault') {
    s += T(x + 14 + pad, y + 18, 'VAULT NOTE', { size: 9.5, weight: 800, fill: ink, anchor: 'start', op: 0.65, style: 'letter-spacing:1px' }) +
      T(x + 14 + pad, y + 36, label[0], { size: 14, weight: 700, fill: ink, anchor: 'start' }) +
      `<line x1="${x + 2}" y1="${y + 52}" x2="${x + w - 2}" y2="${y + 52}" stroke="${C.white}" stroke-opacity=".22" stroke-width="1.4"/>` +
      `<rect x="${x + 14}" y="${y + 64}" width="${w - 28}" height="30" rx="5" fill="${C.vaultSlot}" stroke="${C.ink}" stroke-width="2"/>` +
      [...Array(10)].map((_, i) => `<circle cx="${x + 28 + i * 11}" cy="${y + 79}" r="2.6" fill="${C.white}" fill-opacity=".9"/>`).join('') +
      `<rect x="${x + 14}" y="${y + 108}" width="76" height="22" rx="11" fill="${C.link}" stroke="${C.ink}" stroke-width="2"/>` +
      `<g transform="translate(${x + 22} ${y + 112}) scale(.6)" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/></g>` +
      T(x + 40, y + 119.5, 'Locked', { size: 11.5, weight: 800, anchor: 'start' });
  }
  if (kind === 'checklist') s += c.renderItems ? c.renderItems(c) : '';
  return s;
}

// A card as { shadow, face } so a scene can animate the press (face slides into the shadow).
function ideaCard(c) {
  const fill = FILL[c.kind];
  const shadow = shadowRect(c.x, c.y, c.w, c.h, 5, 1.5);
  let face = faceRect(c.x, c.y, c.w, c.h, fill) + cardContent(c);
  if (c.prio) face += ribbon(c.x + 6, c.y - 10, c.prio);
  return { shadow, face };
}
const card = (c) => { const k = ideaCard(c); return k.shadow + k.face; };

// The same card with the dashed "drop here" border dnd-kit shows on a target.
function dashedFace(c) {
  const fill = FILL[c.kind];
  return `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="5" fill="${fill}" stroke="${fill}" stroke-width="4.5"/>` +
    `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="5" fill="none" stroke="${C.ink}" stroke-width="3.5" stroke-dasharray="7 5"/>` + cardContent(c);
}

const ICON = {
  plus: (cx, cy) => `<path d="M${cx - 15} ${cy}H${cx + 15}M${cx} ${cy - 15}V${cy + 15}" stroke="${C.ink}" stroke-width="5"/>`,
  home: (cx, cy) => `<path d="M${cx - 11} ${cy - 1}L${cx} ${cy - 11}L${cx + 11} ${cy - 1}M${cx - 8} ${cy - 3.5}V${cy + 10}H${cx - 2.5}V${cy + 3}H${cx + 2.5}V${cy + 10}H${cx + 8}V${cy - 3.5}" fill="none" stroke="${C.ink}" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"/>`,
  search: (cx, cy) => `<circle cx="${cx - 3}" cy="${cy - 3}" r="7.5" fill="none" stroke="${C.ink}" stroke-width="3"/><path d="M${cx + 2.5} ${cy + 2.5}L${cx + 9} ${cy + 9}" stroke="${C.ink}" stroke-width="3.5" stroke-linecap="round"/>`,
  trash: (cx, cy) => `<g fill="none" stroke="${C.ink}" stroke-width="2.8" stroke-linejoin="round" stroke-linecap="round"><path d="M${cx - 14} ${cy - 12}H${cx + 14}M${cx - 5} ${cy - 12}V${cy - 16}H${cx + 5}V${cy - 12}"/><path d="M${cx - 11} ${cy - 8}L${cx - 9} ${cy + 15}H${cx + 9}L${cx + 11} ${cy - 8}Z"/><path d="M${cx - 4} ${cy - 3}V${cy + 10}M${cx + 4} ${cy - 3}V${cy + 10}"/></g>`,
  profile: (cx, cy) => `<circle cx="${cx}" cy="${cy - 6}" r="6.5" fill="${C.ink}"/><path d="M${cx - 12} ${cy + 12}Q${cx - 12} ${cy + 2} ${cx} ${cy + 2}Q${cx + 12} ${cy + 2} ${cx + 12} ${cy + 12}Z" fill="${C.ink}"/>`,
  palette: (cx, cy) => `<path d="M${cx} ${cy - 8}a8 8 0 1 0 0 16c2 0 2-2 1-3s0-3 2-3h2a3 3 0 0 0 3-3a7.5 7.5 0 0 0-8-7z" fill="${C.ink}"/>` +
    [[-4, -2], [-1, -5], [3, -4]].map(([dx, dy]) => `<circle cx="${cx + dx}" cy="${cy + dy}" r="1.4" fill="${C.panel}"/>`).join(''),
  help: (cx, cy) => T(cx, cy + 1, '?', { size: 22, weight: 900 }),
  notes: (cx, cy) => `<rect x="${cx - 8}" y="${cy - 9}" width="16" height="18" rx="2" fill="none" stroke="${C.ink}" stroke-width="2.4"/><path d="M${cx - 4.5} ${cy - 4}H${cx + 4.5}M${cx - 4.5} ${cy}H${cx + 4.5}M${cx - 4.5} ${cy + 4}H${cx + 4.5}" stroke="${C.ink}" stroke-width="2"/>`,
  map: (cx, cy) => `<g fill="${C.ink}"><rect x="${cx - 3.5}" y="${cy - 6}" width="7" height="4.5" rx="1"/><rect x="${cx - 8}" y="${cy + 2}" width="6.5" height="4.5" rx="1"/><rect x="${cx + 1.5}" y="${cy + 2}" width="6.5" height="4.5" rx="1"/></g><path d="M${cx} ${cy - 1.5}V${cy}M${cx - 4.75} ${cy + 2}V${cy}H${cx + 4.75}V${cy + 2}" stroke="${C.ink}" stroke-width="1.4" fill="none"/>`,
  back: (x, cy) => `<path d="M${x + 13} ${cy}H${x}M${x + 5} ${cy - 5}L${x} ${cy}L${x + 5} ${cy + 5}" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`,
  sort: (x, cy) => `<path d="M${x + 2} ${cy - 5}V${cy + 5}M${x - 0.5} ${cy + 2.5}L${x + 2} ${cy + 5}L${x + 4.5} ${cy + 2.5}M${x + 8} ${cy + 5}V${cy - 5}M${x + 5.5} ${cy - 2.5}L${x + 8} ${cy - 5}L${x + 10.5} ${cy - 2.5}" fill="none" stroke="${C.ink}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>`,
  copy: (x, cy) => `<rect x="${x + 2.5}" y="${cy - 3}" width="7" height="8" rx="1.5" fill="none" stroke="${C.ink}" stroke-width="1.6"/><path d="M${x} ${cy + 2}V${cy - 5}H${x + 6.5}" fill="none" stroke="${C.ink}" stroke-width="1.6"/>`,
};

const CURSOR = `<path d="M0 0v25.6l7.2-6.4 5.6 12.8 4.8-2.2-5.6-12.5 9.6-.5z" fill="${C.white}" stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round"/>`;
// A click: a ring that spreads from the pointer's tip and fades.
function ripple(d, times) {
  const steps = [[0, 'opacity:0;transform:scale(.3)']];
  for (const t of times) steps.push([t, 'opacity:0;transform:scale(.3)'], [t + 0.05, 'opacity:.9;transform:scale(.4)'], [t + 0.5, 'opacity:0;transform:scale(1.4)']);
  return d.g(steps, `<circle cx="0" cy="0" r="18" fill="none" stroke="${C.ink}" stroke-width="2.5"/>`);
}

// The browser window the app runs in: address bar, grid-paper page.
const WIN = { x: 12, y: 12, w: 968, h: 548 };
function browser(urlText) {
  const { x, y, w, h } = WIN;
  return `<clipPath id="win"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14"/></clipPath>` +
    `<rect x="${x + 8}" y="${y + 8}" width="${w}" height="${h}" rx="14" fill="${C.ink}"/>` +
    `<g clip-path="url(#win)"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${C.bg}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="url(#grid)"/>` +
    `<rect x="${x}" y="${y}" width="${w}" height="42" fill="${C.panel}"/><line x1="${x}" y1="${y + 42}" x2="${x + w}" y2="${y + 42}" stroke="${C.ink}" stroke-width="3"/></g>` +
    [C.danger, C.link, C.leaf].map((f, i) => `<circle cx="${x + 24 + i * 20}" cy="${y + 21}" r="6.5" fill="${f}" stroke="${C.ink}" stroke-width="2"/>`).join('') +
    `<rect x="${x + 96}" y="${y + 9}" width="340" height="24" rx="12" fill="${C.white}" stroke="${C.ink}" stroke-width="2"/>` +
    T(x + 114, y + 21.5, urlText, { size: 13, weight: 500, anchor: 'start', fill: '#444' });
}
const browserBorder = () => `<rect x="${WIN.x}" y="${WIN.y}" width="${WIN.w}" height="${WIN.h}" rx="14" fill="none" stroke="${C.ink}" stroke-width="4"/>`;

// Left and right sidebars plus the trash (Idea.tsx desktop layout).
function sidebars(d, homeSteps) {
  const sq = (x, y, s, fill, icon) => block(x, y, s, s, fill, icon(x + s / 2, y + s / 2), { off: 4, spread: 1.2 });
  const home = homeSteps ? d.g(homeSteps, sq(38, 144, 46, C.home, ICON.home)) : sq(38, 144, 46, C.home, ICON.home);
  return sq(34, 72, 54, C.leaf, ICON.plus) + home + sq(40, 208, 42, C.panel, ICON.search) +
    sq(924, 72, 44, C.panel, ICON.profile) + sq(928, 132, 36, C.panel, ICON.palette) + sq(928, 182, 36, C.panel, ICON.help) + sq(928, 232, 36, C.panel, ICON.notes);
}
const trashBin = () => block(34, 476, 58, 58, C.danger, ICON.trash(63, 507), { off: 4, spread: 1.2 });

// Breadcrumb chip (Breadcrumb.tsx): neutral pill with the ancestor's name.
const crumb = (x, label, w) => block(x, 76, w, 24, C.panel, T(x + w / 2, 88.5, label, { size: 14, weight: 600 }), { off: 2, spread: 0.6, sw: 2, rx: 4 });
const mapChip = (x) => block(x, 77, 28, 22, C.pink, ICON.map(x + 14, 88), { off: 2, spread: 0.6, sw: 2, rx: 4 });
const chev = (x) => T(x, 88.5, '›', { size: 15, weight: 600, fill: '#555' });

// Root title card and the buttons beside it (RootTitle.tsx).
const TITLE = { x: 388, y: 110, w: 224, h: 90 };
const titleShell = () => shadowRect(TITLE.x, TITLE.y, TITLE.w, TITLE.h, 5, 1.5) + faceRect(TITLE.x, TITLE.y, TITLE.w, TITLE.h, C.root);
const titleText = (s) => T(TITLE.x + TITLE.w / 2, TITLE.y + TITLE.h / 2 + 2, s, { size: 34, weight: 400 });
const sideBtn = (y, h, fill, icon, label, o = {}) =>
  block(262, y, 110, h, fill, icon(o.ix ?? 284, y + h / 2) + T(o.tx ?? 305, y + h / 2 + 1, label, { size: o.size ?? 13, weight: o.weight ?? 700, anchor: 'start' }), { off: 3.5, spread: 1 });
const backBtn = () => sideBtn(110, 30, C.back, ICON.back, 'Back', { size: 15, weight: 500, ix: 282, tx: 302 });
const priorityBtn = () => sideBtn(148, 28, C.gold, ICON.sort, 'Priority', { ix: 280, tx: 297 });
const copyBtn = () => sideBtn(184, 28, C.leaf, ICON.copy, 'Copy all', { ix: 281, tx: 297 });

function toast(d, ranges, msg, w) {
  const x = 500 - w / 2, y = 488;
  return d.vis(ranges, block(x, y, w, 46, C.bg, T(x + 20, y + 23.5, msg, { size: 16, weight: 600, anchor: 'start' }) +
    block(x + w - 82, y + 9, 68, 28, C.link, T(x + w - 48, y + 23.5, 'Undo', { size: 15, weight: 700 }), { off: 3, spread: 0.8, sw: 2.5 }),
  { off: 5, spread: 1.5, sw: 3.5 }), { fade: 0.25, hide: 'opacity:0;transform:translateY(16px)', show: 'opacity:1;transform:translateY(0)' });
}

const COLS = [124, 318, 512, 706];
const ROW1 = 248, ROW2 = 372, CW = 170, CH = 88;

/* ------------------------------------------------------------------ hero */
async function hero() {
  const D = 8.3;
  const d = new Doc(900, 340, D, 'Intraconnected: plant a node, grow an idea');
  const FADE = 7.3;
  // The landing page's hero mind map (MindMapHeroAnimation.tsx), same coordinates and timing.
  const nodes = [
    { x: 271, y: 33, w: 122, h: 42, fill: C.root, label: 'Ideas', fs: 16, tf: C.white, t: 0.2 },
    { x: 115, y: 143, w: 112, h: 42, fill: C.parent, label: 'Music', fs: 15, t: 1.25 },
    { x: 362, y: 143, w: 132, h: 42, fill: C.parent, label: 'Projects', fs: 15, t: 1.36 },
    { x: 523, y: 143, w: 122, h: 42, fill: C.parent, label: 'Writing', fs: 15, t: 1.47 },
    { x: 18, y: 274, w: 134, h: 100, fill: C.note, kind: 'note', t: 2.56 },
    { x: 192, y: 274, w: 130, h: 100, fill: C.vault, kind: 'vault', t: 2.68 },
    { x: 362, y: 274, w: 132, h: 88, fill: C.checklist, kind: 'todo', t: 2.77 },
    { x: 528, y: 274, w: 112, h: 42, fill: C.parent, label: 'Inspiration', fs: 14, t: 2.86 },
    { x: 519, y: 358, w: 130, h: 38, fill: C.link, label: 'Jurassic Park', fs: 13, arrow: true, t: 3.2 },
  ];
  const links = [
    ['M 332,75 C 332,109 171,109 171,143', 2.5, 0.7], ['M 332,75 C 332,109 428,109 428,143', 2.5, 0.86],
    ['M 332,75 C 332,109 584,109 584,143', 2.5, 1.02], ['M 171,185 C 171,229 85,229 85,274', 2, 1.95],
    ['M 171,185 C 171,229 257,229 257,274', 2, 2.08], ['M 428,185 L 428,274', 2, 2.18],
    ['M 584,185 L 584,274', 2, 2.28], ['M 584,316 L 584,358', 2, 3.05],
  ];
  const W = { fill: C.white };
  const contents = (n) => {
    if (n.kind === 'note') return T(n.x + 10, n.y + 17, 'Song idea', { ...W, size: 13, weight: 700, anchor: 'start', cls: 'sg' }) +
      `<line x1="${n.x}" y1="${n.y + 32}" x2="${n.x + n.w}" y2="${n.y + 32}" stroke="#fff" stroke-opacity=".25"/>` +
      ['Open with a', 'slow riff, then', 'drop the beat.'].map((s, i) => T(n.x + 10, n.y + 48 + i * 15, s, { ...W, size: 10.5, weight: 400, anchor: 'start', cls: 'mono' })).join('');
    if (n.kind === 'vault') return T(n.x + 10, n.y + 13, 'VAULT NOTE', { ...W, size: 7.5, weight: 700, anchor: 'start', cls: 'sg', op: 0.65, style: 'letter-spacing:.8px' }) +
      T(n.x + 10, n.y + 27, 'FL Studio Password', { ...W, size: 10.5, weight: 700, anchor: 'start', cls: 'sg' }) +
      `<line x1="${n.x}" y1="${n.y + 38}" x2="${n.x + n.w}" y2="${n.y + 38}" stroke="#fff" stroke-opacity=".22"/>` +
      `<rect x="${n.x + 10}" y="${n.y + 46}" width="${n.w - 20}" height="22" rx="4" fill="${C.vaultSlot}" stroke="${C.ink}" stroke-width="1.5"/>` +
      [...Array(8)].map((_, i) => `<circle cx="${n.x + 21 + i * 9}" cy="${n.y + 57}" r="2" fill="#fff" fill-opacity=".9"/>`).join('') +
      `<rect x="${n.x + 11}" y="${n.y + 77}" width="58" height="16" rx="8" fill="${C.link}" stroke="${C.ink}" stroke-width="1.5"/>` +
      `<g transform="translate(${n.x + 17} ${n.y + 79.5}) scale(.46)" fill="none" stroke="${C.ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/></g>` +
      T(n.x + 31, n.y + 85.5, 'Locked', { size: 9, weight: 700, anchor: 'start', cls: 'sg' });
    if (n.kind === 'todo') {
      const x = n.x + 8, y = n.y;
      return `<rect x="${x + 0}" y="${y + 9}" width="11" height="11" rx="2" stroke="#fff" stroke-width="1.5" fill="none"/>` +
        `<path d="M${x + 2} ${y + 14} l3 3 l4 -6" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>` +
        T(x + 15, y + 15, 'To-Do List', { ...W, size: 13, weight: 700, anchor: 'start', cls: 'sg' }) +
        `<line x1="${n.x}" y1="${y + 27}" x2="${n.x + n.w}" y2="${y + 27}" stroke="#fff" stroke-opacity=".25"/>` +
        `<rect x="${x}" y="${y + 33}" width="10" height="10" rx="2" fill="#fff" fill-opacity=".25" stroke="#fff" stroke-opacity=".6"/>` +
        `<path d="M${x + 2} ${y + 38} l2.5 2.5 l3.5 -5" stroke="#fff" stroke-opacity=".6" stroke-width="1.2" stroke-linecap="round" fill="none"/>` +
        T(x + 14, y + 38, 'Buy domain', { ...W, size: 11, weight: 500, anchor: 'start', cls: 'sg', op: 0.42 }) +
        ['Design logo', 'Ship MVP'].map((s, i) => `<rect x="${x}" y="${y + 48 + i * 15}" width="10" height="10" rx="2" fill="none" stroke="#fff" stroke-opacity=".75"/>` +
          T(x + 14, y + 53 + i * 15, s, { ...W, size: 11, weight: 500, anchor: 'start', cls: 'sg' })).join('');
    }
    const cx = n.x + n.w / 2 - (n.arrow ? 9 : 0), cy = n.y + n.h / 2;
    let s = T(cx, cy + 0.5, n.label, { size: n.fs, weight: 700, fill: n.tf || C.ink, cls: 'sg' });
    if (n.arrow) {
      const ax = n.x + n.w, ay = cy;
      s += `<path d="M${ax - 22} ${ay + 4}L${ax - 12} ${ay - 5}M${ax - 20} ${ay - 5}L${ax - 12} ${ay - 5}L${ax - 12} ${ay + 3}" stroke="${C.ink}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/>`;
    }
    return s;
  };
  let map = '';
  for (const [p, sw, t] of links) {
    map += d.g([[0, 'stroke-dashoffset:1;opacity:1'], [t, 'stroke-dashoffset:1;opacity:1'], [t + 0.5, 'stroke-dashoffset:0;opacity:1'],
      [FADE, 'stroke-dashoffset:0;opacity:1'], [FADE + 0.6, 'stroke-dashoffset:0;opacity:0']],
    `<path d="${p}" pathLength="1" stroke-dasharray="1" stroke="${C.ink}" stroke-width="${sw}" fill="none" stroke-linecap="round"/>`);
  }
  for (const n of nodes) {
    map += d.g([[0, 'opacity:0;transform:scale(.5)'], [n.t, 'opacity:0;transform:scale(.5)'], [n.t + 0.45, 'opacity:1;transform:scale(1)'],
      [FADE, 'opacity:1;transform:scale(1)'], [FADE + 0.6, 'opacity:0;transform:scale(.96)']],
    `<rect x="${n.x + 3}" y="${n.y + 3}" width="${n.w}" height="${n.h}" rx="7" fill="${C.ink}"/>` +
      `<rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="7" fill="${n.fill}" stroke="${C.ink}" stroke-width="2.5"/>` + contents(n),
    'animation-timing-function:cubic-bezier(.3,1.45,.6,1)');
  }

  // Brand mark + wordmark (BrandLogo.tsx), then the landing headline (Landing.tsx heroMark).
  const mark = `<g transform="translate(40 30) scale(.8)"><path d="M26 15.5V21H12.5V27M26 15.5V21H39.5V27" fill="none" stroke="${C.ink}" stroke-width="2.6" stroke-linejoin="round"/>` +
    [[15.5, 2, 21, C.root], [2, 27, 19, C.parent], [31, 27, 19, C.leaf]].map(([x, y, w, f]) =>
      `<rect x="${x + 2}" y="${y + 2}" width="${w}" height="13" rx="4.5" fill="${C.ink}"/><rect x="${x}" y="${y}" width="${w}" height="13" rx="4.5" fill="${f}" stroke="${C.ink}" stroke-width="2.2"/>`).join('') + '</g>';
  const word = T(88, 48, 'Intraconnected', { size: 24, weight: 850, anchor: 'start', style: 'letter-spacing:-1px' });
  const tag = (x, y, w, h, fill, rot, inner) =>
    `<g transform="rotate(${rot} ${x + w / 2} ${y + h / 2})"><rect x="${x + 4}" y="${y + 4}" width="${w}" height="${h}" rx="5" fill="${C.ink}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="5" fill="${fill}" stroke="${C.ink}" stroke-width="2.5"/>${inner}</g>`;
  const headline =
    tag(44, 92, 312, 58, C.leaf, -1.5, T(58, 121, 'Plant a node.', { size: 44, weight: 700, anchor: 'start', cls: 'sg', style: 'letter-spacing:-1.2px' })) +
    tag(34, 158, 370, 66, C.parent, 1, T(50, 191, 'Grow an <tspan font-style="italic">idea.</tspan>', { size: 50, weight: 700, anchor: 'start', cls: 'sg', style: 'letter-spacing:-1.4px' }));
  const sub = ['Start with a rough thought. Break it into parts,', 'add the to-dos and the links, and keep it all', 'on one tree.']
    .map((s, i) => T(44, 258 + i * 24, s, { size: 16, weight: 500, anchor: 'start', fill: '#333', cls: 'sg' })).join('');

  const body = `<clipPath id="card"><rect width="900" height="340" rx="18"/></clipPath>` +
    `<g clip-path="url(#card)"><rect width="900" height="340" fill="${C.bg}"/><rect width="900" height="340" fill="url(#grid)"/></g>` +
    `<rect x="2" y="2" width="896" height="336" rx="16" fill="none" stroke="${C.ink}" stroke-width="4"/>` +
    mark + word + headline + sub +
    `<rect x="452" y="22" width="430" height="296" rx="10" fill="${C.bg}" stroke="${C.ink}" stroke-width="3"/>` +
    `<rect x="452" y="22" width="430" height="296" rx="10" fill="url(#grid)"/>` +
    `<g transform="translate(460 34) scale(.625)">${map}</g>`;
  fs.writeFileSync(path.join(OUT, 'hero.svg'), await d.svg(body));
}

/* ------------------------------------------------------------------ zoom */
async function zoom() {
  const D = 10;
  const d = new Doc(1000, 572, D, 'Clicking the Travel idea zooms into it, and Home takes you back out');
  const at = (col, row, kind, label, o = {}) => ({ x: COLS[col], y: row, w: CW, h: CH, kind, label, ...o });

  // Level A: the root, "Ideas".
  const A = [
    at(0, ROW1, 'parent', 'Travel', { prio: 2 }), at(1, ROW1, 'parent', 'Work'),
    at(2, ROW1, 'link', 'Reading list'), at(3, ROW1, 'leaf', 'Buy milk'), at(0, ROW2, 'parent', 'Weekend', { prio: 3 }),
  ];
  const OUT_A = 2.45, IN_A = 6.15;
  const travel = ideaCard(A[0]);
  const press = (t0, t1) => d.g([[0, tr(0, 0)], [t0, tr(0, 0)], [t0 + 0.15, tr(5, 5)], [t1, tr(5, 5)], [t1 + 0.05, tr(0, 0)]], travel.face);
  const pressShadow = (t0, t1) => d.g([[0, 'opacity:1'], [t0, 'opacity:1'], [t0 + 0.15, 'opacity:0'], [t1, 'opacity:0'], [t1 + 0.05, 'opacity:1']], travel.shadow);
  const levelA = d.rise([[-1, OUT_A]], pressShadow(1.55, 2.8) + press(1.55, 2.8)) +
    A.slice(1).map((c, i) => d.rise([[-1, OUT_A]], card(c))).join('');
  const levelAIn = A.map((c) => card(c));

  // Level B: inside "Travel".
  const packing = at(2, ROW1, 'checklist', 'Packing', { h: 150 });
  packing.renderItems = (c) => {
    const x = c.x, y = c.y;
    return T(x + 16, y + 20, 'Packing', { size: 15, weight: 700, fill: C.white, anchor: 'start' }) +
      `<rect x="${x + 14}" y="${y + 40}" width="${c.w - 56}" height="5" rx="2.5" fill="${C.white}" fill-opacity=".25"/><rect x="${x + 14}" y="${y + 40}" width="${(c.w - 56) / 3}" height="5" rx="2.5" fill="${C.white}"/>` +
      T(x + c.w - 16, y + 43, '1/3', { size: 12, weight: 700, fill: C.white, anchor: 'end' }) +
      [['Passport', true], ['Charger', false], ['Adapter', false]].map(([s, ch], i) => checkbox(x + 16, y + 68 + i * 24, ch, C.checklist) +
        T(x + 36, y + 68 + i * 24, s, { size: 13.5, weight: 600, fill: C.white, anchor: 'start', op: ch ? 0.45 : 1, style: ch ? 'text-decoration:line-through' : '' })).join('');
  };
  const B = [at(0, ROW1, 'parent', 'Japan', { prio: 1 }), at(1, ROW1, 'leaf', 'Book flights'), packing, at(3, ROW1, 'link', 'Hotel ideas')];
  const levelB = B.map((c, i) => d.rise([[2.85 + i * 0.09, 5.75]], card(c))).join('');
  const levelA2 = levelAIn.map((s, i) => d.rise([[IN_A + i * 0.08, D]], s)).join('');

  const nested = [[2.6, 5.8]];
  const crumbs = mapChip(388) + d.vis(nested, chev(426) + crumb(436, 'Ideas', 56) + chev(504));
  const title = titleShell() + d.vis([[-1, 2.45], [5.95, D]], titleText('Ideas'), { fade: 0.2 }) + d.vis([[2.55, 5.8]], titleText('Travel'), { fade: 0.2 });
  const side = d.vis(nested, backBtn()) + priorityBtn() + copyBtn();

  // Home is grayed out at the top level; pressing it returns to the root.
  const homeSteps = [[0, 'opacity:.4;transform:translate(0,0)'], [2.6, 'opacity:.4;transform:translate(0,0)'], [2.85, 'opacity:1;transform:translate(0,0)'],
    [5.0, 'opacity:1;transform:translate(0,0)'], [5.12, 'opacity:1;transform:translate(4px,4px)'], [5.35, 'opacity:1;transform:translate(0,0)'],
    [5.8, 'opacity:1;transform:translate(0,0)'], [6.05, 'opacity:.4;transform:translate(0,0)']];

  const cursor = d.g([
    [0, tr(700, 520)], [1.5, tr(209, 292)], [2.9, tr(209, 292)], [4.7, tr(61, 167)], [5.6, tr(61, 167)], [7.6, tr(700, 520)],
  ], ripple(d, [2.2, 5.1]) + CURSOR);

  const body = browser('intraconnected.app/main') + sidebars(d, homeSteps) + trashBin() + crumbs + side + title +
    levelA + levelB + levelA2 + cursor + browserBorder();
  fs.writeFileSync(path.join(OUT, 'zoom.svg'), await d.svg(body));
}

/* ------------------------------------------------------------------ drag */
async function drag() {
  const D = 12;
  const d = new Doc(1000, 572, D, 'Dragging Recipes onto Cooking moves it underneath, and dragging Old draft to the trash deletes it');
  const RESET = 10.9; // every card is back in place while the scene is faded out
  const at = (col, kind, label, o = {}) => ({ x: COLS[col], y: ROW1, w: CW, h: CH, kind, label, ...o });

  const cookingLeaf = at(0, 'leaf', 'Cooking');
  const cookingParent = at(0, 'parent', 'Cooking');
  const garden = at(1, 'parent', 'Garden', { prio: 3 });
  const recipes = at(2, 'leaf', 'Recipes');
  const oldDraft = at(3, 'leaf', 'Old draft');
  const other = [at(0, 'link', 'Seed catalog'), at(1, 'parent', 'Pantry', { prio: 2 })].map((c) => ({ ...c, y: ROW2 }));

  // Cooking: a leaf until Recipes lands on it, then a parent (blue). Dashed while hovered.
  const cooking =
    d.vis([[-1, 3.45], [RESET, D]], card(cookingLeaf), { fade: 0.2 }) +
    d.vis([[3.45, RESET - 0.05]], card(cookingParent), { fade: 0.2 }) +
    d.vis([[2.75, 3.4]], shadowRect(cookingLeaf.x, cookingLeaf.y, CW, CH, 5, 1.5) + dashedFace(cookingLeaf), { fade: 0.1 });

  const recipesDrag = d.g([
    [0, dragTr(0, 0, 0, 1)], [1.6, dragTr(0, 0, 0, 1)], [1.8, dragTr(0, 0, -3, 0.9)], [3.1, dragTr(-388, 0, -3, 0.9)], [3.4, dragTr(-388, 0, -3, 0.9)],
    [3.65, dragTr(-388, 0, 0, 0.3, 0)], [RESET - 0.05, dragTr(-388, 0, 0, 0.3, 0)], [RESET, dragTr(0, 0, 0, 1)],
  ], card(recipes));

  const oldDraftDrag = d.g([
    [0, dragTr(0, 0, 0, 1)], [3.7, dragTr(0, 0, 0, 1)], [4.1, dragTr(-194, 0, 0, 1)], [5.0, dragTr(-194, 0, 0, 1)], [5.2, dragTr(-194, 0, 3, 0.9)],
    [6.8, dragTr(-728, 217, 3, 0.9)], [7.4, dragTr(-728, 217, 3, 0.75)], [7.65, dragTr(-728, 217, 0, 0.2, 0)],
    [RESET - 0.05, dragTr(-728, 217, 0, 0.2, 0)], [RESET, dragTr(0, 0, 0, 1)],
  ], card(oldDraft));

  // Trash.tsx: grows and lifts while something is held over it.
  const trash = d.g([[0, 'transform:translateY(0) scale(1)'], [6.6, 'transform:translateY(0) scale(1)'], [6.85, 'transform:translateY(-8px) scale(1.2)'],
    [7.5, 'transform:translateY(-8px) scale(1.2)'], [7.75, 'transform:translateY(0) scale(1)']], trashBin());

  const cards = d.vis([[-1, 10.45], [11.3, D]], cooking + card(garden) + other.map(card).join('') + oldDraftDrag + recipesDrag, { fade: 0.35 });

  const cursor = d.g([
    [0, tr(700, 520)], [1.3, tr(597, 292)], [1.75, tr(597, 292)], [3.1, tr(209, 292)], [3.5, tr(209, 292)], [4.6, tr(597, 292)],
    [5.05, tr(597, 292)], [6.8, tr(63, 509)], [7.6, tr(63, 509)], [9.0, tr(700, 520)],
  ], CURSOR);

  const body = browser('intraconnected.app/main?idea=kitchen') + sidebars(d) + trash +
    mapChip(388) + chev(426) + crumb(436, 'Ideas', 56) + chev(504) +
    backBtn() + priorityBtn() + copyBtn() + titleShell() + titleText('Kitchen') +
    cards + toast(d, [[3.6, 5.1]], 'Moved “Recipes” to “Cooking”', 330) + toast(d, [[7.8, 10.0]], 'Deleted “Old draft”', 250) +
    cursor + browserBorder();
  fs.writeFileSync(path.join(OUT, 'drag.svg'), await d.svg(body));
}

/* ----------------------------------------------------------------- types */
async function types() {
  const D = 10;
  const d = new Doc(1000, 600, D, 'Six kinds of nodes: parents, ideas, links, checklists, notes and vault notes, with priority ribbons');
  const END = 9.2;
  const xs = [90, 380, 670], W = 240;
  const cap = (i, y, a, b) => T(xs[i] + W / 2, y, a, { size: 19, weight: 700 }) + T(xs[i] + W / 2, y + 24, b, { size: 15, weight: 500, fill: C.muted });

  const r1 = 72, r2 = 296;
  const parent = { x: xs[0], y: r1, w: W, h: 96, kind: 'parent', label: 'Projects', size: 26 };
  const leaf = { x: xs[1], y: r1, w: W, h: 96, kind: 'leaf', label: ['Record a thirty', 'second demo.'], size: 19 };
  const link = { x: xs[2], y: r1, w: W, h: 96, kind: 'link', label: 'Read the brief', size: 22 };
  const note = { x: xs[1], y: r2, w: W, h: 130, kind: 'note', label: 'Pitch notes', body: ['One map for the whole', 'plan. Start with the big', 'idea, then zoom in.'] };
  const vault = { x: xs[2], y: r2, w: W, h: 142, kind: 'vault', label: 'Router password' };

  // Checklist: ticks two items off while the bar and count follow.
  const items = ['Draft the post', 'Record a demo', 'Email the beta list', 'Post to the forum'];
  const tickAt = [null, null, 4.0, 5.0]; // first two start checked
  const checklist = { x: xs[0], y: r2, w: W, h: 200, kind: 'checklist' };
  checklist.renderItems = (c) => {
    const x = c.x, y = c.y, bw = c.w - 64;
    const counts = [['2/4', -1, 4.0], ['3/4', 4.0, 5.0], ['4/4', 5.0, END + 1]];
    let s = T(x + 16, y + 22, 'Launch checklist', { size: 15, weight: 700, fill: C.white, anchor: 'start' }) +
      `<rect x="${x + 14}" y="${y + 44}" width="${bw}" height="5" rx="2.5" fill="${C.white}" fill-opacity=".25"/>` +
      d.g([[0, 'transform:scaleX(.5)'], [4.0, 'transform:scaleX(.5)'], [4.3, 'transform:scaleX(.75)'], [5.0, 'transform:scaleX(.75)'], [5.3, 'transform:scaleX(1)'], [END, 'transform:scaleX(1)'], [END + 0.4, 'transform:scaleX(.5)']],
        `<rect x="${x + 14}" y="${y + 44}" width="${bw}" height="5" rx="2.5" fill="${C.white}"/>`, 'transform-origin:left') +
      counts.map(([txt, a, b]) => d.vis([[a, b]], T(x + c.w - 16, y + 47, txt, { size: 12, weight: 700, fill: C.white, anchor: 'end' }), { fade: 0.15 })).join('');
    items.forEach((it, i) => {
      const iy = y + 76 + i * 26;
      const done = checkbox(x + 16, iy, true, C.checklist) + T(x + 36, iy, it, { size: 13.5, weight: 600, fill: C.white, anchor: 'start', op: 0.45, style: 'text-decoration:line-through' });
      const open = checkbox(x + 16, iy, false, C.checklist) + T(x + 36, iy, it, { size: 13.5, weight: 600, fill: C.white, anchor: 'start' });
      s += tickAt[i] === null ? done : d.vis([[-1, tickAt[i]], [END + 0.3, D]], open, { fade: 0.15 }) + d.vis([[tickAt[i], END + 0.3]], done, { fade: 0.15 });
    });
    s += `<line x1="${x + 2}" y1="${y + c.h - 30}" x2="${x + c.w - 2}" y2="${y + c.h - 30}" stroke="${C.white}" stroke-opacity=".25" stroke-width="1.4"/>` +
      T(x + 14, y + c.h - 15, '+ Add item', { size: 13, weight: 500, fill: C.white, anchor: 'start', op: 0.55 });
    return s;
  };

  // Ribbons drop in after the cards (ribbon-drop in idea.scss: a little stretch, then settle).
  const drop = (t0, inner) => d.g([[0, 'opacity:0;transform:scaleY(0)'], [t0, 'opacity:0;transform:scaleY(0)'], [t0 + 0.15, 'opacity:1;transform:scaleY(1.2)'],
    [t0 + 0.35, 'opacity:1;transform:scaleY(1)'], [END, 'opacity:1;transform:scaleY(1)'], [END + 0.3, 'opacity:0;transform:scaleY(1)']], inner, 'transform-origin:top');
  const withRibbon = (c, prio) => ({ ...c, prio });
  // Cards are drawn with the padding a ribbon leaves, the ribbon itself animates separately.
  const pc = (c, prio, t) => {
    const face = faceRect(c.x, c.y, c.w, c.h, FILL[c.kind]) + cardContent(withRibbon(c, prio));
    return shadowRect(c.x, c.y, c.w, c.h, 5, 1.5) + face + drop(t, ribbon(c.x + 6, c.y - 10, prio));
  };
  const show = (t) => [[t, END]];

  const body = `<clipPath id="card"><rect width="1000" height="600" rx="18"/></clipPath>` +
    `<g clip-path="url(#card)"><rect width="1000" height="600" fill="${C.bg}"/><rect width="1000" height="600" fill="url(#grid)"/></g>` +
    `<rect x="2" y="2" width="996" height="596" rx="16" fill="none" stroke="${C.ink}" stroke-width="4"/>` +
    d.pop(show(0.3), pc(parent, 1, 2.2) + cap(0, r1 + 128, 'Parent', 'click to zoom in')) +
    d.pop(show(0.5), pc(leaf, 2, 2.4) + cap(1, r1 + 128, 'Idea', 'a single thought')) +
    d.pop(show(0.7), pc(link, 3, 2.6) + cap(2, r1 + 128, 'Link', 'opens its web page')) +
    d.pop(show(1.0), card(checklist) + cap(0, r2 + 232, 'Checklist', 'tick things off')) +
    d.pop(show(1.2), card(note) + cap(1, r2 + 162, 'Note', 'a title and longer text')) +
    d.pop(show(1.4), card(vault) + cap(2, r2 + 174, 'Vault note', 'locked with its own passphrase'));
  fs.writeFileSync(path.join(OUT, 'types.svg'), await d.svg(body));
}

(async () => {
  await hero(); await zoom(); await drag(); await types();
  for (const f of fs.readdirSync(OUT).filter((f) => f.endsWith('.svg'))) console.log(`wrote ${f} (${Math.round(fs.statSync(path.join(OUT, f)).size / 1024)} KB)`);
})();

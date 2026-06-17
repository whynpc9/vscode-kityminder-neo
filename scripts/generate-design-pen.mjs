#!/usr/bin/env node
/**
 * Generates design.pen with literal pixel values (Pencil-compatible).
 * Two screens side-by-side: current UI + optimized proposal.
 */
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'design.pen');

// ── Design tokens (inlined as literals in output) ─────────────────
const C = {
  nearBlack: '#141413',
  terracotta: '#c96442',
  coral: '#d97757',
  parchment: '#f5f4ed',
  ivory: '#faf9f5',
  white: '#ffffff',
  warmSand: '#e8e6dc',
  charcoal: '#4d4c48',
  olive: '#5e5d59',
  stone: '#87867f',
  warmSilver: '#b0aea5',
  borderCream: '#f0eee6',
  borderWarm: '#e8e6dc',
  error: '#b53333',
};

const SW = 1280;
const SH = 800;
const HEADER_H = 42;
const TOOLBAR_H = 38;
const BAR_H = 48;
const SIDEBAR_W = 280;
const SIDEBAR_OPT_W = 240;
const MAIN_H = SH - HEADER_H - TOOLBAR_H - 2; // borders
const MAIN_OPT_H = SH - BAR_H - 1;

function T(id, content, o = {}) {
  const n = {
    type: 'text',
    id,
    textGrowth: o.fixed ? 'fixed-width' : 'auto',
    content,
    fontSize: o.size ?? 12,
    fontWeight: o.bold ? '700' : o.semibold ? '600' : '500',
    fill: o.color ?? C.nearBlack,
    fontFamily: o.serif ? 'Georgia' : 'system-ui',
  };
  if (o.fixed) n.width = o.w ?? 200;
  return n;
}

function R(id, w, h, o = {}) {
  return {
    type: 'rectangle',
    id,
    width: w,
    height: h,
    cornerRadius: o.r ?? 0,
    fill: o.fill ?? C.borderCream,
  };
}

function hBar(id, inner, totalH) {
  return {
    type: 'frame',
    id,
    layout: 'vertical',
    width: SW,
    height: totalH + 1,
    children: [inner, R(`${id}-border`, SW, 1, { fill: C.borderCream })],
  };
}

function btn(id, label, o = {}) {
  const w = o.icon ? 28 : Math.max(28, label.length * 12 + 16);
  return {
    type: 'frame',
    id,
    layout: 'horizontal',
    alignItems: 'center',
    justifyContent: 'center',
    width: w,
    height: 28,
    cornerRadius: 8,
    fill: o.active ? C.warmSand : o.bg ?? undefined,
    children: o.icon
      ? [R(`${id}-dot`, 14, 14, { fill: o.danger ? C.error : C.charcoal, r: 2 })]
      : [T(`${id}-t`, label, { size: 12, color: o.active ? C.nearBlack : C.charcoal })],
  };
}

function vDiv(id) {
  return R(id, 1, 18, { fill: C.borderCream });
}

function group(id, label, items) {
  return {
    type: 'frame',
    id,
    layout: 'horizontal',
    alignItems: 'center',
    gap: 2,
    children: [
      ...(label ? [T(`${id}-lbl`, label, { size: 10, semibold: true, color: C.stone })] : []),
      ...items,
    ],
  };
}

function buildHeader(id) {
  return hBar(
    id,
    {
      type: 'frame',
      id: `${id}-inner`,
      layout: 'horizontal',
      alignItems: 'center',
      justifyContent: 'space_between',
      width: SW,
      height: HEADER_H,
      padding: 16,
      fill: C.ivory,
      children: [
        {
          type: 'frame',
          id: `${id}-brand`,
          layout: 'horizontal',
          alignItems: 'center',
          gap: 10,
          children: [
            {
              type: 'frame',
              id: `${id}-logo`,
              width: 26,
              height: 26,
              cornerRadius: 8,
              fill: C.nearBlack,
              layout: 'horizontal',
              alignItems: 'center',
              justifyContent: 'center',
              children: [T(`${id}-km`, 'KM', { size: 10, bold: true, color: C.ivory })],
            },
            {
              type: 'frame',
              id: `${id}-info`,
              layout: 'horizontal',
              alignItems: 'center',
              gap: 8,
              children: [
                T(`${id}-title`, 'KityMinder Neo', { size: 14, serif: true }),
                T(`${id}-file`, 'resources/乳腺外科恶性肿瘤.km', { size: 11, color: C.stone }),
              ],
            },
          ],
        },
        btn(`${id}-src`, '', { icon: true }),
      ],
    },
    HEADER_H,
  );
}

function buildToolbar(id) {
  return hBar(
    id,
    {
      type: 'frame',
      id: `${id}-inner`,
      layout: 'horizontal',
      alignItems: 'center',
      gap: 6,
      width: SW,
      height: TOOLBAR_H,
      padding: 12,
      fill: C.ivory,
      children: [
        group(`${id}-g1`, '节点', [
          btn(`${id}-add`, '', { icon: true }),
          btn(`${id}-sib`, '', { icon: true }),
          btn(`${id}-parent`, '', { icon: true }),
          btn(`${id}-del`, '', { icon: true, danger: true }),
        ]),
        vDiv(`${id}-d1`),
        group(`${id}-g2`, '展开', [
          btn(`${id}-exp`, '', { icon: true }),
          btn(`${id}-col`, '', { icon: true }),
          btn(`${id}-l1`, '1'),
          btn(`${id}-l2`, '2'),
          btn(`${id}-l3`, '3'),
          btn(`${id}-all`, '全部'),
        ]),
        vDiv(`${id}-d2`),
        group(`${id}-g3`, '布局', [
          btn(`${id}-def`, '脑图', { active: true }),
          btn(`${id}-right`, '右展'),
          btn(`${id}-struct`, '组织'),
          btn(`${id}-grid`, '', { icon: true }),
        ]),
        vDiv(`${id}-d3`),
        group(`${id}-g4`, '', [
          btn(`${id}-zi`, '', { icon: true }),
          btn(`${id}-zo`, '', { icon: true }),
          btn(`${id}-ctr`, '', { icon: true }),
          btn(`${id}-read`, '', { icon: true }),
          btn(`${id}-fit`, '', { icon: true }),
        ]),
        vDiv(`${id}-d4`),
        group(`${id}-g5`, '', [btn(`${id}-undo`, '', { icon: true }), btn(`${id}-redo`, '', { icon: true })]),
      ],
    },
    TOOLBAR_H,
  );
}

function node(id, label, x, y, o = {}) {
  const w = o.w ?? Math.min(280, label.length * 11 + 24);
  const h = o.h ?? 32;
  return {
    type: 'frame',
    id,
    x,
    y,
    layout: 'horizontal',
    alignItems: 'center',
    justifyContent: 'center',
    width: w,
    height: h,
    cornerRadius: 8,
    fill: o.fill ?? C.white,
    stroke: {
      align: 'inside',
      thickness: o.selected ? 2 : 1,
      fill: o.selected ? C.coral : C.borderCream,
    },
    children: [
      T(`${id}-t`, label, {
        size: o.small ? 11 : 12,
        color: o.textFill ?? C.nearBlack,
        fixed: true,
        w: w - 20,
      }),
    ],
  };
}

function buildCanvas(id, canvasW, canvasH) {
  const children = [
    node(`${id}-root`, '乳腺恶性肿瘤', 300, canvasH / 2 - 18, {
      w: 132,
      h: 36,
      fill: C.nearBlack,
      textFill: C.ivory,
    }),
    node(`${id}-lymph`, '淋巴瘤', 130, canvasH / 2 - 110, { w: 72, fill: C.terracotta, textFill: C.ivory }),
    node(`${id}-insitu`, '原位癌', 130, canvasH / 2 + 70, { w: 72, fill: C.terracotta, textFill: C.ivory }),
    node(`${id}-primary`, '原发', 460, canvasH / 2 - 16, { w: 56, fill: C.terracotta, textFill: C.ivory }),
    node(`${id}-ls1`, 'C84.500 皮肤T细胞淋巴瘤', 20, canvasH / 2 - 150, { w: 190, small: true }),
    node(`${id}-ls2`, 'C84.501 蕈样肉芽肿', 20, canvasH / 2 - 115, { w: 150, small: true }),
    node(`${id}-is1`, 'D05.000 乳房小叶原位癌', 20, canvasH / 2 + 50, { w: 170, small: true }),
    node(`${id}-is2`, 'D05.100x001 乳房中央部原位癌', 20, canvasH / 2 + 85, { w: 200, small: true }),
  ];

  const codes = [
    'C50.800x001 乳腺尾部恶性肿瘤',
    'C50.800x002 乳腺上内象限恶性肿瘤',
    'C50.800x003 乳腺下内象限恶性肿瘤',
    'C50.800x004 乳腺上外象限恶性肿瘤',
    'C50.800x005 异位乳腺恶性肿瘤',
    'C50.800x006 乳腺中央部恶性肿瘤',
    'C50.901  乳腺恶性肿瘤',
  ];
  codes.forEach((label, i) => {
    children.push(
      node(`${id}-c${i}`, label, 560, 40 + i * 44, {
        w: 260,
        small: true,
        selected: label.includes('005'),
      }),
    );
  });

  // connector lines (thin rectangles)
  [[202, canvasH / 2 - 1, 98, 2],
   [202, canvasH / 2 + 29, 98, 2],
   [516, canvasH / 2 - 1, 44, 2]].forEach(([x, y, w, h], i) => {
    children.push({ ...R(`${id}-ln${i}`, w, h, { fill: C.terracotta, r: 0 }), x, y });
  });

  return {
    type: 'frame',
    id,
    layout: 'none',
    width: canvasW,
    height: canvasH,
    fill: C.parchment,
    clip: true,
    children,
  };
}

function chip(id, label) {
  return {
    type: 'frame',
    id,
    layout: 'horizontal',
    alignItems: 'center',
    height: 22,
    padding: 9,
    cornerRadius: 999,
    fill: C.ivory,
    stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
    children: [T(`${id}-t`, label, { size: 11, color: C.olive })],
  };
}

function inputBox(id, value, o = {}) {
  return {
    type: 'frame',
    id,
    layout: o.multiline ? 'vertical' : 'horizontal',
    alignItems: o.multiline ? 'start' : 'center',
    width: 'fill_container',
    height: o.multiline ? o.h ?? 120 : 34,
    padding: o.multiline ? 10 : 11,
    cornerRadius: 8,
    fill: C.white,
    stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
    children: [
      T(`${id}-v`, value, {
        size: 12,
        color: o.placeholder ? C.warmSilver : C.nearBlack,
        fixed: o.multiline,
        w: 220,
      }),
    ],
  };
}

function buildSidebarCurrent(id, sidebarW, mainH) {
  const title = 'C50.800x005 异位乳腺恶性肿瘤';
  return {
    type: 'frame',
    id,
    layout: 'vertical',
    width: sidebarW,
    height: mainH,
    fill: C.ivory,
    stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
    children: [
      {
        type: 'frame',
        id: `${id}-top`,
        layout: 'vertical',
        width: 'fill_container',
        height: mainH - 36,
        children: [
          {
            type: 'frame',
            id: `${id}-eyebrow-w`,
            padding: 14,
            width: 'fill_container',
            children: [T(`${id}-eyebrow`, '节点属性', { size: 10, bold: true, color: C.stone })],
          },
          {
            type: 'frame',
            id: `${id}-card-w`,
            padding: 14,
            width: 'fill_container',
            children: [
              {
                type: 'frame',
                id: `${id}-card`,
                layout: 'horizontal',
                gap: 10,
                width: 'fill_container',
                padding: 12,
                cornerRadius: 12,
                fill: C.parchment,
                stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
                children: [
                  { type: 'ellipse', id: `${id}-dot`, width: 8, height: 8, fill: C.terracotta },
                  {
                    type: 'frame',
                    id: `${id}-card-body`,
                    layout: 'vertical',
                    gap: 3,
                    width: 'fill_container',
                    children: [
                      T(`${id}-card-t`, title, { size: 15, serif: true, fixed: true, w: 210 }),
                      T(`${id}-card-m`, '层级 2 · 0 个子节点', { size: 11, color: C.olive }),
                    ],
                  },
                ],
              },
            ],
          },
          {
            type: 'frame',
            id: `${id}-chips`,
            layout: 'horizontal',
            gap: 4,
            padding: 14,
            children: [chip(`${id}-c1`, '层级 2'), chip(`${id}-c2`, '子节点 0')],
          },
          {
            type: 'frame',
            id: `${id}-fields`,
            layout: 'vertical',
            gap: 12,
            padding: 14,
            width: 'fill_container',
            height: mainH - 280,
            children: [
              {
                type: 'frame',
                id: `${id}-title-f`,
                layout: 'vertical',
                gap: 5,
                width: 'fill_container',
                children: [
                  T(`${id}-title-l`, '标题', { size: 10, bold: true, color: C.stone }),
                  inputBox(`${id}-title-in`, title),
                ],
              },
              {
                type: 'frame',
                id: `${id}-note-f`,
                layout: 'vertical',
                gap: 5,
                width: 'fill_container',
                height: 'fill_container',
                children: [
                  {
                    type: 'frame',
                    id: `${id}-note-h`,
                    layout: 'horizontal',
                    justifyContent: 'space_between',
                    width: 'fill_container',
                    children: [
                      T(`${id}-note-l`, '备注', { size: 10, bold: true, color: C.stone }),
                      {
                        type: 'frame',
                        id: `${id}-md`,
                        height: 17,
                        padding: 6,
                        cornerRadius: 4,
                        fill: C.warmSand,
                        stroke: { align: 'inside', thickness: 1, fill: C.borderWarm },
                        children: [T(`${id}-md-t`, 'MD', { size: 9, bold: true, color: C.charcoal })],
                      },
                    ],
                  },
                  inputBox(`${id}-note-in`, '在此添加备注…留空将移除该节点的备注', {
                    multiline: true,
                    h: 160,
                    placeholder: true,
                  }),
                  {
                    type: 'frame',
                    id: `${id}-note-foot`,
                    layout: 'horizontal',
                    justifyContent: 'space_between',
                    width: 'fill_container',
                    children: [
                      T(`${id}-stat`, '0 字符', { size: 10, color: C.warmSilver }),
                      T(`${id}-tip`, '支持 Markdown', { size: 10, color: C.warmSilver }),
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        type: 'frame',
        id: `${id}-foot`,
        layout: 'horizontal',
        gap: 10,
        padding: 10,
        width: 'fill_container',
        height: 36,
        fill: C.parchment,
        stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
        children: [
          T(`${id}-h1`, 'F2 编辑', { size: 11, color: C.stone }),
          T(`${id}-h2`, 'Tab 子节点', { size: 11, color: C.stone }),
          T(`${id}-h3`, '↵ 同级', { size: 11, color: C.stone }),
        ],
      },
    ],
  };
}

function buildCombinedBar(id) {
  return hBar(
    id,
    {
      type: 'frame',
      id: `${id}-inner`,
      layout: 'horizontal',
      alignItems: 'center',
      justifyContent: 'space_between',
      width: SW,
      height: BAR_H,
      padding: 12,
      fill: C.ivory,
      children: [
        {
          type: 'frame',
          id: `${id}-left`,
          layout: 'horizontal',
          alignItems: 'center',
          gap: 8,
          children: [
            T(`${id}-file`, '乳腺外科恶性肿瘤.km', { size: 14, serif: true }),
            vDiv(`${id}-d0`),
            btn(`${id}-add`, '+ 子节点'),
            btn(`${id}-del`, '', { icon: true, danger: true }),
            vDiv(`${id}-d1`),
            btn(`${id}-undo`, '', { icon: true }),
            btn(`${id}-redo`, '', { icon: true }),
          ],
        },
        {
          type: 'frame',
          id: `${id}-right`,
          layout: 'horizontal',
          alignItems: 'center',
          gap: 6,
          children: [
            {
              type: 'frame',
              id: `${id}-search`,
              layout: 'horizontal',
              alignItems: 'center',
              gap: 6,
              width: 200,
              height: 28,
              padding: 10,
              cornerRadius: 12,
              fill: C.white,
              stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
              children: [T(`${id}-sp`, '搜索标题或备注…', { size: 11, color: C.warmSilver })],
            },
            btn(`${id}-zoom`, '', { icon: true }),
            btn(`${id}-lay`, '脑图 ▾'),
            btn(`${id}-src`, '', { icon: true }),
            btn(`${id}-close`, '◀', { bg: C.warmSand }),
          ],
        },
      ],
    },
    BAR_H,
  );
}

function buildSidebarOpt(id, sidebarW, mainH) {
  const title = 'C50.800x005 异位乳腺恶性肿瘤';
  return {
    type: 'frame',
    id,
    layout: 'vertical',
    width: sidebarW,
    height: mainH,
    fill: C.ivory,
    stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
    children: [
      {
        type: 'frame',
        id: `${id}-head`,
        layout: 'horizontal',
        justifyContent: 'space_between',
        alignItems: 'center',
        padding: 14,
        width: 'fill_container',
        children: [
          T(`${id}-eyebrow`, '节点属性', { size: 10, bold: true, color: C.stone }),
          T(`${id}-collapse`, '◀ 收起', { size: 10, color: C.stone }),
        ],
      },
      {
        type: 'frame',
        id: `${id}-chips`,
        layout: 'horizontal',
        gap: 4,
        padding: 14,
        children: [chip(`${id}-c1`, '层级 2'), chip(`${id}-c2`, '子节点 0')],
      },
      {
        type: 'frame',
        id: `${id}-fields`,
        layout: 'vertical',
        gap: 12,
        padding: 14,
        width: 'fill_container',
        height: mainH - 80,
        children: [
          {
            type: 'frame',
            id: `${id}-title-f`,
            layout: 'vertical',
            gap: 5,
            width: 'fill_container',
            children: [
              T(`${id}-title-l`, '标题', { size: 10, bold: true, color: C.stone }),
              inputBox(`${id}-title-in`, title),
            ],
          },
          {
            type: 'frame',
            id: `${id}-note-f`,
            layout: 'vertical',
            gap: 5,
            width: 'fill_container',
            children: [
              T(`${id}-note-l`, '备注', { size: 10, bold: true, color: C.stone }),
              {
                type: 'frame',
                id: `${id}-add-note`,
                layout: 'horizontal',
                alignItems: 'center',
                justifyContent: 'center',
                width: 'fill_container',
                height: 36,
                cornerRadius: 8,
                stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
                children: [T(`${id}-add-t`, '+ 添加备注（支持 Markdown）', { size: 11, color: C.stone })],
              },
            ],
          },
        ],
      },
      {
        type: 'frame',
        id: `${id}-bc`,
        layout: 'horizontal',
        padding: 10,
        width: 'fill_container',
        height: 36,
        fill: C.parchment,
        stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
        children: [T(`${id}-bc-t`, '根节点 › 原发 › C50.800x005', { size: 10, color: C.olive })],
      },
    ],
  };
}

function buildPopover(id, x, y) {
  const PW = 300;
  const PH = 268;
  const title = 'C50.800x005 异位乳腺恶性肿瘤';

  const body = {
    type: 'frame',
    id: `${id}-body-wrap`,
    x: 0,
    y: 0,
    layout: 'vertical',
    width: PW,
    height: PH,
    cornerRadius: 12,
    fill: C.ivory,
    clip: true,
    stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
    effect: {
      type: 'shadow',
      shadowType: 'outer',
      offset: { x: 0, y: 8 },
      blur: 24,
      spread: 0,
      color: '#00000014',
    },
    children: [
      {
        type: 'frame',
        id: `${id}-head`,
        layout: 'horizontal',
        alignItems: 'center',
        justifyContent: 'space_between',
        width: PW,
        padding: 12,
        children: [
          T(`${id}-title-lbl`, '节点属性', { size: 10, bold: true, color: C.stone }),
          {
            type: 'frame',
            id: `${id}-actions`,
            layout: 'horizontal',
            gap: 4,
            children: [btn(`${id}-pin`, 'Pin', { bg: C.warmSand }), btn(`${id}-close`, '×')],
          },
        ],
      },
      {
        type: 'frame',
        id: `${id}-chips`,
        layout: 'horizontal',
        gap: 4,
        padding: 12,
        children: [chip(`${id}-c1`, '层级 2'), chip(`${id}-c2`, '子节点 0')],
      },
      {
        type: 'frame',
        id: `${id}-fields`,
        layout: 'vertical',
        gap: 10,
        padding: 12,
        width: PW,
        children: [
          {
            type: 'frame',
            id: `${id}-title-f`,
            layout: 'vertical',
            gap: 5,
            width: PW - 24,
            children: [
              T(`${id}-fl`, '标题', { size: 10, bold: true, color: C.stone }),
              inputBox(`${id}-ti`, title),
            ],
          },
          {
            type: 'frame',
            id: `${id}-note-f`,
            layout: 'vertical',
            gap: 5,
            width: PW - 24,
            children: [
              T(`${id}-nl`, '备注', { size: 10, bold: true, color: C.stone }),
              {
                type: 'frame',
                id: `${id}-add`,
                layout: 'horizontal',
                alignItems: 'center',
                justifyContent: 'center',
                width: PW - 24,
                height: 36,
                cornerRadius: 8,
                stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
                children: [T(`${id}-add-t`, '+ 添加备注', { size: 11, color: C.stone })],
              },
            ],
          },
        ],
      },
      {
        type: 'frame',
        id: `${id}-foot`,
        layout: 'horizontal',
        justifyContent: 'space_between',
        padding: 10,
        width: PW,
        fill: C.parchment,
        stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
        children: [
          T(`${id}-bc`, '根 › 原发 › …005', { size: 10, color: C.olive }),
          T(`${id}-esc`, 'Esc 关闭', { size: 10, color: C.warmSilver }),
        ],
      },
    ],
  };

  const arrow = {
    type: 'rectangle',
    id: `${id}-arrow`,
    x: -5,
    y: 52,
    width: 10,
    height: 10,
    cornerRadius: 1,
    fill: C.ivory,
    stroke: { align: 'inside', thickness: 1, fill: C.borderCream },
  };

  return {
    type: 'frame',
    id,
    x,
    y,
    layout: 'none',
    width: PW,
    height: PH,
    children: [body, arrow],
  };
}

function screenPopover(id) {
  const mainH = MAIN_OPT_H;
  // selected node c4: x=560, y=80+4*44=256, w=260
  const popX = 560 + 260 + 20;
  const popY = 256 - 24;

  return {
    type: 'frame',
    id,
    name: 'Popover 方案',
    theme: { mode: 'light' },
    x: SW + 60,
    y: 48,
    width: SW,
    height: SH,
    layout: 'vertical',
    clip: true,
    fill: C.parchment,
    stroke: { align: 'outside', thickness: 2, fill: C.terracotta },
    cornerRadius: 12,
    children: [
      buildCombinedBar(`${id}-bar`),
      {
        type: 'frame',
        id: `${id}-main`,
        layout: 'none',
        width: SW,
        height: mainH,
        clip: true,
        children: [
          { ...buildCanvas(`${id}-canvas`, SW, mainH), x: 0, y: 0 },
          buildPopover(`${id}-popover`, popX, popY),
        ],
      },
    ],
  };
}

function screen(id, variant) {
  const isOpt = variant === 'opt';
  const sidebarW = isOpt ? SIDEBAR_OPT_W : SIDEBAR_W;
  const mainH = isOpt ? MAIN_OPT_H : MAIN_H;
  const canvasW = SW - sidebarW;

  return {
    type: 'frame',
    id,
    name: isOpt ? '优化方案' : '当前界面',
    theme: { mode: 'light' },
    x: isOpt ? SW + 60 : 0,
    y: 48,
    width: SW,
    height: SH,
    layout: 'vertical',
    clip: true,
    fill: C.parchment,
    stroke: { align: 'outside', thickness: 2, fill: isOpt ? C.terracotta : C.borderCream },
    cornerRadius: 12,
    children: isOpt
      ? [
          buildCombinedBar(`${id}-bar`),
          {
            type: 'frame',
            id: `${id}-main`,
            layout: 'horizontal',
            width: SW,
            height: mainH,
            children: [buildCanvas(`${id}-canvas`, canvasW, mainH), buildSidebarOpt(`${id}-sb`, sidebarW, mainH)],
          },
        ]
      : [
          buildHeader(`${id}-hdr`),
          buildToolbar(`${id}-tb`),
          {
            type: 'frame',
            id: `${id}-main`,
            layout: 'horizontal',
            width: SW,
            height: mainH,
            children: [
              buildCanvas(`${id}-canvas`, canvasW, mainH),
              buildSidebarCurrent(`${id}-sb`, sidebarW, mainH),
            ],
          },
        ],
  };
}

const doc = {
  version: '2.8',
  themes: { mode: ['light'] },
  children: [
    {
      type: 'text',
      id: 'hint-left',
      x: 0,
      y: 0,
      textGrowth: 'auto',
      content: '当前界面',
      fontSize: 16,
      fontWeight: '700',
      fill: C.nearBlack,
      fontFamily: 'Georgia',
    },
    {
      type: 'text',
      id: 'hint-right',
      x: SW + 60,
      y: 0,
      textGrowth: 'auto',
      content: 'Popover 方案',
      fontSize: 16,
      fontWeight: '700',
      fill: C.terracotta,
      fontFamily: 'Georgia',
    },
    {
      type: 'text',
      id: 'hint-right-sub',
      x: SW + 60,
      y: 22,
      textGrowth: 'fixed-width',
      content: '全宽画布 · 选中节点时弹出属性面板 · 可 Pin 固定或 Esc 关闭',
      fontSize: 11,
      fill: C.olive,
      fontFamily: 'system-ui',
      width: 500,
    },
    screen('scr-current', 'current'),
    screenPopover('scr-popover'),
  ],
};

writeFileSync(OUT, JSON.stringify(doc, null, 2) + '\n');
console.log(`Wrote ${OUT} (${SW}x${SH} screens, literal pixels)`);

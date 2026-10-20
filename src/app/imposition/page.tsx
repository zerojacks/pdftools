"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { PDFDocument, degrees, rgb, StandardFonts } from 'pdf-lib';
import { calculateLayout, mm2pt, LayoutParams, Orientation, CellLayout } from '@/lib/pdfLayout';
import { LiquidGlass } from '@/components/ui/LiquidGlass';
import { GlassSelect } from '@/components/ui/GlassSelect';
import { LiquidAppLayout } from '@/components/ui/LiquidLayout';

// Icons
const CheckIcon = () => (
  <svg className="w-4 h-4 text-[var(--text)]" viewBox="0 0 24 24">
    <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

type PageNoPos = 'bottom-center' | 'bottom-right' | 'top-center' | 'top-right'
type PageNoFormat = 'plain' | 'slash' | 'dash'
type PageNoFontFamily = 'helvetica' | 'times' | 'courier'
type PageOrderEntry = number | null

interface PageNoConfig {
  enabled: boolean
  pos: PageNoPos
  format: PageNoFormat
  start: number
  font: PageNoFontFamily
  fontSize: number
  bold: boolean
}

const PDF_STANDARD_FONTS: Record<PageNoFontFamily, { regular: StandardFonts; bold: StandardFonts }> = {
  helvetica: { regular: StandardFonts.Helvetica, bold: StandardFonts.HelveticaBold },
  times: { regular: StandardFonts.TimesRoman, bold: StandardFonts.TimesRomanBold },
  courier: { regular: StandardFonts.Courier, bold: StandardFonts.CourierBold },
}

const CANVAS_FONT_STACKS: Record<PageNoFontFamily, string> = {
  helvetica: 'Helvetica, Arial, sans-serif',
  times: 'Times New Roman, Times, serif',
  courier: 'Courier New, Courier, monospace',
}

// 页面管理虚拟网格：6 列固定行高（按钮 28px + 行距 6px）
const PAGE_GRID_COLS = 6
const PAGE_GRID_ROW_H = 34
const PAGE_GRID_VIEW_H = 148
const PAGE_GRID_OVERSCAN = 2

const formatPageNo = (n: number, format: PageNoFormat, total: number): string => {
  if (format === 'slash') return `${n} / ${total}`
  if (format === 'dash') return `- ${n} -`
  return `${n}`
}

const CheckboxRow = ({ checked, onChange, label }: { checked: boolean, onChange: (v: boolean) => void, label: string }) => (
  <div className="row flex gap-2.5 items-center cursor-pointer" onClick={() => onChange(!checked)}>
    <div className={`checkboxGlass liquid-glass-wrapper w-6 h-6 rounded-lg cursor-pointer shrink-0 ${checked ? 'checked' : ''} dark:border dark:border-white/20 dark:bg-white/5`}>
      <div className="liquid-glass-effect"></div>
      <div className={`liquid-glass-tint ${checked ? '!bg-blue-500/30' : ''}`}></div>
      <div className="liquid-glass-shine"></div>
      <div className="liquid-glass-text checkboxInner flex items-center justify-center text-[var(--text)]">
        <div className={`transform transition-all duration-200 ${checked ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
          <CheckIcon />
        </div>
      </div>
    </div>
    <span style={{ marginLeft: '10px', fontSize: '14px', fontWeight: 500 }}>{label}</span>
  </div>
);

// 在整张输出页（canvas 像素坐标）内绘制页码，位置规则与生成 PDF 时保持一致
const drawCanvasPageNo = (
  ctx: CanvasRenderingContext2D,
  text: string,
  canvasW: number,
  canvasH: number,
  padPx: number,
  fontSizePx: number,
  pos: PageNoPos,
  font: PageNoFontFamily,
  bold: boolean
) => {
  ctx.fillStyle = 'rgba(30,41,59,0.75)';
  ctx.font = `${bold ? 'bold ' : ''}${fontSizePx}px ${CANVAS_FONT_STACKS[font]}`;
  ctx.textBaseline = 'alphabetic';
  const isTop = pos.startsWith('top');
  const isRight = pos.endsWith('right');
  ctx.textAlign = isRight ? 'right' : 'center';
  const x = isRight ? canvasW - padPx : canvasW / 2;
  const y = isTop ? padPx + fontSizePx : canvasH - padPx;
  ctx.fillText(text, x, y);
  ctx.textAlign = 'left';
};

// Preview Sheet Component
// 注意：悬浮操作作用于「原 PDF 页」（拼版格子），而非整张输出页
const PreviewSheet = React.memo(({
  sheetIndex,
  exportIndex,
  exportTotal,
  nup,
  pageThumbnails,
  layout,
  params,
  previewZoom,
  pageNo,
  pageLabels,
  dragFromOrder,
  dragOverOrder,
  onPageDelete,
  onPageAddBlank,
  onPageMove,
  onPageDragStart,
  onPageDragOver,
  onPageDragEnd,
  onPageDrop,
}: {
  sheetIndex: number,
  exportIndex: number,   // 在导出序列中的序号（0-based）
  exportTotal: number,   // 导出总张数
  nup: number,
  pageThumbnails: (HTMLCanvasElement | null)[],
  layout: { pageSize: { w: number, h: number }, cells: CellLayout[] },
  params: LayoutParams,
  previewZoom: number,
  pageNo: PageNoConfig,
  pageLabels: (number | null)[], // 排版顺序 → 原文件页码（1-based），null 表示空白页
  dragFromOrder: number | null,
  dragOverOrder: number | null,
  onPageDelete: (orderIdx: number) => void,
  onPageAddBlank: (orderIdx: number) => void,
  onPageMove: (orderIdx: number, dir: -1 | 1) => void,
  onPageDragStart: (orderIdx: number) => void,
  onPageDragOver: (orderIdx: number) => void,
  onPageDragEnd: () => void,
  onPageDrop: (orderIdx: number) => void,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const cssScale = previewZoom / 100;
    const displayScale = 1.5 * cssScale;

    // Set canvas dimensions
    canvas.width = layout.pageSize.w * displayScale;
    canvas.height = layout.pageSize.h * displayScale;
    
    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (let i = 0; i < nup; i++) {
      const pageIndex = sheetIndex * nup + i;
      if (pageIndex >= pageThumbnails.length) break;

      const thumb = pageThumbnails[pageIndex];
      if (!thumb) continue;
      const cell = layout.cells[i];

      const sx = thumb.width * params.crop.l;
      const sy = thumb.height * params.crop.t;
      const sw = thumb.width * (1 - params.crop.l - params.crop.r);
      const sh = thumb.height * (1 - params.crop.t - params.crop.b);

      const destX = cell.x * displayScale;
      const destY = (layout.pageSize.h - cell.y - cell.height) * displayScale;
      const destW = cell.width * displayScale;
      const destH = cell.height * displayScale;

      ctx.drawImage(thumb, sx, sy, sw, sh, destX, destY, destW, destH);

      if (params.border) {
        ctx.strokeStyle = params.borderColor;
        ctx.lineWidth = params.borderWidth * displayScale;
        ctx.strokeRect(destX, destY, destW, destH);
      }
    }

    if (pageNo.enabled) {
      const label = formatPageNo(pageNo.start + exportIndex, pageNo.format, exportTotal);
      const padPx = Math.max(mm2pt(params.margin) / 2, 4) * displayScale;
      drawCanvasPageNo(
        ctx,
        label,
        canvas.width,
        canvas.height,
        padPx,
        pageNo.fontSize * displayScale,
        pageNo.pos,
        pageNo.font,
        pageNo.bold
      );
    }
  }, [sheetIndex, exportIndex, exportTotal, nup, pageThumbnails, layout, params, previewZoom, pageNo]);

  const cssScale = previewZoom / 100;

  return (
    <div className="relative">
      <div
        className="canvasWrapper bg-white shadow-lg transition-all duration-300 mb-2.5 relative"
        style={{
          width: `${layout.pageSize.w * cssScale}px`,
          height: `${layout.pageSize.h * cssScale}px`
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            width: `${layout.pageSize.w * cssScale}px`,
            height: `${layout.pageSize.h * cssScale}px`
          }}
        />

        {/* 每个格子 = 原 PDF 一页：悬浮操作 + 拖拽换位 */}
        {pageThumbnails.length > 0 && layout.cells.map((cell, i) => {
          const orderIdx = sheetIndex * nup + i;
          if (orderIdx >= pageThumbnails.length) return null;

          const isDragging = dragFromOrder === orderIdx;
          const isDragOver = dragOverOrder === orderIdx && dragFromOrder !== orderIdx;

          return (
            <div
              key={orderIdx}
              className="absolute group/cell cursor-move"
              style={{
                left: `${cell.x * cssScale}px`,
                top: `${(layout.pageSize.h - cell.y - cell.height) * cssScale}px`,
                width: `${cell.width * cssScale}px`,
                height: `${cell.height * cssScale}px`,
              }}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.stopPropagation();
                onPageDragStart(orderIdx);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                e.stopPropagation();
                onPageDragOver(orderIdx);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onPageDrop(orderIdx);
              }}
              onDragEnd={(e) => {
                e.stopPropagation();
                onPageDragEnd();
              }}
            >
              {/* 悬浮时的半透明高亮 */}
              <div
                className={[
                  'absolute inset-0 pointer-events-none rounded-sm border-2 transition-all duration-150',
                  isDragging
                    ? 'opacity-0'
                    : isDragOver
                      ? 'border-[var(--primary)] bg-blue-400/15'
                      : 'border-transparent group-hover/cell:border-black/25 group-hover/cell:bg-black/5',
                ].join(' ')}
              />

              {/* 页角标：原 PDF 页码 */}
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-black/55 text-white pointer-events-none opacity-0 group-hover/cell:opacity-100 transition-opacity">
                {pageLabels[orderIdx] === null ? '空白页' : `原第 ${pageLabels[orderIdx] ?? orderIdx + 1} 页`}
              </div>

              {/* 悬浮操作栏：针对这一页原 PDF */}
              <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 px-1 py-0.5 rounded-full bg-black/60 backdrop-blur-md shadow-lg opacity-0 group-hover/cell:opacity-100 transition-opacity duration-150">
                <button
                  type="button"
                  title="前移一页"
                  onClick={(e) => { e.stopPropagation(); onPageMove(orderIdx, -1); }}
                  disabled={orderIdx === 0}
                  className="w-6 h-6 rounded-full text-white/90 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                </button>
                <button
                  type="button"
                  title="后移一页"
                  onClick={(e) => { e.stopPropagation(); onPageMove(orderIdx, 1); }}
                  disabled={orderIdx >= pageThumbnails.length - 1}
                  className="w-6 h-6 rounded-full text-white/90 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                </button>
                <div className="w-px h-3.5 bg-white/25 mx-0.5" />
                <button
                  type="button"
                  title="在此页后添加空白页"
                  aria-label="在此页后添加空白页"
                  onClick={(e) => { e.stopPropagation(); onPageAddBlank(orderIdx); }}
                  className="w-6 h-6 rounded-full text-emerald-200 hover:bg-emerald-500/30 flex items-center justify-center"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
                </button>
                <button
                  type="button"
                  title={pageLabels[orderIdx] === null ? '删除空白页' : `删除原第 ${pageLabels[orderIdx] ?? orderIdx + 1} 页`}
                  onClick={(e) => { e.stopPropagation(); onPageDelete(orderIdx); }}
                  className="w-6 h-6 rounded-full text-red-300 hover:bg-red-500/30 flex items-center justify-center"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ textAlign: 'center' }}>
        <span className="pageNumber mb-5 text-sm text-[var(--text-sec)] text-center font-semibold font-mono bg-[var(--input-bg)] inline-block py-1 px-3 rounded-xl backdrop-blur-sm border border-[var(--input-border)]">
          第 {exportIndex + 1} / {exportTotal} 张
        </span>
      </div>
    </div>
  );
});

PreviewSheet.displayName = 'PreviewSheet';

export default function PdfImposition() {
  // State
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState<string>('点击选择 PDF 文件');
  const [statusText, setStatusText] = useState<string>('就绪');
  const [progress, setProgress] = useState<number>(0);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [pageThumbnails, setPageThumbnails] = useState<HTMLCanvasElement[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragCounter = useRef(0);
  
  // Params State
  const [nup, setNup] = useState<number>(4);
  const [orient, setOrient] = useState<Orientation>('portrait');
  const [scalePct, setScalePct] = useState<number>(100);
  const [crop, setCrop] = useState({ t: 0, b: 0, l: 0, r: 0 });
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [margin, setMargin] = useState<number>(0);
  const [border, setBorder] = useState<boolean>(false);
  const [borderColor, setBorderColor] = useState<string>('#000000');
  const [borderWidth, setBorderWidth] = useState<number>(1);
  const [previewZoom, setPreviewZoom] = useState<number>(60);
  const [pageRange, setPageRange] = useState<string>(''); // Empty means all

  // 页序：当前排版顺序下的原文件 0-based 页码（删除 = 从中移除；移动 = 重排）
  const [pageOrder, setPageOrder] = useState<PageOrderEntry[]>([]);
  // 按范围删除：如 "1-5, 8"（原文件页码）
  const [deleteRange, setDeleteRange] = useState<string>('');
  // 预览页级拖拽（操作的是原 PDF 页，而非整张输出页）
  const [dragFromOrder, setDragFromOrder] = useState<number | null>(null);
  const [dragOverOrder, setDragOverOrder] = useState<number | null>(null);

  // 页码设置
  const [pageNoEnabled, setPageNoEnabled] = useState<boolean>(false);
  const [pageNoPos, setPageNoPos] = useState<PageNoPos>('bottom-center');
  const [pageNoFormat, setPageNoFormat] = useState<PageNoFormat>('plain');
  const [pageNoStart, setPageNoStart] = useState<number>(1);
  const [pageNoFont, setPageNoFont] = useState<PageNoFontFamily>('helvetica');
  const [pageNoFontSize, setPageNoFontSize] = useState<number>(9);
  const [pageNoBold, setPageNoBold] = useState<boolean>(false);

  // 页面管理：虚拟滚动（只渲染视口内的行，避免大 PDF 全量 DOM）
  const pageGridRef = useRef<HTMLDivElement>(null);
  const [gridScrollTop, setGridScrollTop] = useState<number>(0);

  const pageNo: PageNoConfig = useMemo(() => ({
    enabled: pageNoEnabled,
    pos: pageNoPos,
    format: pageNoFormat,
    start: pageNoStart,
    font: pageNoFont,
    fontSize: pageNoFontSize,
    bold: pageNoBold,
  }), [pageNoEnabled, pageNoPos, pageNoFormat, pageNoStart, pageNoFont, pageNoFontSize, pageNoBold]);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  // Helper to parse page range string to 0-based indices array
  const parsePageRange = (rangeStr: string, totalPages: number): number[] => {
    if (!rangeStr.trim()) {
      return Array.from({ length: totalPages }, (_, i) => i);
    }

    const pages = new Set<number>();
    const parts = rangeStr.split(/[,，]/); // Support both English and Chinese commas

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      if (trimmed.includes('-')) {
        const [startStr, endStr] = trimmed.split('-');
        let start = parseInt(startStr);
        let end = parseInt(endStr);

        if (isNaN(start)) continue;
        if (isNaN(end)) end = totalPages;

        // Ensure valid range and bounds
        start = Math.max(1, start);
        end = Math.min(totalPages, end);

        if (start <= end) {
          for (let i = start; i <= end; i++) {
            pages.add(i - 1); // Convert to 0-based
          }
        }
      } else {
        const page = parseInt(trimmed);
        if (!isNaN(page) && page >= 1 && page <= totalPages) {
          pages.add(page - 1);
        }
      }
    }
    
    // Return sorted unique indices
    return Array.from(pages).sort((a, b) => a - b);
  };

  // Helper to get current params
  const getParams = useCallback((): LayoutParams => ({
    nup,
    orientation: orient,
    scalePct,
    crop: {
        t: crop.t / 100,
        b: crop.b / 100,
        l: crop.l / 100,
        r: crop.r / 100
    },
    offset,
    margin,
    border,
    borderColor,
    borderWidth,
    paperSize: orient === 'portrait' ? { w: 210, h: 297 } : { w: 297, h: 210 }
  }), [nup, orient, scalePct, crop, offset, margin, border, borderColor, borderWidth]);

  // 已删除页（用于页面管理网格的删除态显示）= 全量页码中不在 pageOrder 里的
  const removedPages = useMemo(() => {
    const kept = new Set(pageOrder);
    const removed = new Set<number>();
    for (let i = 0; i < pageThumbnails.length; i++) {
      if (!kept.has(i)) removed.add(i);
    }
    return removed;
  }, [pageOrder, pageThumbnails]);

  // 保留页：按 pageOrder 顺序的原文件 0-based 页码
  const activeIndices = useMemo(() => {
    // 文件刚加载、pageOrder 尚未同步时，按原顺序回退
    if (pageOrder.length === 0 && pageThumbnails.length > 0) {
      return pageThumbnails.map((_, i) => i);
    }
    return pageOrder;
  }, [pageOrder, pageThumbnails]);

  const activeThumbnails = useMemo<(HTMLCanvasElement | null)[]>(
    () => activeIndices.map(i => i === null ? null : pageThumbnails[i] ?? null),
    [activeIndices, pageThumbnails]
  );

  // Calculated values
  const layoutData = useMemo(() => {
    if (activeThumbnails.length === 0) return null;

    const params = getParams();
    const firstPage = activeThumbnails.find((page): page is HTMLCanvasElement => page !== null);
    if (!firstPage) return null;
    const srcAspect = (firstPage.width * (1 - params.crop.l - params.crop.r)) /
                      (firstPage.height * (1 - params.crop.t - params.crop.b));

    const layout = calculateLayout(params, srcAspect);
    const totalSheets = Math.ceil(activeThumbnails.length / params.nup);
    const selectedSheetIndices = parsePageRange(pageRange, totalSheets);

    return { layout, totalSheets, selectedSheetIndices, params };
  }, [activeThumbnails, getParams, pageRange]);

  // 从页序中删除若干原文件页码（至少保留 1 页）
  const removePagesFromOrder = (targets: Set<number>) => {
    if (targets.size === 0) return;
    setPageOrder(prev => {
      const base = prev.length > 0 ? prev : pageThumbnails.map((_, i) => i);
      const next = base.filter(i => i === null || !targets.has(i));
      if (!next.some(i => i !== null)) {
        alert('至少需要保留 1 页');
        return base;
      }
      return next;
    });
  };

  // 按范围删除：如 "1-5, 8"（原文件页码）
  const deletePagesByRange = () => {
    if (!deleteRange.trim()) return;
    const targets = new Set(parsePageRange(deleteRange, pageThumbnails.length));
    if (targets.size === 0) {
      alert('请输入有效的页码范围，例如 1-5, 8');
      return;
    }
    const remainingPages = activeIndices.filter(i => i !== null && !targets.has(i));
    if (remainingPages.length === 0) {
      alert('至少需要保留 1 页');
      return;
    }
    removePagesFromOrder(targets);
    setDeleteRange('');
  };

  // 单页恢复：把已删除的原文件页插回排版序（按原文件页码位置）
  const restorePage = (idx: number) => {
    setPageOrder(prev => {
      const base = prev.length > 0 ? prev : pageThumbnails.map((_, i) => i);
      if (base.includes(idx)) return base;
      // 插到第一个比它大的原页码之前，等价于回到原文件顺序位置
      let insertAt = base.length;
      for (let k = 0; k < base.length; k++) {
        const pageIndex = base[k];
        if (pageIndex !== null && pageIndex > idx) {
          insertAt = k;
          break;
        }
      }
      const next = [...base];
      next.splice(insertAt, 0, idx);
      return next;
    });
    setDeleteRange('');
  };

  // —— 预览页级操作（针对原 PDF 页，orderIdx = 排版顺序下标）——
  // 删除排版序中的某一页
  const deletePageByOrder = (orderIdx: number) => {
    const srcIdx = activeIndices[orderIdx];
    if (srcIdx === undefined) return;
    if (activeIndices.length <= 1) {
      alert('至少需要保留 1 页');
      return;
    }
    if (srcIdx === null) {
      setPageOrder(prev => {
        const next = [...(prev.length > 0 ? prev : pageThumbnails.map((_, i) => i))];
        next.splice(orderIdx, 1);
        return next;
      });
      return;
    }
    removePagesFromOrder(new Set([srcIdx]));
  };

  // 在指定排版页之后插入空白页（null 不对应源 PDF 页面）
  const addBlankPageAfter = (orderIdx: number) => {
    setPageOrder(prev => {
      const next: PageOrderEntry[] = [...(prev.length > 0 ? prev : pageThumbnails.map((_, i) => i))];
      next.splice(orderIdx + 1, 0, null);
      return next;
    });
  };

  // 将某页在排版序中前移/后移一位（与相邻页换位）
  const movePageByOrder = (orderIdx: number, dir: -1 | 1) => {
    const target = orderIdx + dir;
    if (target < 0 || target >= activeIndices.length) return;

    setPageOrder(prev => {
      const base = prev.length > 0 ? prev : pageThumbnails.map((_, i) => i);
      const next = [...base];
      [next[orderIdx], next[target]] = [next[target], next[orderIdx]];
      return next;
    });
  };

  // 拖拽换位：把 from 页移到 to 页之前
  const movePageTo = (from: number, to: number) => {
    const f = from;
    setDragFromOrder(null);
    setDragOverOrder(null);
    if (f === to) return;

    setPageOrder(prev => {
      const base = prev.length > 0 ? prev : pageThumbnails.map((_, i) => i);
      const next = [...base];
      const [moved] = next.splice(f, 1);
      next.splice(to > f ? to - 1 : to, 0, moved);
      return next;
    });
  };

  // 页面管理虚拟滚动窗口：只计算视口内外各 OVERSCAN 行
  const pageRowCount = Math.ceil(pageThumbnails.length / PAGE_GRID_COLS);
  const pageStartRow = Math.max(0, Math.floor(gridScrollTop / PAGE_GRID_ROW_H) - PAGE_GRID_OVERSCAN);
  const pageEndRow = Math.min(
    pageRowCount,
    Math.ceil((gridScrollTop + PAGE_GRID_VIEW_H) / PAGE_GRID_ROW_H) + PAGE_GRID_OVERSCAN
  );
  const visiblePageRows = useMemo(
    () => Array.from({ length: Math.max(0, pageEndRow - pageStartRow) }, (_, k) => pageStartRow + k),
    [pageStartRow, pageEndRow]
  );

  // Handle File Upload
  const handleFileDrop = async (file: File) => {
    if (file && file.type === 'application/pdf') {
      setCurrentFile(file);
      setFileName(file.name);
      await renderThumbnails(file);
    } else if (file) {
      alert('请选择有效的 PDF 文件');
    }
  };

  // Scroll to top when file changes
  useEffect(() => {
    if (previewContainerRef.current) {
        previewContainerRef.current.scrollTop = 0;
    }
  }, [pageThumbnails]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCurrentFile(file);
      setFileName(file.name);
      await renderThumbnails(file);
    }
  };

  const renderThumbnails = async (file: File) => {
    setIsRendering(true);
    setStatusText('正在渲染...');
    setProgress(0);
    setPageThumbnails([]);
    setPageOrder([]);
    setDeleteRange('');
    setPageRange('');
    setGridScrollTop(0);

    try {
      // Dynamic import for pdfjs-dist
      const pdfjsLib = await import('pdfjs-dist');
      if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
      }

      const data = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument(data).promise;
      const total = pdf.numPages;
      
      // 优化渲染清晰度：根据设备像素比和页面数量动态调整渲染分辨率
      // 预览需高清，分辨率保持不变；提速靠并发渲染
      const pixelRatio = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;
      const baseHeight = total > 20 ? 800 : 1200;
      const targetHeight = baseHeight * pixelRatio;

      const thumbnails: (HTMLCanvasElement | undefined)[] = new Array(total);
      let doneCount = 0;
      let lastFlush = 0;

      // 进度节流：并发下完成很快，避免每页都触发整页重渲染
      const flushProgress = (force = false) => {
        const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        if (!force && now - lastFlush < 120) return;
        lastFlush = now;
        setProgress(Math.round((doneCount / total) * 100));
      };

      const renderOne = async (i: number) => {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 1 });
        const scale = targetHeight / viewport.height;
        const scaledViewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');

        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;

        // 即使单页失败也写入占位画布，保证下标与原文件页码 1:1 对应
        if (context) {
          await page.render({ canvasContext: context, viewport: scaledViewport, canvas } as any).promise;
        }
        thumbnails[i - 1] = canvas;
        doneCount++;
        flushProgress();
      };

      // 并发池：4 页同时渲染，保持页序（按索引写回）
      const CONCURRENCY = 4;
      let cursor = 0;
      const worker = async () => {
        while (cursor < total) {
          const i = cursor++;
          await renderOne(i + 1);
        }
      };
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));
      flushProgress(true);

      setPageThumbnails(thumbnails as HTMLCanvasElement[]);
      setPageOrder(thumbnails.map((_, i) => i));
      setStatusText('就绪');
    } catch (error) {
      console.error('Error rendering PDF:', error);
      setStatusText('渲染出错');
    } finally {
      setIsRendering(false);
    }
  };

  // Effect to handle Ctrl + Wheel zoom
  useEffect(() => {
    const container = document.querySelector('.previewContainer');
    if (!container) return;

    const handleWheel = (e: Event) => {
      const wheelEvent = e as WheelEvent;
      if (wheelEvent.ctrlKey) {
        wheelEvent.preventDefault();
        const delta = wheelEvent.deltaY > 0 ? -10 : 10;
        setPreviewZoom(prev => {
          const next = prev + delta;
          return Math.min(Math.max(next, 20), 200);
        });
      }
    };

    // Use non-passive listener to prevent default zoom
    container.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      container.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Generate PDF
  const generatePDF = async () => {
    if (!currentFile) return;
    setStatusText('正在生成 PDF...');
    setIsRendering(true);

    try {
      const arrayBuffer = await currentFile.arrayBuffer();
      const srcDoc = await PDFDocument.load(arrayBuffer);
      const outDoc = await PDFDocument.create();
      
      const params = getParams();
      const layout = calculateLayout(params, 1);
      const grid = layout.grid;

      // 仅使用未被删除的页，删除后按剩余页重新排版
      const keptSrcIndices = activeIndices;
      const total = keptSrcIndices.length;

      if (total === 0) {
          alert('没有可排版的页面');
          setIsRendering(false);
          setStatusText('就绪');
          return;
      }

      const totalSheets = Math.ceil(total / params.nup);
      const selectedSheetIndices = parsePageRange(pageRange, totalSheets);

      if (selectedSheetIndices.length === 0) {
          alert('没有选择有效的导出页面');
          setIsRendering(false);
          setStatusText('就绪');
          return;
      }

      const embeddedPageNoFont = pageNo.enabled
        ? await outDoc.embedFont(PDF_STANDARD_FONTS[pageNo.font][pageNo.bold ? 'bold' : 'regular'])
        : null;

      const hexToRgb = (hex: string) => {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
          r: parseInt(result[1], 16) / 255,
          g: parseInt(result[2], 16) / 255,
          b: parseInt(result[3], 16) / 255
        } : { r: 0, g: 0, b: 0 };
      };

      for (let exportIndex = 0; exportIndex < selectedSheetIndices.length; exportIndex++) {
        const sheetIndex = selectedSheetIndices[exportIndex];
        const outPage = outDoc.addPage([layout.pageSize.w, layout.pageSize.h]);
        if (params.orientation === 'landscape') outPage.setRotation(degrees(0));

        const startIndex = sheetIndex * params.nup;
        const endIndex = Math.min(startIndex + params.nup, total);
        
        // 逻辑下标 → 原文件下标（跳过已删除页）
        const batchEntries = keptSrcIndices.slice(startIndex, endIndex);
        const sourceSlots: number[] = [];
        const batchIndices: number[] = [];
        batchEntries.forEach((srcIndex, slot) => {
          if (srcIndex !== null) {
            sourceSlots.push(slot);
            batchIndices.push(srcIndex);
          }
        });

        const srcPages = batchIndices.length > 0 ? await outDoc.copyPages(srcDoc, batchIndices) : [];

        const embeddedPages = await Promise.all(srcPages.map(p => {
            const { width, height } = p.getSize();
            const left = width * params.crop.l;
            const right = width * (1 - params.crop.r);
            const bottom = height * params.crop.b;
            const top = height * (1 - params.crop.t);
            return outDoc.embedPage(p, { left, right, bottom, top });
        }));

        for (let i = 0; i < embeddedPages.length; i++) {
          const ep = embeddedPages[i];
          const cell = layout.cells[sourceSlots[i]];
            
            const cellW = cell.cellW;
            const cellH = cell.cellH;
            
            const epAspect = ep.width / ep.height;
            const cellAspect = cellW / cellH;
            
            let drawW = cellW;
            let drawH = cellH;
            
            if (epAspect > cellAspect) {
                drawH = drawW / epAspect;
            } else {
                drawW = drawH * epAspect;
            }
            
            drawW *= params.scalePct / 100;
            drawH *= params.scalePct / 100;
            
            const cellX = cell.col * cellW + mm2pt(params.margin);
            const cellY = mm2pt(params.margin) + (grid.rows - 1 - cell.row) * cellH;
            
            const dx = cellX + (cellW - drawW) / 2 + mm2pt(params.offset.x);
            const dy = cellY + (cellH - drawH) / 2 + mm2pt(params.offset.y);

            outPage.drawPage(ep, {
                x: dx,
                y: dy,
                width: drawW,
                height: drawH
            });

            if (params.border) {
                const c = hexToRgb(params.borderColor);
                outPage.drawRectangle({
                    x: dx,
                    y: dy,
                    width: drawW,
                    height: drawH,
                    borderColor: rgb(c.r, c.g, c.b),
                    borderWidth: params.borderWidth,
                    opacity: 0,
                    borderOpacity: 1
                });
            }
        }

        // 页码（与预览一致：半页边距内、按设定字体/字号/粗细绘制、深灰）
        if (embeddedPageNoFont) {
            const label = formatPageNo(pageNo.start + exportIndex, pageNo.format, selectedSheetIndices.length);
            const fs = pageNo.fontSize;
            const textW = embeddedPageNoFont.widthOfTextAtSize(label, fs);
            const pad = Math.max(mm2pt(params.margin) / 2, 4);
            const pageW = layout.pageSize.w;
            const pageH = layout.pageSize.h;
            const isTop = pageNo.pos.startsWith('top');
            const isRight = pageNo.pos.endsWith('right');

            const x = isRight ? pageW - pad - textW : (pageW - textW) / 2;
            const y = isTop ? pageH - pad - fs : pad;

            outPage.drawText(label, {
                x,
                y,
                size: fs,
                font: embeddedPageNoFont,
                color: rgb(0.12, 0.16, 0.23),
                opacity: 0.75,
            });
        }
      }

      const pdfBytes = await outDoc.save();
      const blob = new Blob([pdfBytes as any], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      const originalName = currentFile.name.replace(/\.pdf$/i, '');
      link.download = `${originalName}-拼版.pdf`;
      link.click();
      setStatusText('完成!');
    } catch (e) {
      console.error(e);
      setStatusText('生成失败');
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="w-full p-0 m-0 flex items-center justify-center h-[calc(100vh-80px)] bg-transparent bg-cover font-sans font-normal overflow-hidden text-[var(--text)]">
      {/* SVG Filter */}
      <svg style={{ display: 'none' }}>
        <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox">
            <feTurbulence type="fractalNoise" baseFrequency="0.01" numOctaves="1" seed="5" result="turbulence" />
            <feDisplacementMap in="SourceGraphic" in2="turbulence" scale="20" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </svg>

      <LiquidAppLayout onFileDrop={handleFileDrop}>
        <div className="sidebar liquid-glass-wrapper w-[340px] shrink-0 flex-col">
            <div className="liquid-glass-effect"></div>
            <div className="liquid-glass-tint"></div>
            <div className="liquid-glass-shine"></div>
            <div className="liquid-glass-text sidebarContent flex flex-col px-7 overflow-y-auto h-[calc(100%-3rem)] w-full my-6">
                <div className="header mb-6">
                    <div className="title text-2xl font-bold mb-1.5 text-[var(--text)]">PDF 拼版工具</div>
                    <div className="subtitle text-sm text-[var(--subtitle-color)] font-medium">布局与预览</div>
                </div>

                <div className="controls flex flex-col gap-5">
                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">源文件</label>
                        <div 
                            className="fileUploadWrapper liquid-glass-wrapper w-full min-h-[44px] cursor-pointer rounded-xl transition-all duration-200 hover:scale-[1.02]"
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <div className="liquid-glass-effect"></div>
                            <div className="liquid-glass-tint"></div>
                            <div className="liquid-glass-shine"></div>
                            <div className="liquid-glass-text fileUploadContent flex items-center justify-center p-2.5 text-sm text-[var(--text)] text-center">
                                <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    accept="application/pdf" 
                                    className="hidden"
                                    onChange={handleFileChange}
                                />
                                <span>{fileName}</span>
                            </div>
                        </div>
                    </div>

                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">页面管理</label>
                        {pageThumbnails.length === 0 ? (
                            <div className="text-xs text-[var(--text-sec)]">请先选择 PDF 文件</div>
                        ) : (
                            <>
                                <div className="text-[11px] text-[var(--text-sec)] leading-relaxed">
                                    点击页码立即删除；也可输入页码范围删除。点击已删除（划线红）的页码可单独恢复。
                                </div>
                                <div className="flex gap-1.5">
                                    <div className="flex-1 h-8 rounded-lg bg-[var(--input-bg)] border border-[var(--input-border)] flex items-center px-2">
                                        <input
                                            type="text"
                                            value={deleteRange}
                                            onChange={e => setDeleteRange(e.target.value)}
                                            onKeyDown={e => { if (e.key === 'Enter') deletePagesByRange(); }}
                                            placeholder="页码范围，如 1-5, 8"
                                            className="w-full bg-transparent border-none outline-none text-[11px] text-[var(--text)] placeholder:text-[var(--text-sec)]"
                                        />
                                    </div>
                                    <button
                                        type="button"
                                        onClick={deletePagesByRange}
                                        disabled={!deleteRange.trim()}
                                        className="h-8 px-2.5 rounded-lg text-[11px] font-semibold border border-red-400/50 text-red-500 bg-red-500/10 transition-all hover:bg-red-500/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-red-500/10"
                                    >
                                        删范围
                                    </button>
                                </div>
                                <div
                                    ref={pageGridRef}
                                    className="relative overflow-y-auto overflow-x-hidden pr-1"
                                    style={{ height: PAGE_GRID_VIEW_H }}
                                    onScroll={(e) => setGridScrollTop(e.currentTarget.scrollTop)}
                                >
                                    {/* 撑起滚动条的占位层 */}
                                    <div style={{ height: pageRowCount * PAGE_GRID_ROW_H, position: 'relative' }}>
                                        {visiblePageRows.map(row => (
                                            <div
                                                key={row}
                                                className="absolute left-0 right-0 grid grid-cols-6 gap-1.5"
                                                style={{ top: row * PAGE_GRID_ROW_H }}
                                            >
                                                {Array.from({ length: PAGE_GRID_COLS }, (_, c) => row * PAGE_GRID_COLS + c).map(i => {
                                                    if (i >= pageThumbnails.length) return <div key={i} className="h-7" />;
                                                    const isRemoved = removedPages.has(i);
                                                    return (
                                                        <button
                                                            key={i}
                                                            type="button"
                                                            onClick={() => isRemoved ? restorePage(i) : removePagesFromOrder(new Set([i]))}
                                                            title={isRemoved ? `第 ${i + 1} 页（已删除，点击恢复）` : `第 ${i + 1} 页（点击立即删除）`}
                                                            className={[
                                                                'h-7 rounded-md text-[11px] font-semibold border transition-all duration-150',
                                                                isRemoved
                                                                    ? 'bg-red-500/10 border-red-400/40 text-red-500/60 line-through cursor-pointer hover:bg-red-500/20 hover:border-red-400/70'
                                                                : 'bg-[var(--input-bg)] border-[var(--input-border)] text-[var(--text)] hover:border-red-400/60'
                                                            ].join(' ')}
                                                        >
                                                            {i + 1}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="text-[11px] text-[var(--text-sec)]">
                                    共 {pageThumbnails.length} 页 · 保留 {activeIndices.length} 页{removedPages.size > 0 ? ` · 已删 ${removedPages.size} 页` : ''}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">布局设置</label>
                        <div className="row flex gap-2.5 items-center">
                            <GlassSelect 
                                value={nup}
                                onChange={(v) => setNup(Number(v))}
                                options={[
                                    { value: 2, label: '2 页 / 张' },
                                    { value: 4, label: '4 页 / 张' },
                                    { value: 6, label: '6 页 / 张' },
                                    { value: 8, label: '8 页 / 张' },
                                ]}
                            />
                            <GlassSelect 
                                value={orient}
                                onChange={(v) => setOrient(v)}
                                options={[
                                    { value: 'portrait', label: '纵向' },
                                    { value: 'landscape', label: '横向' },
                                ]}
                            />
                        </div>
                    </div>

                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">样式设置</label>
                        <div 
                            className="row flex gap-2.5 items-center cursor-pointer" 
                            onClick={() => setBorder(!border)}
                        >
                            <div className={`checkboxGlass liquid-glass-wrapper w-6 h-6 rounded-lg cursor-pointer shrink-0 ${border ? 'checked' : ''} dark:border dark:border-white/20 dark:bg-white/5`}>
                                <div className="liquid-glass-effect"></div>
                                <div className={`liquid-glass-tint ${border ? '!bg-blue-500/30' : ''}`}></div>
                                <div className="liquid-glass-shine"></div>
                                <div className="liquid-glass-text checkboxInner flex items-center justify-center text-[var(--text)]">
                                    <div className={`transform transition-all duration-200 ${border ? 'opacity-100 scale-100' : 'opacity-0 scale-75'}`}>
                                        <CheckIcon />
                                    </div>
                                </div>
                            </div>
                            <span style={{ marginLeft: '10px', fontSize: '14px', fontWeight: 500 }}>显示分割线</span>
                        </div>
                        
                        {border && (
                            <div className="row flex gap-2.5 items-center mt-2.5">
                                <div className="colorPickerWrapper liquid-glass-wrapper w-11 h-11 rounded-xl cursor-pointer overflow-hidden shrink-0 dark:border dark:border-white/20 dark:bg-white/5">
                                    <div className="liquid-glass-effect"></div>
                                    <div className="liquid-glass-tint"></div>
                                    <div className="liquid-glass-shine"></div>
                                    <div className="liquid-glass-text colorPickerContent flex items-center justify-center">
                                        <input 
                                            type="color" 
                                            value={borderColor}
                                            onChange={e => setBorderColor(e.target.value)}
                                            className="w-[150%] h-[150%] p-0 m-[-25%] bg-transparent border-none cursor-pointer appearance-none"
                                        />
                                    </div>
                                </div>
                                <div className="inputGlassWrapper liquid-glass-wrapper w-full h-9 rounded-[10px]">
                                    <div className="liquid-glass-effect"></div>
                                    <div className="liquid-glass-tint"></div>
                                    <div className="liquid-glass-shine"></div>
                                    <div className="liquid-glass-text flex items-center">
                                        <input 
                                            type="number" 
                                            value={borderWidth}
                                            min="0.5" max="10" step="0.5"
                                            onChange={e => setBorderWidth(Number(e.target.value))}
                                            placeholder="粗细"
                                            className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]"
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">缩放 ({scalePct}%)</label>
                        <input 
                            type="range" 
                            min="50" max="100" step="1" 
                            value={scalePct}
                            onChange={e => setScalePct(Number(e.target.value))}
                            className="w-full h-1.5 bg-[var(--input-border)] rounded-full appearance-none outline-none my-2.5 backdrop-blur-sm cursor-pointer"
                        />
                    </div>

                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">裁剪 (上/下/左/右 %)</label>
                        <div className="row flex gap-2.5 items-center">
                            <LiquidGlass className="inputGlassWrapper w-full h-9 rounded-[10px]">
                                <input className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]" type="number" value={crop.t} onChange={e => setCrop({...crop, t: Number(e.target.value)})} placeholder="上" min="0" max="20" />
                            </LiquidGlass>
                            <LiquidGlass className="inputGlassWrapper w-full h-9 rounded-[10px]">
                                <input className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]" type="number" value={crop.b} onChange={e => setCrop({...crop, b: Number(e.target.value)})} placeholder="下" min="0" max="20" />
                            </LiquidGlass>
                        </div>
                        <div className="row flex gap-2.5 items-center">
                            <LiquidGlass className="inputGlassWrapper w-full h-9 rounded-[10px]">
                                <input className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]" type="number" value={crop.l} onChange={e => setCrop({...crop, l: Number(e.target.value)})} placeholder="左" min="0" max="20" />
                            </LiquidGlass>
                            <LiquidGlass className="inputGlassWrapper w-full h-9 rounded-[10px]">
                                <input className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]" type="number" value={crop.r} onChange={e => setCrop({...crop, r: Number(e.target.value)})} placeholder="右" min="0" max="20" />
                            </LiquidGlass>
                        </div>
                    </div>

                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">偏移 (X/Y mm)</label>
                        <div className="row flex gap-2.5 items-center">
                            <LiquidGlass className="inputGlassWrapper w-full h-9 rounded-[10px]">
                                <input className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]" type="number" value={offset.x} onChange={e => setOffset({...offset, x: Number(e.target.value)})} placeholder="X" min="-50" max="50" />
                            </LiquidGlass>
                            <LiquidGlass className="inputGlassWrapper w-full h-9 rounded-[10px]">
                                <input className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]" type="number" value={offset.y} onChange={e => setOffset({...offset, y: Number(e.target.value)})} placeholder="Y" min="-50" max="50" />
                            </LiquidGlass>
                        </div>
                    </div>

                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">页边距 (mm)</label>
                        <LiquidGlass className="inputGlassWrapper w-full h-9 rounded-[10px]">
                            <input className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]" type="number" value={margin} onChange={e => setMargin(Number(e.target.value))} min="0" max="50" />
                        </LiquidGlass>
                    </div>

                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">页面范围 (例如: 1-5, 8)</label>
                        <div className={`inputGlassWrapper liquid-glass-wrapper w-full h-9 rounded-[10px]`}>
                            <div className="liquid-glass-effect"></div>
                            <div className="liquid-glass-tint"></div>
                            <div className="liquid-glass-shine"></div>
                            <div className="liquid-glass-text flex items-center">
                                <input 
                                    type="text" 
                                    value={pageRange} 
                                    onChange={e => setPageRange(e.target.value)} 
                                    placeholder="全部 (留空)" 
                                    className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]"
                                />
                            </div>
                        </div>
                    </div>
                    <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
                        <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">页码</label>
                        <CheckboxRow checked={pageNoEnabled} onChange={setPageNoEnabled} label="添加页码" />
                        {pageNoEnabled && (
                            <>
                                <div className="row flex gap-2.5 items-center">
                                    <GlassSelect
                                        value={pageNoPos}
                                        onChange={(v) => setPageNoPos(v as PageNoPos)}
                                        options={[
                                            { value: 'bottom-center', label: '底部居中' },
                                            { value: 'bottom-right', label: '右下角' },
                                            { value: 'top-center', label: '顶部居中' },
                                            { value: 'top-right', label: '右上角' },
                                        ]}
                                    />
                                    <GlassSelect
                                        value={pageNoFormat}
                                        onChange={(v) => setPageNoFormat(v as PageNoFormat)}
                                        options={[
                                            { value: 'plain', label: '1' },
                                            { value: 'slash', label: '1 / N' },
                                            { value: 'dash', label: '- 1 -' },
                                        ]}
                                    />
                                </div>
                                <div className="row flex gap-2.5 items-center">
                                    <span className="text-xs text-[var(--text-sec)] shrink-0">起始页码</span>
                                    <LiquidGlass className="inputGlassWrapper w-full h-9 rounded-[10px]">
                                        <input
                                            type="number"
                                            value={pageNoStart}
                                            min={0}
                                            onChange={e => setPageNoStart(Number(e.target.value))}
                                            className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]"
                                        />
                                    </LiquidGlass>
                                </div>

                                <div className="row flex gap-2.5 items-center">
                                    <span className="text-xs text-[var(--text-sec)] shrink-0">字体</span>
                                    <GlassSelect
                                        value={pageNoFont}
                                        onChange={(v) => setPageNoFont(v as PageNoFontFamily)}
                                        options={[
                                            { value: 'helvetica', label: 'Helvetica' },
                                            { value: 'times', label: 'Times' },
                                            { value: 'courier', label: 'Courier' },
                                        ]}
                                    />
                                </div>

                                <div className="row flex gap-2.5 items-center">
                                    <span className="text-xs text-[var(--text-sec)] shrink-0">字号 (pt)</span>
                                    <LiquidGlass className="inputGlassWrapper w-full h-9 rounded-[10px]">
                                        <input
                                            type="number"
                                            value={pageNoFontSize}
                                            min={6}
                                            max={48}
                                            step={1}
                                            onChange={e => {
                                                const v = Number(e.target.value);
                                                if (!Number.isNaN(v)) setPageNoFontSize(Math.min(48, Math.max(6, v)));
                                            }}
                                            className="w-full h-full bg-transparent border-none px-3 text-sm outline-none text-[var(--text)]"
                                        />
                                    </LiquidGlass>
                                </div>

                                <CheckboxRow checked={pageNoBold} onChange={setPageNoBold} label="加粗" />
                            </>
                        )}
                    </div>
                </div>

                <div className="actionsFooter mt-auto pt-5 flex flex-col gap-2.5">
                    <div className="status text-xs text-[var(--text-sec)] text-center flex items-center justify-center gap-2.5 w-full">
                        <span>{isRendering ? '处理中...' : statusText}</span>
                    </div>
                    <button 
                        className="btn liquid-btn" 
                        disabled={!currentFile || isRendering}
                        onClick={generatePDF}
                    >
                        生成 PDF
                    </button>
                </div>
            </div>
        </div>

        <div className={`mainArea liquid-glass-wrapper w-full flex-1 min-w-0`}>
            <div className="liquid-glass-effect"></div>
            <div className="liquid-glass-tint"></div>
            <div className="liquid-glass-shine"></div>
            <div className={`liquid-glass-text mainAreaContent flex flex-col overflow-hidden h-full rounded-[1.8rem] relative`}>
                <div className="previewControls absolute top-5 right-5 z-10 w-[200px] bg-[var(--card-bg)] backdrop-blur-md p-2.5 rounded-xl shadow-md border border-[var(--control-group-border)]">
                    <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1.5 block">预览缩放 ({previewZoom}%)</label>
                    <input 
                        type="range" 
                        min="20" max="200" step="10" 
                        value={previewZoom}
                        onChange={e => setPreviewZoom(Number(e.target.value))}
                        className="w-full h-1.5 bg-[var(--input-border)] rounded-full appearance-none outline-none m-0 backdrop-blur-sm cursor-pointer"
                    />
                </div>
                {isRendering && (
                    <div className="previewProgressOverlay absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/60 dark:bg-black/60 backdrop-blur-md rounded-[1.8rem]">
                        <div className="progressCard bg-[var(--card-bg)] p-8 rounded-3xl shadow-lg border border-[var(--control-group-border)] w-[300px] text-center">
                            <div className="progressTitle text-lg font-semibold mb-4 text-[var(--text)]">{statusText}</div>
                            <div className="progressTrack w-full h-2 bg-black/10 dark:bg-white/10 rounded-full overflow-hidden mb-2.5">
                                <div className="progressBarFill h-full bg-[var(--primary)] transition-all duration-300 rounded-full" style={{ width: `${progress}%` }}></div>
                            </div>
                            <div className="progressText text-sm text-[var(--text-sec)]">{progress}%</div>
                        </div>
                    </div>
                )}
                <div className="previewContainer flex-1 flex overflow-auto px-5 mb-6 relative" ref={previewContainerRef}>
                    <div className="previewList flex flex-col items-center m-auto pb-10">
                        {!layoutData ? (
                            <div className="emptyState text-[#555] mt-[20%]">请选择 PDF 文件进行预览</div>
                        ) : (
                            layoutData.selectedSheetIndices.length === 0 ? (
                                <div style={{ color: '#666', marginTop: '20%' }}>没有选择有效的页面</div>
                            ) : (
                                layoutData.selectedSheetIndices.map((sheetIndex, exportIndex) => (
                                    <PreviewSheet
                                        key={sheetIndex}
                                        sheetIndex={sheetIndex}
                                        exportIndex={exportIndex}
                                        exportTotal={layoutData.selectedSheetIndices.length}
                                        nup={layoutData.params.nup}
                                        pageThumbnails={activeThumbnails}
                                        layout={layoutData.layout}
                                        params={layoutData.params}
                                        previewZoom={previewZoom}
                                        pageNo={pageNo}
                                        pageLabels={activeIndices.map(i => i === null ? null : i + 1)}
                                        dragFromOrder={dragFromOrder}
                                        dragOverOrder={dragOverOrder}
                                        onPageDelete={deletePageByOrder}
                                        onPageAddBlank={addBlankPageAfter}
                                        onPageMove={movePageByOrder}
                                        onPageDragStart={(i) => setDragFromOrder(i)}
                                        onPageDragOver={(i) => setDragOverOrder(i)}
                                        onPageDragEnd={() => { setDragFromOrder(null); setDragOverOrder(null); }}
                                        onPageDrop={(i) => {
                                            if (dragFromOrder != null) movePageTo(dragFromOrder, i);
                                            else { setDragFromOrder(null); setDragOverOrder(null); }
                                        }}
                                    />
                                ))
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
      </LiquidAppLayout>
    </div>
  );
}

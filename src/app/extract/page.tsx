"use client";

import { useState, useEffect } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import { GlassSelect } from "@/components/ui/GlassSelect";

type ExportMode = 'separate' | 'combined';

export default function ExtractPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [format, setFormat] = useState<'jpg' | 'png'>('jpg');
  const [quality, setQuality] = useState<number>(0.9);
  const [exportMode, setExportMode] = useState<ExportMode>('separate');
  const [selectedPages, setSelectedPages] = useState<number[]>([]);
  const [pageRange, setPageRange] = useState('');
  const [rangeError, setRangeError] = useState('');
  const [notice, setNotice] = useState('');
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  useEffect(() => {
    getPdfJs();
  }, []);

  const onFileSelect = async (f: File) => {
    setFile(f);
    setThumbnails([]);
    setSelectedPages([]);
    setPageRange('');
    setRangeError('');
    setNotice('');
    const arrayBuffer = await f.arrayBuffer();
    try {
      const pdfjs = await getPdfJs();
      if (!pdfjs) return;

      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPageCount(pdf.numPages);
      setSelectedPages(Array.from({ length: pdf.numPages }, (_, i) => i + 1));
      generateThumbnails(pdf);
    } catch (e) {
      console.error(e);
      alert("无法读取该 PDF 文件，请确认文件有效且未加密。");
      setFile(null);
    }
  };

  const generateThumbnails = async (pdf: any) => {
    try {
      const thumbs: string[] = [];
      for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.5 });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (context) {
          canvas.height = viewport.height;
          canvas.width = viewport.width;
          await page.render({ canvasContext: context, viewport }).promise;
          thumbs.push(canvas.toDataURL());
        }
      }
      setThumbnails(thumbs);
    } catch (e) {
      console.error("Thumbnail error", e);
    }
  };

  const parsePageRange = (value: string, total: number): number[] | null => {
    const pages = new Set<number>();
    const tokens = value.split(/[,，;]/).map(token => token.trim());
    if (tokens.length === 0 || tokens.some(token => !token)) return null;
    for (const token of tokens) {
      const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(token);
      if (!match) return null;
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : start;
      if (start < 1 || end < start || end > total) return null;
      for (let page = start; page <= end; page++) pages.add(page);
    }
    return pages.size > 0 ? Array.from(pages).sort((a, b) => a - b) : null;
  };

  const applyPageRange = () => {
    const pages = parsePageRange(pageRange, pageCount);
    if (!pages) {
      setRangeError(`请输入 1–${pageCount} 范围内的页码或范围，例如 1-5, 8。`);
      return;
    }
    setSelectedPages(pages);
    setRangeError('');
    setNotice('');
  };

  const togglePage = (pageNumber: number) => {
    setSelectedPages(current => current.includes(pageNumber)
      ? current.length <= 1 ? current : current.filter(page => page !== pageNumber)
      : [...current, pageNumber].sort((a, b) => a - b));
    setRangeError('');
    setNotice('');
  };

  const getImageBlob = (canvas: HTMLCanvasElement): Promise<Blob> => new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('图片编码失败')),
      format === 'jpg' ? 'image/jpeg' : 'image/png',
      quality
    );
  });

  const extractImages = async () => {
    if (!file) return;
    if (selectedPages.length === 0) {
      setNotice('请至少保留一个页面再导出。');
      return;
    }
    setIsProcessing(true);
    setNotice('');
    let cleanupPdf: (() => Promise<void>) | null = null;
    try {
      const pdfjs = await getPdfJs();
      if (!pdfjs) return;

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      cleanupPdf = () => pdf.destroy();
      const baseName = file.name.replace(/\.pdf$/i, '');
      if (exportMode === 'separate') {
        const zip = new JSZip();
        const maxDimension = 30000;
        const maxPixels = 40_000_000;
        for (const pageNumber of selectedPages) {
          const page = await pdf.getPage(pageNumber);
          const baseViewport = page.getViewport({ scale: 1 });
          const scale = Math.min(
            2,
            maxDimension / baseViewport.width,
            maxDimension / baseViewport.height,
            Math.sqrt(maxPixels / (baseViewport.width * baseViewport.height)),
          );
          const viewport = page.getViewport({ scale });
          const canvas = document.createElement('canvas');
          try {
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            if (canvas.width > maxDimension || canvas.height > maxDimension || canvas.width * canvas.height > maxPixels) {
              throw new Error(`第 ${pageNumber} 页尺寸超过浏览器支持范围，无法导出图片。`);
            }
            const context = canvas.getContext('2d');
            if (!context) throw new Error('无法创建图片画布');
            await page.render({ canvasContext: context, viewport }).promise;
            zip.file(`page-${pageNumber}.${format}`, await getImageBlob(canvas));
          } finally {
            canvas.width = 0;
            canvas.height = 0;
          }
        }
        saveAs(await zip.generateAsync({ type: 'blob' }), `${baseName}-图片.zip`);
        setNotice(`已导出 ${selectedPages.length} 张图片，并打包为 ZIP。`);
      } else {
        const gapAtScaleOne = 20;
        const pages = await Promise.all(selectedPages.map(pageNumber => pdf.getPage(pageNumber)));
        const baseViewports = pages.map(page => page.getViewport({ scale: 1 }));
        const baseWidth = Math.max(...baseViewports.map(viewport => viewport.width));
        const baseHeight = baseViewports.reduce((height, viewport) => height + viewport.height, 0) + gapAtScaleOne * (pages.length - 1);
        const preferredScale = 2;
        const maxDimension = 30000;
        const maxPixels = 40_000_000;
        let scale = Math.min(
          preferredScale,
          maxDimension / (baseWidth * preferredScale),
          maxDimension / baseHeight,
          Math.sqrt(maxPixels / (baseWidth * baseHeight)),
        );

        let viewports: ReturnType<(typeof pages)[number]['getViewport']>[] = [];
        let scaledGap = 0;
        let canvasWidth = 0;
        let canvasHeight = 0;
        let dimensionsValid = false;
        for (let attempt = 0; attempt < 8; attempt++) {
          viewports = pages.map(page => page.getViewport({ scale }));
          scaledGap = Math.round(gapAtScaleOne * scale);
          canvasWidth = Math.ceil(Math.max(...viewports.map(viewport => viewport.width)));
          canvasHeight = viewports.reduce((height, viewport) => height + Math.ceil(viewport.height), 0)
            + scaledGap * (pages.length - 1);
          dimensionsValid = canvasWidth > 0
            && canvasHeight > 0
            && canvasWidth <= maxDimension
            && canvasHeight <= maxDimension
            && canvasWidth * canvasHeight <= maxPixels;
          if (dimensionsValid) break;
          scale *= 0.95;
        }

        if (!dimensionsValid) {
          throw new Error('所选页面合成后的长图尺寸仍超出浏览器支持范围，请减少选择的页面数量后重试。');
        }
        const adjustedNotice = scale < preferredScale
          ? `页面较多，长图分辨率已自动调整为 ${Math.max(1, Math.round((scale / preferredScale) * 100))}%，以避免超出浏览器图片尺寸限制。`
          : '';
        const canvas = document.createElement('canvas');
        try {
          canvas.width = canvasWidth;
          canvas.height = canvasHeight;
          const context = canvas.getContext('2d');
          if (!context) throw new Error('无法创建长图画布');
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          let offsetY = 0;
          for (let i = 0; i < pages.length; i++) {
            const viewport = viewports[i];
            const pageCanvas = document.createElement('canvas');
            try {
              pageCanvas.width = Math.ceil(viewport.width);
              pageCanvas.height = Math.ceil(viewport.height);
              const pageContext = pageCanvas.getContext('2d');
              if (!pageContext) throw new Error(`无法创建第 ${selectedPages[i]} 页的画布`);
              await pages[i].render({ canvasContext: pageContext, viewport }).promise;
              context.drawImage(pageCanvas, (canvas.width - pageCanvas.width) / 2, offsetY);
              offsetY += pageCanvas.height + scaledGap;
            } finally {
              pageCanvas.width = 0;
              pageCanvas.height = 0;
            }
          }
          saveAs(await getImageBlob(canvas), `${baseName}-长图.${format}`);
        } finally {
          canvas.width = 0;
          canvas.height = 0;
        }
        setNotice(adjustedNotice
          ? `已将 ${selectedPages.length} 个页面合并为一张长图。${adjustedNotice}`
          : `已将 ${selectedPages.length} 个页面合并为一张长图。`);
      }
    } catch (error) {
      console.error(error);
      setNotice(error instanceof Error ? `导出失败：${error.message}` : '导出图片失败，请检查 PDF 文件后重试。');
    } finally {
      if (cleanupPdf) {
        try {
          await cleanupPdf();
        } catch (cleanupError) {
          console.warn('释放 PDF 资源失败:', cleanupError);
        }
      }
      setIsProcessing(false);
    }
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={onFileSelect}>
        <LiquidSidebar title="PDF 页面提取" subtitle="将 PDF 页面导出为图片">
          <LiquidControlGroup label="源文件">
            <LiquidFileUpload onFileSelect={onFileSelect} fileName={file?.name} />
          </LiquidControlGroup>
          
          <LiquidControlGroup label="导出方式">
            <GlassSelect
              value={exportMode}
              onChange={setExportMode}
              options={[
                { value: 'separate', label: '每页单独导出图片（ZIP）' },
                { value: 'combined', label: '所有页面合并为一张长图' },
              ]}
            />
          </LiquidControlGroup>

          <LiquidControlGroup label="图片格式">
            <GlassSelect 
                value={format}
                onChange={setFormat}
                options={[
                    { value: 'jpg', label: 'JPG（文件较小）' },
                    { value: 'png', label: 'PNG（无损）' }
                ]}
            />
          </LiquidControlGroup>

          {format === 'jpg' && (
              <LiquidControlGroup label={`JPG 图片质量（${Math.round(quality * 100)}%）`}>
                 <input 
                    type="range" 
                    min="0.1" max="1.0" step="0.1" 
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full h-1.5 bg-[var(--input-border)] rounded-full appearance-none outline-none my-2.5 backdrop-blur-sm cursor-pointer"
                 />
              </LiquidControlGroup>
          )}

          {file && (
            <LiquidControlGroup label="页面选择">
              <p className="text-xs text-[var(--text-sec)]">共 {pageCount} 页，当前选择 {selectedPages.length} 页</p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={pageRange}
                  onChange={event => { setPageRange(event.target.value); setRangeError(''); }}
                  onKeyDown={event => { if (event.key === 'Enter') applyPageRange(); }}
                  placeholder={`页码范围，如 1-5, 8（1–${pageCount}）`}
                  className="min-w-0 flex-1 rounded-lg border border-[var(--input-border)] bg-transparent px-2 text-xs text-[var(--text)] outline-none"
                  aria-label="需要提取的页码范围"
                />
                <button type="button" onClick={applyPageRange} className="rounded-lg border border-[var(--input-border)] px-2.5 text-xs text-[var(--text)]">应用</button>
              </div>
              {rangeError && <p className="text-xs text-red-500" role="alert">{rangeError}</p>}
              <div className="max-h-28 overflow-y-auto rounded-lg border border-[var(--input-border)] p-2">
                <div className="grid grid-cols-6 gap-1.5">
                  {Array.from({ length: pageCount }, (_, index) => {
                    const pageNumber = index + 1;
                    const selected = selectedPages.includes(pageNumber);
                    return (
                      <button
                        key={pageNumber}
                        type="button"
                        onClick={() => togglePage(pageNumber)}
                        aria-pressed={selected}
                        title={selected ? `第 ${pageNumber} 页（点击排除）` : `第 ${pageNumber} 页（点击恢复）`}
                        className={`h-7 rounded-md border text-[11px] font-semibold ${selected ? 'border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text)]' : 'border-red-400/40 bg-red-500/10 text-red-500/70 line-through'}`}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setSelectedPages(Array.from({ length: pageCount }, (_, index) => index + 1)); setRangeError(''); }}
                className="h-8 rounded-lg border border-[var(--input-border)] text-xs text-[var(--text)]"
              >
                全选页面
              </button>
            </LiquidControlGroup>
          )}

          <div className="mt-auto">
             <LiquidButton onClick={extractImages} disabled={!file || isProcessing || selectedPages.length === 0 || Boolean(rangeError)} isLoading={isProcessing}>
                {exportMode === 'separate' ? `导出 ${selectedPages.length} 页图片（ZIP）` : `合并 ${selectedPages.length} 页为长图`}
             </LiquidButton>
          </div>
        </LiquidSidebar>

        <LiquidMainArea className="p-8">
            <div className="h-full overflow-y-auto">
                {file ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
                        {thumbnails.map((src, idx) => {
                          const pageNumber = idx + 1;
                          const selected = selectedPages.includes(pageNumber);
                          return (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => togglePage(pageNumber)}
                              aria-pressed={selected}
                              className={`flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-2 text-left transition-all ${selected ? 'border-emerald-500' : 'border-transparent opacity-50 grayscale'}`}
                            >
                              <div className="relative overflow-hidden rounded-lg bg-white shadow-lg transition-transform hover:scale-105">
                                <img src={src} alt={`第 ${pageNumber} 页预览`} className="max-w-full h-auto" />
                                <div className="absolute bottom-0 right-0 rounded-tl-lg bg-black/50 px-2 py-1 text-xs text-white">第 {pageNumber} 页</div>
                              </div>
                            </button>
                          );
                        })}
                        {pageCount > 20 && (
                            <div className="flex items-center justify-center text-[var(--text-sec)] text-sm col-span-full py-10">
                                预览仅显示前 20 页；可通过左侧页码范围选择其余页面
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-sec)]">
                        <p className="text-lg">请选择 PDF 文件以预览页面</p>
                    </div>
                )}
                {notice && (
                  <div className="fixed bottom-8 left-1/2 z-50 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-[var(--control-group-border)] bg-[var(--card-bg)] px-4 py-3 text-sm text-[var(--text)] shadow-xl" role="status">
                    {notice}
                  </div>
                )}
            </div>
        </LiquidMainArea>
      </LiquidAppLayout>
    </LiquidContainer>
  );
}

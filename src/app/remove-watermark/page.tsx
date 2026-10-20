"use client";

import { useRef, useState } from "react";
import { PDFArray, PDFDocument, PDFName, rgb } from "pdf-lib";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import {
  LiquidContainer,
  LiquidAppLayout,
  LiquidSidebar,
  LiquidMainArea,
  LiquidControlGroup,
  LiquidButton,
} from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ChevronRight,
  FileSearch,
  Layers,
  MousePointer2,
  RotateCcw,
} from "lucide-react";

type PdfViewport = {
  width: number;
  height: number;
  scale: number;
  convertToPdfPoint: (x: number, y: number) => [number, number];
  convertToViewportPoint: (x: number, y: number) => [number, number];
};

type PdfPageProxy = {
  getViewport: (options: { scale: number }) => PdfViewport;
  getAnnotations: () => Promise<Array<{ subtype?: string }>>;
  render: (parameters: { canvasContext: CanvasRenderingContext2D; viewport: PdfViewport; canvas: HTMLCanvasElement }) => { promise: Promise<void> };
  getOperatorList: () => Promise<{ fnArray: number[]; argsArray: unknown[][] }>;
};

type PdfDocumentProxy = {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfPageProxy>;
};

type Region = {
  id: string;
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

type WatermarkCandidate = {
  id: string;
  xRatio: number;
  yRatio: number;
  widthRatio: number;
  heightRatio: number;
  pagesMatched: number;
  sampleCount: number;
  description: string;
};

type AnnotationSummary = {
  page: number;
  count: number;
  types: string[];
};

type DragRect = { startX: number; startY: number; x: number; y: number };

const SAMPLE_PAGE_LIMIT = 24;

const readMatrixValues = (value: unknown): number[] | null => {
  if (Array.isArray(value) && value.length >= 6) return value.slice(0, 6).map(Number);
  if (!value || typeof value !== "object") return null;
  const matrix = value as Record<string, unknown>;
  const values = [0, 1, 2, 3, 4, 5].map(index => Number(matrix[String(index)]));
  return values.every(Number.isFinite) ? values : null;
};

const readBoxValues = (value: unknown): number[] | null => {
  if (Array.isArray(value) && value.length >= 4) return value.slice(0, 4).map(Number);
  if (!value || typeof value !== "object") return null;
  const box = value as Record<string, unknown>;
  const values = [0, 1, 2, 3].map(index => Number(box[String(index)]));
  return values.every(Number.isFinite) ? values : null;
};

const getTransformedBounds = (matrix: number[], box: number[]) => {
  const [a, b, c, d, e, f] = matrix;
  const points = [
    [box[0], box[1]], [box[0], box[3]], [box[2], box[1]], [box[2], box[3]],
  ].map(([x, y]) => [a * x + c * y + e, b * x + d * y + f]);
  const xs = points.map(point => point[0]);
  const ys = points.map(point => point[1]);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
};

const findRepeatedImageCandidates = async (documentProxy: PdfDocumentProxy, pdfjs: { OPS: Record<string, number> }, onProgress: (progress: number) => void) => {
  const sampleCount = Math.min(documentProxy.numPages, SAMPLE_PAGE_LIMIT);
  const samplePages = Array.from({ length: sampleCount }, (_, index) =>
    Math.min(documentProxy.numPages, Math.floor(index * documentProxy.numPages / sampleCount) + 1));
  const placements = new Map<string, { rect: { x: number; y: number; width: number; height: number }; pageIds: Set<number> }>();

  for (let sampleIndex = 0; sampleIndex < samplePages.length; sampleIndex++) {
    const pageNumber = samplePages[sampleIndex];
    const page = await documentProxy.getPage(pageNumber);
    const pageSize = page.getViewport({ scale: 1 });
    const operators = await page.getOperatorList();
    const pagePlacements = new Map<string, { x: number; y: number; width: number; height: number }>();
    let formDepth = 0;
    const findPreviousTransform = (index: number) => {
      for (let previous = index - 1; previous >= Math.max(0, index - 8); previous--) {
        if (operators.fnArray[previous] === pdfjs.OPS.transform) {
          return readMatrixValues(operators.argsArray[previous]);
        }
        if (operators.fnArray[previous] === pdfjs.OPS.paintFormXObjectBegin || operators.fnArray[previous] === pdfjs.OPS.paintFormXObjectEnd) break;
      }
      return null;
    };

    for (let index = 0; index < operators.fnArray.length; index++) {
      const operation = operators.fnArray[index];
      let rect: { x: number; y: number; width: number; height: number } | null = null;

      if (operation === pdfjs.OPS.paintFormXObjectBegin) {
        const args = operators.argsArray[index];
        const matrix = readMatrixValues(args?.[0]);
        const bounds = readBoxValues(args?.[1]);
        const parentMatrix = findPreviousTransform(index);
        if (matrix && bounds && parentMatrix) {
          const [a, b, c, d, e, f] = matrix;
          const combined = [
            parentMatrix[0] * a + parentMatrix[2] * b,
            parentMatrix[1] * a + parentMatrix[3] * b,
            parentMatrix[0] * c + parentMatrix[2] * d,
            parentMatrix[1] * c + parentMatrix[3] * d,
            parentMatrix[0] * e + parentMatrix[2] * f + parentMatrix[4],
            parentMatrix[1] * e + parentMatrix[3] * f + parentMatrix[5],
          ];
          rect = getTransformedBounds(combined, bounds);
        }
        formDepth++;
      } else if (operation === pdfjs.OPS.paintFormXObjectEnd) {
        formDepth = Math.max(0, formDepth - 1);
      } else if (operation === pdfjs.OPS.paintImageXObject) {
        if (formDepth > 0) continue;
        const args = operators.argsArray[index];
        const matrix = findPreviousTransform(index);
        const imageWidth = Number(args?.[1]);
        const imageHeight = Number(args?.[2]);
        if (matrix && imageWidth > 0 && imageHeight > 0) {
          rect = getTransformedBounds(matrix, [0, 0, 1, 1]);
        }
      }

      if (!rect || rect.width < pageSize.width * 0.1 || rect.height < pageSize.height * 0.012) continue;
      const xRatio = rect.x / pageSize.width;
      const yRatio = rect.y / pageSize.height;
      const widthRatio = rect.width / pageSize.width;
      const heightRatio = rect.height / pageSize.height;
      const key = [xRatio, yRatio, widthRatio, heightRatio].map(value => value.toFixed(2)).join(":");
      pagePlacements.set(key, { x: xRatio, y: yRatio, width: widthRatio, height: heightRatio });
    }

    for (const [key, rect] of pagePlacements) {
      const existing = placements.get(key) ?? { rect, pageIds: new Set<number>() };
      existing.pageIds.add(pageNumber);
      placements.set(key, existing);
    }
    onProgress(Math.round(((sampleIndex + 1) / samplePages.length) * 100));
  }

  const minimumMatches = Math.max(3, Math.ceil(sampleCount * 0.3));
  return [...placements.entries()]
    .filter(([, candidate]) => candidate.pageIds.size >= minimumMatches)
    .map(([id, candidate], index) => ({
      id,
      xRatio: candidate.rect.x,
      yRatio: candidate.rect.y,
      widthRatio: candidate.rect.width,
      heightRatio: candidate.rect.height,
      pagesMatched: candidate.pageIds.size,
      sampleCount,
      description: candidate.rect.height < 0.04 ? `页眉图像水印候选 ${index + 1}` : `重复图形水印候选 ${index + 1}`,
    }))
    .sort((a, b) => b.pagesMatched - a.pagesMatched);
};

const PREVIEW_MAX_DIMENSION = 1500;
const MIN_SELECTION_SIZE = 5;

export default function RemoveWatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [pdfProxy, setPdfProxy] = useState<PdfDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [viewport, setViewport] = useState<PdfViewport | null>(null);
  const [annotationsByPage, setAnnotationsByPage] = useState<AnnotationSummary[]>([]);
  const [selectedAnnotationPages, setSelectedAnnotationPages] = useState<Set<number>>(new Set());
  const [watermarkCandidates, setWatermarkCandidates] = useState<WatermarkCandidate[]>([]);
  const [selectedCandidateIds, setSelectedCandidateIds] = useState<Set<string>>(new Set());
  const [scanProgress, setScanProgress] = useState(0);
  const [regions, setRegions] = useState<Region[]>([]);
  const [dragRect, setDragRect] = useState<DragRect | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const overlayRef = useRef<SVGSVGElement>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const pageRegions = regions.filter(region => region.page === pageNumber);
  const selectedAnnotationCount = annotationsByPage
    .filter(item => selectedAnnotationPages.has(item.page))
    .reduce((total, item) => total + item.count, 0);
  const canProcess = regions.length > 0 || selectedAnnotationPages.size > 0 || selectedCandidateIds.size > 0;

  const onFileSelect = async (selectedFile: File) => {
    setIsLoading(true);
    setError("");
    setFile(selectedFile);
    setPdfProxy(null);
    setPreviewImage(null);
    setViewport(null);
    setPageNumber(1);
    setPageCount(0);
    setAnnotationsByPage([]);
    setSelectedAnnotationPages(new Set());
    setWatermarkCandidates([]);
    setSelectedCandidateIds(new Set());
    setScanProgress(0);
    setRegions([]);

    try {
      const pdfjs = await getPdfJs();
      if (!pdfjs) throw new Error("PDF 预览模块未能加载。");

      const data = new Uint8Array(await selectedFile.arrayBuffer());
      const documentProxy = await pdfjs.getDocument({ data }).promise as PdfDocumentProxy;
      setPdfProxy(documentProxy);
      setPageCount(documentProxy.numPages);

      const detectedCandidates = await findRepeatedImageCandidates(documentProxy, pdfjs, setScanProgress);
      setWatermarkCandidates(detectedCandidates);

      const summaries: AnnotationSummary[] = [];
      for (let page = 1; page <= documentProxy.numPages; page++) {
        const pdfPage = await documentProxy.getPage(page);
        const annotations = await pdfPage.getAnnotations();
        summaries.push({
          page,
          count: annotations.length,
          types: Array.from(new Set(annotations.map((annotation: { subtype?: string }) => annotation.subtype || "其他"))),
        });
      }
      setAnnotationsByPage(summaries);
      await renderPage(documentProxy, 1);
    } catch (loadError) {
      console.error(loadError);
      setError("无法读取此 PDF。文件可能已损坏、加密或格式不受支持。");
      setFile(null);
    } finally {
      setIsLoading(false);
    }
  };

  const renderPage = async (documentProxy: PdfDocumentProxy, targetPage: number) => {
    const pdfPage = await documentProxy.getPage(targetPage);
    const baseViewport = pdfPage.getViewport({ scale: 1 });
    const scale = Math.min(1.5, PREVIEW_MAX_DIMENSION / Math.max(baseViewport.width, baseViewport.height));
    const nextViewport = pdfPage.getViewport({ scale }) as PdfViewport;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("浏览器无法创建 PDF 预览画布。");

    canvas.width = Math.ceil(nextViewport.width);
    canvas.height = Math.ceil(nextViewport.height);
    await pdfPage.render({ canvasContext: context, viewport: nextViewport, canvas }).promise;
    setPreviewImage(canvas.toDataURL("image/png"));
    setViewport(nextViewport);
  };

  const changePage = async (nextPage: number) => {
    if (!pdfProxy || nextPage < 1 || nextPage > pageCount || nextPage === pageNumber) return;
    setIsLoading(true);
    setError("");
    setDragRect(null);
    try {
      await renderPage(pdfProxy, nextPage);
      setPageNumber(nextPage);
    } catch (pageError) {
      console.error(pageError);
      setError(`第 ${nextPage} 页预览失败。`);
    } finally {
      setIsLoading(false);
    }
  };

  const getOverlayPoint = (event: React.PointerEvent<SVGSVGElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height || !viewport) return null;
    return {
      x: Math.max(0, Math.min(viewport.width, (event.clientX - bounds.left) * viewport.width / bounds.width)),
      y: Math.max(0, Math.min(viewport.height, (event.clientY - bounds.top) * viewport.height / bounds.height)),
    };
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!viewport) return;
    const point = getOverlayPoint(event);
    if (!point) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = point;
    setDragRect({ ...point, startX: point.x, startY: point.y });
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragStartRef.current) return;
    const point = getOverlayPoint(event);
    if (point) setDragRect({ ...point, startX: dragStartRef.current.x, startY: dragStartRef.current.y });
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const start = dragStartRef.current;
    const end = getOverlayPoint(event);
    dragStartRef.current = null;
    if (!start || !end || !viewport) {
      setDragRect(null);
      return;
    }

    const left = Math.min(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const width = Math.abs(end.x - start.x);
    const height = Math.abs(end.y - start.y);
    setDragRect(null);
    if (width < MIN_SELECTION_SIZE || height < MIN_SELECTION_SIZE) return;

    const [pdfX1, pdfY1] = viewport.convertToPdfPoint(left, top);
    const [pdfX2, pdfY2] = viewport.convertToPdfPoint(left + width, top + height);
    setRegions(current => [...current, {
      id: crypto.randomUUID(),
      page: pageNumber,
      x: Math.min(pdfX1, pdfX2),
      y: Math.min(pdfY1, pdfY2),
      width: Math.abs(pdfX2 - pdfX1),
      height: Math.abs(pdfY2 - pdfY1),
    }]);
  };

  const getViewportRect = (region: Region) => {
    if (!viewport) return null;
    const points = [
      viewport.convertToViewportPoint(region.x, region.y),
      viewport.convertToViewportPoint(region.x + region.width, region.y),
      viewport.convertToViewportPoint(region.x, region.y + region.height),
      viewport.convertToViewportPoint(region.x + region.width, region.y + region.height),
    ];
    const xs = points.map(point => point[0]);
    const ys = points.map(point => point[1]);
    const x = Math.min(...xs);
    const y = Math.min(...ys);
    return { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y };
  };

  const toggleAnnotationPage = (page: number) => {
    setSelectedAnnotationPages(current => {
      const next = new Set(current);
      if (next.has(page)) next.delete(page);
      else next.add(page);
      return next;
    });
  };

  const toggleCandidate = (candidateId: string) => {
    setSelectedCandidateIds(current => {
      const next = new Set(current);
      if (next.has(candidateId)) next.delete(candidateId);
      else next.add(candidateId);
      return next;
    });
  };

  const removeWatermark = async () => {
    if (!file || !canProcess) return;
    setIsProcessing(true);
    setError("");

    try {
      const sourceBytes = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(sourceBytes);
      const pages = pdfDoc.getPages();

      const automaticRegions = [...selectedCandidateIds].flatMap(candidateId => {
        const candidate = watermarkCandidates.find(item => item.id === candidateId);
        if (!candidate) return [];
        return pages.map((page, index) => {
          const { width, height } = page.getSize();
          return {
            page: index + 1,
            x: candidate.xRatio * width,
            y: candidate.yRatio * height,
            width: candidate.widthRatio * width,
            height: candidate.heightRatio * height,
          };
        });
      });

      for (const region of [...regions, ...automaticRegions]) {
        const page = pages[region.page - 1];
        if (!page) continue;
        page.drawRectangle({
          x: region.x,
          y: region.y,
          width: region.width,
          height: region.height,
          color: rgb(1, 1, 1),
          opacity: 1,
          borderWidth: 0,
        });
      }

      for (const pageNumberToClean of selectedAnnotationPages) {
        const page = pages[pageNumberToClean - 1];
        if (!page) continue;
        const annotationArray = page.node.lookup(PDFName.of("Annots"), PDFArray);
        if (annotationArray) page.node.set(PDFName.of("Annots"), pdfDoc.context.obj([]));
      }

      const pdfBytes = await pdfDoc.save();
      const verifiedPdf = await PDFDocument.load(pdfBytes);
      if (verifiedPdf.getPageCount() !== pageCount) {
        throw new Error("输出 PDF 页数校验失败。");
      }

      for (const pageNumberToClean of selectedAnnotationPages) {
        const verifiedPage = verifiedPdf.getPages()[pageNumberToClean - 1];
        const remainingAnnotations = verifiedPage?.node.lookup(PDFName.of("Annots"), PDFArray);
        if (remainingAnnotations && remainingAnnotations.size() > 0) {
          throw new Error(`第 ${pageNumberToClean} 页的批注删除校验失败。`);
        }
      }

      const pdfBuffer = pdfBytes.buffer.slice(pdfBytes.byteOffset, pdfBytes.byteOffset + pdfBytes.byteLength) as ArrayBuffer;
      const blob = new Blob([pdfBuffer], { type: "application/pdf" });
      saveAs(blob, `${file.name.replace(/\.pdf$/i, "")}-处理后.pdf`);
    } catch (processingError) {
      console.error(processingError);
      setError(processingError instanceof Error
        ? `处理失败：${processingError.message}`
        : "处理 PDF 失败，请检查文件后重试。");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={onFileSelect}>
        <LiquidSidebar title="移除水印" subtitle="识别重复图像水印，逐页选择或删除批注">
          <LiquidControlGroup label="源文件">
            <LiquidFileUpload onFileSelect={onFileSelect} fileName={file?.name} />
          </LiquidControlGroup>

          {file && (
            <>
              <section className="rounded-xl border border-[var(--input-border)] bg-white/5 p-3 text-xs leading-5 text-[var(--text-sec)]">
                <div className="mb-1 flex items-center gap-2 font-medium text-[var(--text)]">
                  <FileSearch size={15} /> PDF 分析结果
                </div>
                <p>{pageCount} 页 · 已分析 {annotationsByPage.length} 页批注</p>
                <p>当前页：{annotationsByPage[pageNumber - 1]?.count ?? 0} 个批注</p>
                <p>已选遮挡区域：{regions.length} 个</p>
              </section>

              <LiquidControlGroup label="自动识别的重复图像水印">
                {scanProgress < 100 ? (
                  <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-[var(--text-sec)]">正在扫描页面内容流：{scanProgress}%</p>
                ) : watermarkCandidates.length === 0 ? (
                  <p className="rounded-lg bg-white/5 px-3 py-2 text-xs leading-5 text-[var(--text-sec)]">未发现跨页重复的大型图像水印。浅色图形、文字水印或融合到背景中的内容可能无法自动识别。</p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs leading-5 text-[var(--text-sec)]">在 {watermarkCandidates[0]?.sampleCount} 个抽样页面中发现重复图像/图形。勾选后会在所有页面对应位置添加遮挡。</p>
                    {watermarkCandidates.map((candidate, index) => (
                      <label key={candidate.id} className="flex cursor-pointer items-start gap-2 rounded-lg border border-white/10 bg-white/5 p-2 text-xs hover:bg-white/10">
                        <input
                          type="checkbox"
                          checked={selectedCandidateIds.has(candidate.id)}
                          onChange={() => toggleCandidate(candidate.id)}
                          className="mt-0.5 accent-blue-500"
                        />
                        <span className="min-w-0 text-[var(--text)]">
                          <span className="block font-medium">{candidate.description}</span>
                          <span className="text-[var(--text-sec)]">重复于 {candidate.pagesMatched}/{candidate.sampleCount} 个抽样页 · {Math.round(candidate.widthRatio * 100)}% × {Math.round(candidate.heightRatio * 100)}% 页面</span>
                          <span className="mt-1 block text-[var(--text-sec)]">点击候选 {index + 1} 可在预览中查看标记位置</span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </LiquidControlGroup>

              <LiquidControlGroup label="删除批注对象">
                <p className="mb-2 text-xs leading-5 text-[var(--text-sec)]">
                  直接从 PDF 结构删除所选页面的全部批注。若页面含注释、表单或签章，也会一并删除。
                </p>
                <div className="max-h-36 space-y-1 overflow-y-auto">
                  {annotationsByPage.filter(item => item.count > 0).length === 0 ? (
                    <p className="rounded-lg bg-white/5 px-3 py-2 text-xs text-[var(--text-sec)]">未检测到批注对象</p>
                  ) : annotationsByPage.filter(item => item.count > 0).map(item => (
                    <label key={item.page} className="flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2 text-xs hover:bg-white/5">
                      <input
                        type="checkbox"
                        checked={selectedAnnotationPages.has(item.page)}
                        onChange={() => toggleAnnotationPage(item.page)}
                        className="mt-0.5 accent-blue-500"
                      />
                      <span className="min-w-0 text-[var(--text)]">
                        第 {item.page} 页 · {item.count} 个（{item.types.join("、")}）
                      </span>
                    </label>
                  ))}
                </div>
              </LiquidControlGroup>

              <LiquidControlGroup label="遮挡水印区域">
                <p className="mb-2 text-xs leading-5 text-[var(--text-sec)]">
                  在预览页拖动框选文字、图片或矢量水印。仅为白色覆盖，不会从 PDF 中擦除底层内容。
                </p>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--text-sec)]">第 {pageNumber} 页：{pageRegions.length} 个区域</span>
                  <button
                    type="button"
                    onClick={() => setRegions(current => current.filter(region => region.page !== pageNumber))}
                    disabled={pageRegions.length === 0}
                    className="rounded-md px-2 py-1 text-xs text-[var(--text-sec)] hover:bg-white/10 disabled:opacity-40"
                  >
                    清除本页
                  </button>
                </div>
                {pageRegions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {pageRegions.map((region, index) => (
                      <button
                        type="button"
                        key={region.id}
                        onClick={() => setRegions(current => current.filter(item => item.id !== region.id))}
                        className="rounded-full border border-blue-400/40 bg-blue-500/10 px-2 py-1 text-[11px] text-[var(--text)] hover:bg-red-500/20"
                        title="点击删除此区域"
                      >
                        区域 {index + 1} ×
                      </button>
                    ))}
                  </div>
                )}
              </LiquidControlGroup>

              <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-xs leading-5 text-[var(--text-sec)]">
                <div className="mb-1 flex items-center gap-2 font-medium text-amber-600 dark:text-amber-300">
                  <AlertTriangle size={15} /> 处理范围说明
                </div>
                自动检测依据“图像/图形在多个页面重复且位置相同”，可能把重复页眉或模板元素列为候选；导出前请检查预览。区域遮挡不等于安全擦除，底层内容仍可能提取。文字水印、扫描件修复及签名保留目前不支持。
              </div>

              <div className="mt-auto">
                <LiquidButton onClick={removeWatermark} disabled={!canProcess || isProcessing || isLoading} isLoading={isProcessing}>
                  <span className="flex items-center justify-center gap-2">
                    {selectedAnnotationCount > 0 && <Layers size={16} />}
                    {regions.length + selectedAnnotationPages.size + selectedCandidateIds.size > 0
                      ? `处理并下载 PDF（${regions.length + selectedCandidateIds.size} 个区域模板，${selectedAnnotationCount} 个批注）`
                      : "处理并下载 PDF"}
                  </span>
                </LiquidButton>
              </div>
            </>
          )}
          {error && <p role="alert" className="rounded-lg bg-red-500/10 p-3 text-xs leading-5 text-red-500">{error}</p>}
        </LiquidSidebar>

        <LiquidMainArea className="p-5 md:p-8">
          <div className="flex h-full min-h-0 flex-col gap-4">
            {file && pageCount > 0 && (
              <div className="flex shrink-0 items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                <div className="min-w-0 truncate text-sm text-[var(--text)]" title={file.name}>{file.name}</div>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => void changePage(pageNumber - 1)}
                    disabled={pageNumber <= 1 || isLoading}
                    aria-label="上一页"
                    className="rounded-lg p-2 text-[var(--text)] hover:bg-white/10 disabled:opacity-40"
                  ><ChevronLeft size={18} /></button>
                  <span className="whitespace-nowrap text-sm text-[var(--text-sec)]">{pageNumber} / {pageCount}</span>
                  <button
                    type="button"
                    onClick={() => void changePage(pageNumber + 1)}
                    disabled={pageNumber >= pageCount || isLoading}
                    aria-label="下一页"
                    className="rounded-lg p-2 text-[var(--text)] hover:bg-white/10 disabled:opacity-40"
                  ><ChevronRight size={18} /></button>
                </div>
              </div>
            )}

            <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-auto rounded-xl bg-gray-50/5 p-3 dark:bg-black/20">
              {previewImage && viewport ? (
                <div className="relative inline-block max-h-full max-w-full shadow-2xl" style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}>
                  <img src={previewImage} alt={`PDF 第 ${pageNumber} 页预览`} draggable={false} className="block max-h-full max-w-full select-none" />
                  <svg
                    ref={overlayRef}
                    viewBox={`0 0 ${viewport.width} ${viewport.height}`}
                    preserveAspectRatio="none"
                    className={`absolute inset-0 h-full w-full touch-none ${isLoading ? "pointer-events-none opacity-50" : "cursor-crosshair"}`}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    aria-label="拖动框选水印区域"
                  >
                    {pageRegions.map(region => {
                      const rect = getViewportRect(region);
                      return rect ? (
                        <rect key={region.id} {...rect} fill="rgba(255,255,255,0.62)" stroke="#2563eb" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                      ) : null;
                    })}
                    {[...selectedCandidateIds].map(candidateId => {
                      const candidate = watermarkCandidates.find(item => item.id === candidateId);
                      if (!candidate || !viewport) return null;
                      const pageWidth = viewport.width / viewport.scale;
                      const pageHeight = viewport.height / viewport.scale;
                      const rect = getViewportRect({
                        id: candidate.id,
                        page: pageNumber,
                        x: candidate.xRatio * pageWidth,
                        y: candidate.yRatio * pageHeight,
                        width: candidate.widthRatio * pageWidth,
                        height: candidate.heightRatio * pageHeight,
                      });
                      return rect ? (
                        <rect key={`candidate-${candidate.id}`} {...rect} fill="rgba(139,92,246,0.24)" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="7 4" vectorEffect="non-scaling-stroke" />
                      ) : null;
                    })}
                    {dragRect && (
                      <rect
                        x={Math.min(dragRect.startX, dragRect.x)}
                        y={Math.min(dragRect.startY, dragRect.y)}
                        width={Math.abs(dragRect.x - dragRect.startX)}
                        height={Math.abs(dragRect.y - dragRect.startY)}
                        fill="rgba(59,130,246,0.25)"
                        stroke="#2563eb"
                        strokeWidth={2}
                        strokeDasharray="6 4"
                        vectorEffect="non-scaling-stroke"
                      />
                    )}
                  </svg>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center text-[var(--text-sec)]">
                  <MousePointer2 className="mb-3 h-10 w-10 opacity-50" />
                  <p className="text-lg">{isLoading ? "正在分析 PDF…" : "请选择 PDF 文件"}</p>
                  <p className="mt-1 text-sm">载入后可逐页预览并框选水印区域</p>
                </div>
              )}
              {isLoading && previewImage && (
                <div className="absolute right-5 top-5 rounded-lg bg-black/60 px-3 py-2 text-xs text-white">正在加载页面…</div>
              )}
            </div>

            {file && (
              <div className="flex shrink-0 items-center justify-between gap-3 text-xs text-[var(--text-sec)]">
                <span className="flex items-center gap-2"><Check size={14} /> 区域仅应用于当前页；每页需要单独框选。</span>
                <button
                  type="button"
                  onClick={() => { setRegions([]); setSelectedAnnotationPages(new Set()); }}
                  disabled={!canProcess}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 hover:bg-white/10 disabled:opacity-40"
                ><RotateCcw size={13} /> 重置选择</button>
              </div>
            )}
          </div>
        </LiquidMainArea>
      </LiquidAppLayout>
    </LiquidContainer>
  );
}

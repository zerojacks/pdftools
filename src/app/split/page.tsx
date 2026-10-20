"use client";

import { useState, useEffect } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import { GlassSelect } from "@/components/ui/GlassSelect";

type SplitMode = 'each' | 'ranges' | 'every';

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [splitMode, setSplitMode] = useState<SplitMode>('each');
  const [pageRanges, setPageRanges] = useState<string[]>(['']);
  const [rangeFormError, setRangeFormError] = useState('');
  const [pagesPerFile, setPagesPerFile] = useState(2);
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  useEffect(() => {
    // Preload worker
    getPdfJs();
  }, []);

  const onFileSelect = async (f: File) => {
    setFile(f);
    const arrayBuffer = await f.arrayBuffer();
    const pdfDoc = await PDFDocument.load(arrayBuffer);
    setPageCount(pdfDoc.getPageCount());
    generateThumbnails(f);
  };

  const generateThumbnails = async (file: File) => {
    try {
      const pdfjs = await getPdfJs();
      if (!pdfjs) return;

      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjs.getDocument(arrayBuffer).promise;
      const total = pdf.numPages;
      const thumbs: string[] = [];

      for (let i = 1; i <= Math.min(total, 20); i++) { // Limit preview to first 20 pages for perf
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

  const handleSplit = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const zip = new JSZip();

      const totalPages = pdfDoc.getPageCount();
      let pageGroups: number[][];
      if (splitMode === 'each') {
        pageGroups = Array.from({ length: totalPages }, (_, i) => [i]);
      } else if (splitMode === 'every') {
        const groupSize = Math.floor(pagesPerFile);
        if (!Number.isFinite(groupSize) || groupSize < 1) {
          alert('每个 PDF 的页数必须大于 0');
          return;
        }
        pageGroups = [];
        for (let start = 0; start < totalPages; start += groupSize) {
          pageGroups.push(Array.from({ length: Math.min(groupSize, totalPages - start) }, (_, i) => start + i));
        }
      } else {
        const enteredRanges = pageRanges.filter(range => range.trim().length > 0);
        const parsedGroups = enteredRanges.map(range => validatePageGroup(range, totalPages));
        if (parsedGroups.length === 0) {
          setRangeFormError('请至少填写一个页码分组。');
          return;
        }
        const invalidGroup = parsedGroups.find(group => group.error);
        if (invalidGroup?.error) {
          setRangeFormError(invalidGroup.error);
          return;
        }
        setRangeFormError('');
        pageGroups = parsedGroups.map(group => group.pages as number[]);
      }

      const baseName = file.name.replace(/\.pdf$/i, '');
      for (let i = 0; i < pageGroups.length; i++) {
        const newPdf = await PDFDocument.create();
        const copiedPages = await newPdf.copyPages(pdfDoc, pageGroups[i]);
        copiedPages.forEach(page => newPdf.addPage(page));
        const pdfBytes = await newPdf.save();
        const pageLabel = pageGroups[i].map(page => page + 1).join('-');
        const outputName = splitMode === 'each'
          ? `page-${pageGroups[i][0] + 1}.pdf`
          : splitMode === 'ranges'
            ? `${baseName}-group-${String(i + 1).padStart(2, '0')}-pages-${pageLabel}.pdf`
            : `${baseName}-part-${String(i + 1).padStart(2, '0')}.pdf`;
        zip.file(outputName, pdfBytes);
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${baseName}-split.zip`);
    } catch (error) {
      console.error(error);
      alert("处理 PDF 时发生错误，请检查文件后重试。");
    } finally {
      setIsProcessing(false);
    }
  };

  // 每个输入框对应一个输出 PDF；分号或逗号分隔的页码/范围合并到该 PDF。
  const validatePageGroup = (range: string, max: number): { pages: number[] | null; error: string } => {
    const group = new Set<number>();
    const tokens = range.split(/[;,，；]/).map(token => token.trim());
    if (tokens.length === 0 || tokens.some(token => !token)) {
      return { pages: null, error: '请检查输入格式，例如 1-3;5;8-10。' };
    }

    for (const token of tokens) {
      const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(token);
      if (!match) return { pages: null, error: `“${token}”格式无效，请输入页码或范围，例如 1-3。` };
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : start;
      if (start < 1) return { pages: null, error: '页码从第 1 页开始，请检查输入。' };
      if (end < start) return { pages: null, error: '范围结束页不能小于起始页，请检查输入。' };
      if (start > max || end > max) {
        return { pages: null, error: `超出文档页数：当前文件共 ${max} 页，请输入 1–${max} 范围内的页码。` };
      }
      for (let page = start; page <= end; page++) group.add(page - 1);
    }

    return {
      pages: group.size > 0 ? Array.from(group).sort((a, b) => a - b) : null,
      error: group.size > 0 ? '' : '请至少输入一个页码。',
    };
  };

  const hasInvalidPageGroups = splitMode === 'ranges' && (
    pageRanges.every(range => !range.trim()) ||
    pageRanges.some(range => range.trim() && pageCount > 0 && Boolean(validatePageGroup(range, pageCount).error))
  );

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={onFileSelect}>
        <LiquidSidebar title="PDF 拆分工具" subtitle="将 PDF 页面拆分并导出为多个文件">
          <LiquidControlGroup label="源文件">
            <LiquidFileUpload onFileSelect={onFileSelect} fileName={file?.name} />
          </LiquidControlGroup>
          
           <LiquidControlGroup label="拆分方式">
            <GlassSelect 
                value={splitMode}
                onChange={setSplitMode}
                options={[
                  { value: 'each', label: '每页单独生成一个 PDF' },
                  { value: 'ranges', label: '按页码范围分组' },
                  { value: 'every', label: '每 N 页生成一个 PDF' }
                ]}
            />
          </LiquidControlGroup>

           {splitMode === 'ranges' && (
             <LiquidControlGroup label="输出 PDF 分组">
                <div className="mb-2 rounded-lg border border-[var(--input-border)] bg-[var(--input-bg)] px-3 py-2 text-xs text-[var(--text-sec)]">
                  当前 PDF 共 <span className="font-semibold text-[var(--text)]">{pageCount || '—'} 页</span>
                  {pageCount > 0 && <span>，可用页码范围：1–{pageCount}</span>}
                </div>
                <div className="flex flex-col gap-2">
                  {pageRanges.map((range, index) => (
                    <div key={index} className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="shrink-0 text-xs text-[var(--text-sec)]">第 {index + 1} 组</span>
                        <input
                          type="text"
                          value={range}
                          onChange={(e) => {
                            const value = e.target.value;
                            setPageRanges(prev => prev.map((item, i) => i === index ? value : item));
                            setRangeFormError('');
                          }}
                          className={`min-w-0 flex-1 bg-transparent border rounded-lg px-2 py-1.5 text-[var(--text)] outline-none text-sm ${range.trim() && pageCount > 0 && validatePageGroup(range, pageCount).error ? 'border-red-500 focus:ring-1 focus:ring-red-400' : 'border-[var(--input-border)]'}`}
                          placeholder="如 1-3;5;8-10"
                          aria-label={`第 ${index + 1} 组页码范围`}
                          aria-invalid={Boolean(range.trim() && pageCount > 0 && validatePageGroup(range, pageCount).error)}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setPageRanges(prev => prev.filter((_, i) => i !== index));
                            setRangeFormError('');
                          }}
                          disabled={pageRanges.length <= 1}
                          className="h-8 w-8 shrink-0 rounded-lg border border-red-400/40 text-red-500 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="移除此分组"
                          aria-label={`移除第 ${index + 1} 组`}
                        >
                          −
                        </button>
                      </div>
                      {range.trim() && pageCount > 0 && validatePageGroup(range, pageCount).error && (
                        <p className="ml-12 text-xs leading-relaxed text-red-500" role="alert">
                          {validatePageGroup(range, pageCount).error}
                        </p>
                      )}
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      setPageRanges(prev => [...prev, '']);
                      setRangeFormError('');
                    }}
                    className="h-8 rounded-lg border border-[var(--input-border)] text-sm text-[var(--text)] hover:bg-[var(--input-bg)]"
                  >
                    + 添加一个 PDF 分组
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--text-sec)]">每个输入框生成一份 PDF；框内可用分号或逗号合并多个页码/范围，例如 1-3;5;8-10。</p>
                 {rangeFormError && <p className="mt-2 rounded-lg border border-red-400/40 bg-red-500/10 px-3 py-2 text-xs text-red-500" role="alert">{rangeFormError}</p>}
             </LiquidControlGroup>
          )}

           {splitMode === 'every' && (
             <LiquidControlGroup label="每个 PDF 页数">
                <input
                  type="number"
                  min={1}
                  max={pageCount || undefined}
                  step={1}
                  value={pagesPerFile}
                  onChange={(e) => setPagesPerFile(Number(e.target.value))}
                  className="w-full bg-transparent border-none text-[var(--text)] outline-none text-sm"
                />
             </LiquidControlGroup>
           )}

          <div className="mt-auto">
             <LiquidButton
               onClick={handleSplit}
               disabled={!file || isProcessing || (splitMode === 'ranges' && (pageCount < 1 || hasInvalidPageGroups))}
               isLoading={isProcessing}
             >
                {splitMode === 'each' ? '拆分为单页 PDF（ZIP）' : '拆分并下载（ZIP）'}
             </LiquidButton>
          </div>
        </LiquidSidebar>

        <LiquidMainArea className="p-8">
            <div className="h-full overflow-y-auto">
                {file ? (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 p-4">
                        {thumbnails.map((src, idx) => (
                            <div key={idx} className="flex flex-col items-center gap-2">
                                <div className="relative shadow-lg rounded-lg overflow-hidden transition-transform hover:scale-105">
                                    <img src={src} alt={`Page ${idx + 1}`} className="max-w-full h-auto" />
                                    <div className="absolute bottom-0 right-0 bg-black/50 text-white text-xs px-2 py-1 rounded-tl-lg">
                                        {idx + 1}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {pageCount > 20 && (
                            <div className="flex items-center justify-center text-[var(--text-sec)] text-sm col-span-full py-10">
                                还有 {pageCount - 20} 页未显示
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-sec)]">
                        <p className="text-lg">请选择 PDF 文件以预览页面</p>
                    </div>
                )}
            </div>
        </LiquidMainArea>
      </LiquidAppLayout>
    </LiquidContainer>
  );
}

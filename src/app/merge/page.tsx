"use client";

import { useState, useEffect, useRef } from "react";
import { PDFDocument, degrees } from "pdf-lib";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import { X, Plus, Trash2, ZoomIn, RotateCw } from "lucide-react";

interface MergeFile {
  id: string;
  file: File;
  name: string;
  pageCount: number;
  selectedPages: number[];
  scalePct: number;
  sizeBytes: number;
  thumbnail: string | null;
  rotation: number;
  identity: string;
}

export default function MergePage() {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [pageRangeInput, setPageRangeInput] = useState('');
  const [pageRangeError, setPageRangeError] = useState('');
  const [draggedFileId, setDraggedFileId] = useState<string | null>(null);
  const addInputRef = useRef<HTMLInputElement>(null);
  const fileIdentitiesRef = useRef(new Set<string>());

  useEffect(() => {
    getPdfJs();
  }, []);

  const addFiles = async (selectedFiles: File[]) => {
    if (selectedFiles.length === 0) return;
    const newFiles: MergeFile[] = [];
    const invalidFiles: string[] = [];
    const duplicateFiles: string[] = [];

    for (const file of selectedFiles) {
      if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
        invalidFiles.push(file.name);
        continue;
      }

      let reservedIdentity: string | null = null;
      try {
        const data = await file.arrayBuffer();
        const exposedFile = file as File & { path?: string; webkitRelativePath?: string };
        const exposedPath = exposedFile.path || exposedFile.webkitRelativePath;
        const identity = exposedPath
          ? `path:${exposedPath.replace(/\\/g, '/').toLowerCase()}`
          : `sha256:${Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data)), byte => byte.toString(16).padStart(2, '0')).join('')}`;

        if (fileIdentitiesRef.current.has(identity)) {
          duplicateFiles.push(file.name);
          continue;
        }

        // 先占用指纹，避免快速连续添加时重复异步读取造成竞态。
        fileIdentitiesRef.current.add(identity);
        reservedIdentity = identity;
        const pdf = await PDFDocument.load(data);
        newFiles.push({
          id: crypto.randomUUID(),
          file,
          name: file.name,
          pageCount: pdf.getPageCount(),
          selectedPages: pdf.getPageIndices(),
          scalePct: 100,
          sizeBytes: file.size,
          thumbnail: await createThumbnail(file),
          rotation: 0,
          identity,
        });
      } catch {
        if (reservedIdentity) fileIdentitiesRef.current.delete(reservedIdentity);
        invalidFiles.push(file.name);
      }
    }

    if (newFiles.length > 0) setFiles(prev => [...prev, ...newFiles]);
    if (duplicateFiles.length > 0) {
      alert(`以下 PDF 已添加过，已跳过重复文件：\n${duplicateFiles.join('\n')}`);
    }
    if (invalidFiles.length > 0) {
      alert(`以下文件无法读取，请确认文件有效且未加密：\n${invalidFiles.join('\n')}`);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    await addFiles(Array.from(e.target.files || []));
    // 允许再次选择相同文件以追加一份。
    e.target.value = '';
  };

  const removeFile = (id: string) => {
    setFiles(prev => {
      const removed = prev.find(file => file.id === id);
      if (removed) fileIdentitiesRef.current.delete(removed.identity);
      return prev.filter(file => file.id !== id);
    });
  };

  const clearFiles = () => {
    fileIdentitiesRef.current.clear();
    setFiles([]);
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...files];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newFiles.length) {
      [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
      setFiles(newFiles);
    }
  };

  const updateFileScale = (id: string, scalePct: number) => {
    setFiles(prev => prev.map(item => item.id === id ? { ...item, scalePct } : item));
  };

  const togglePageSelection = (fileId: string, pageIndex: number) => {
    setFiles(prev => prev.map(item => {
      if (item.id !== fileId) return item;
      const selected = new Set(item.selectedPages);
      if (selected.has(pageIndex)) {
        if (selected.size <= 1) return item;
        selected.delete(pageIndex);
      } else {
        selected.add(pageIndex);
      }
      return { ...item, selectedPages: Array.from(selected).sort((a, b) => a - b) };
    }));
  };

  const parsePageSelection = (range: string, max: number): number[] | null => {
    const pages = new Set<number>();
    const tokens = range.split(/[,，]/).map(token => token.trim());
    if (tokens.length === 0 || tokens.some(token => !token)) return null;
    for (const token of tokens) {
      const match = /^(\d+)\s*(?:-\s*(\d+))?$/.exec(token);
      if (!match) return null;
      const start = Number(match[1]);
      const end = match[2] ? Number(match[2]) : start;
      if (start < 1 || end < start || end > max) return null;
      for (let page = start; page <= end; page++) pages.add(page - 1);
    }
    return pages.size > 0 ? Array.from(pages).sort((a, b) => a - b) : null;
  };

  const applyPageRange = (fileId: string) => {
    const target = files.find(item => item.id === fileId);
    if (!target) return;
    const selectedPages = parsePageSelection(pageRangeInput, target.pageCount);
    if (!selectedPages) {
      setPageRangeError(`请输入 1–${target.pageCount} 范围内的页码，例如 1-5, 8。`);
      return;
    }
    setFiles(prev => prev.map(item => item.id === fileId ? { ...item, selectedPages } : item));
    setPageRangeError('');
  };

  const createThumbnail = async (file: File): Promise<string | null> => {
    try {
      const pdfjs = await getPdfJs();
      if (!pdfjs) return null;
      const pdf = await pdfjs.getDocument(await file.arrayBuffer()).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.7 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) return null;
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvasContext: context, viewport }).promise;
      const thumbnail = canvas.toDataURL('image/jpeg', 0.82);
      await pdf.destroy();
      return thumbnail;
    } catch (error) {
      console.error('PDF 缩略图生成失败:', error);
      return null;
    }
  };

  const rotateFile = (id: string) => {
    setFiles(prev => prev.map(item => item.id === id ? { ...item, rotation: (item.rotation + 90) % 360 } : item));
  };

  const reorderFiles = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    setFiles(prev => {
      const next = [...prev];
      const fromIndex = next.findIndex(item => item.id === fromId);
      const toIndex = next.findIndex(item => item.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [moved] = next.splice(fromIndex, 1);
      // toIndex 指向放置目标在原列表的位置；删除源项后直接插入该索引，
      // 向后移动时不减一，否则第一项拖到第二项会变成原地不动。
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const formatFileSize = (size: number) => size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(2)} MB`
    : `${(size / 1024).toFixed(0)} KB`;

  const handleMerge = async () => {
    if (files.length < 2) return;
    setIsProcessing(true);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const fileObj of files) {
        if (fileObj.selectedPages.length === 0) continue;
        const arrayBuffer = await fileObj.file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const sourcePages = pdf.getPages();
        const scale = fileObj.scalePct / 100;

        // 原样页面直接复制，最大程度保留原 PDF 对象、矢量和注释。
        if (scale === 1 && fileObj.rotation === 0) {
          const copiedPages = await mergedPdf.copyPages(pdf, fileObj.selectedPages);
          copiedPages.forEach(page => mergedPdf.addPage(page));
          continue;
        }

        // 有缩放/旋转时，把原 PDF 页面作为矢量 Form XObject 嵌入新页；
        // 不通过 canvas 或图片重采样，因此不会降低文字、线条和图像清晰度。
        for (const pageIndex of fileObj.selectedPages) {
          const sourcePage = sourcePages[pageIndex];
          const { width, height } = sourcePage.getSize();
          const outputPage = mergedPdf.addPage([width, height]);
          const embeddedPage = await mergedPdf.embedPage(sourcePage);
          const drawWidth = width * scale;
          const drawHeight = height * scale;
          outputPage.drawPage(embeddedPage, {
            x: (width - drawWidth) / 2,
            y: (height - drawHeight) / 2,
            width: drawWidth,
            height: drawHeight,
          });
          outputPage.setRotation(degrees((sourcePage.getRotation().angle + fileObj.rotation) % 360));
        }
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const baseName = files.length === 2
        ? `${files[0].name.replace(/\.pdf$/i, '')}-${files[1].name.replace(/\.pdf$/i, '')}`
        : '合并后的文档';
      saveAs(blob, `${baseName}.pdf`);
    } catch (error) {
      console.error(error);
      alert("合并 PDF 失败，请检查文件是否有效或受密码保护。");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileDrop = async (file: File) => {
    await addFiles([file]);
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={handleFileDrop}>
        <LiquidSidebar title="PDF 合并工具" subtitle="按顺序合并多个 PDF 文件">
          <LiquidControlGroup label="添加 PDF 文件">
             <div 
                className="fileUploadWrapper liquid-glass-wrapper w-full min-h-[44px] cursor-pointer rounded-xl transition-all duration-200 hover:scale-[1.02]"
             >
                <div className="liquid-glass-effect"></div>
                <div className="liquid-glass-tint"></div>
                <div className="liquid-glass-shine"></div>
                <div className="liquid-glass-text fileUploadContent flex items-center justify-center p-2.5 text-sm text-[var(--text)] text-center">
                    <input 
                        type="file" 
                        multiple
                        accept="application/pdf"
                        className="absolute inset-0 opacity-0 cursor-pointer"
                        onChange={handleFileSelect}
                    />
                    <span><Plus size={15} className="inline-block mr-1" />添加 PDF 文件</span>
                </div>
            </div>
          </LiquidControlGroup>
          
          <div className="text-xs text-[var(--text-sec)] px-1">
             可继续添加文件；按住卡片并拖动即可调整合并顺序。缩放仅影响页面内容，页面尺寸保持不变。
          </div>

           {files.length > 0 && (
            <button
              type="button"
              onClick={clearFiles}
              className="flex items-center justify-center gap-2 h-9 rounded-lg border border-red-400/40 text-sm text-red-500 hover:bg-red-500/10"
            >
              <Trash2 size={15} />清空文件列表
            </button>
           )}

          <div className="mt-auto">
             <LiquidButton onClick={handleMerge} disabled={files.length < 2 || isProcessing} isLoading={isProcessing}>
               合并 {files.length} 个文件
             </LiquidButton>
          </div>
        </LiquidSidebar>

        <LiquidMainArea className="p-8">
            <div className="relative h-full overflow-y-auto p-4">
                <input
                  ref={addInputRef}
                  type="file"
                  multiple
                  accept="application/pdf"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  type="button"
                  onClick={() => addInputRef.current?.click()}
                  className="absolute right-5 top-2 z-20 flex h-11 w-11 items-center justify-center rounded-full bg-red-500 text-white shadow-lg transition-transform hover:scale-105 hover:bg-red-600"
                  title="添加 PDF 文件"
                  aria-label={`添加 PDF 文件，当前 ${files.length} 个文件`}
                >
                  <Plus size={24} />
                  {files.length > 0 && <span className="absolute -left-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--card-bg)] bg-black px-1 text-[10px] font-bold text-white">{files.length}</span>}
                </button>
                {files.length > 0 ? (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,200px))] justify-center gap-3 pt-12 sm:justify-start">
                        {files.map((file, index) => (
                            <div
                              key={file.id}
                              draggable
                              onDragStart={event => {
                                event.dataTransfer.effectAllowed = 'move';
                                event.dataTransfer.setData('application/x-pdf-merge-card', file.id);
                                setDraggedFileId(file.id);
                              }}
                              onDragOver={event => event.preventDefault()}
                              onDrop={event => {
                                event.preventDefault();
                                event.stopPropagation();
                                const sourceId = event.dataTransfer.getData('application/x-pdf-merge-card') || draggedFileId;
                                if (sourceId) reorderFiles(sourceId, file.id);
                                setDraggedFileId(null);
                              }}
                              onDragEnd={() => setDraggedFileId(null)}
                              className={`group relative h-[248px] cursor-grab overflow-visible rounded-xl border border-white/70 bg-white/80 p-3 shadow-md backdrop-blur-md transition-all hover:z-30 hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-lg active:cursor-grabbing ${draggedFileId === file.id ? 'opacity-40' : ''}`}
                              title="拖动卡片可调整合并顺序"
                            >
                              <div className="pointer-events-none absolute bottom-full left-0 z-40 mb-2 whitespace-nowrap rounded-md bg-black/55 px-3 py-1.5 text-sm font-semibold text-white opacity-0 shadow-md transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
                                {formatFileSize(file.sizeBytes)} · {file.pageCount} 页面
                              </div>
                              <div className="relative flex h-[190px] items-center justify-center overflow-hidden rounded-md bg-white shadow-inner">
                                {file.thumbnail ? (
                                  <img
                                    src={file.thumbnail}
                                    alt={`${file.name} 首页预览`}
                                    className="max-h-full max-w-full object-contain transition-transform duration-200"
                                    style={{ transform: `rotate(${file.rotation}deg)` }}
                                  />
                                ) : (
                                  <div className="flex flex-col items-center gap-2 text-gray-400">
                                    <svg className="h-12 w-12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                                    <span className="text-xs">无法生成预览</span>
                                  </div>
                                )}
                              </div>
                              <div className="mt-2 flex items-center justify-between gap-2">
                                <span className="min-w-0 truncate text-xs text-gray-600" title={file.name}>{file.name}</span>
                                <span className="shrink-0 text-[10px] text-gray-500">{file.selectedPages.length}/{file.pageCount} 页</span>
                              </div>
                              <div className="absolute right-2 top-2 flex translate-y-1 items-center gap-1 opacity-0 transition-all group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100">
                                <button type="button" onClick={() => { setPreviewFileId(file.id); setPageRangeInput(''); setPageRangeError(''); }} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow hover:bg-white" title="预览、提取页面并调整缩放" aria-label={`预览 ${file.name}`}><ZoomIn size={15} /></button>
                                <button type="button" onClick={() => rotateFile(file.id)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow hover:bg-red-500 hover:text-white" title="旋转 90 度" aria-label={`旋转 ${file.name}`}><RotateCw size={15} /></button>
                                <button type="button" onClick={() => removeFile(file.id)} className="flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-gray-700 shadow hover:bg-red-500 hover:text-white" title="移除文件" aria-label={`移除 ${file.name}`}><X size={15} /></button>
                              </div>
                              <div className="absolute left-2 top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/55 px-1.5 text-xs font-semibold text-white">{index + 1}</div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-sec)]">
                        <div className="w-20 h-20 mb-4 rounded-3xl bg-white/20 dark:bg-white/5 flex items-center justify-center">
                            <svg className="w-10 h-10 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                                <polyline points="14 2 14 8 20 8"></polyline>
                                <line x1="12" y1="18" x2="12" y2="12"></line>
                                <line x1="9" y1="15" x2="15" y2="15"></line>
                            </svg>
                        </div>
                        <p className="text-lg font-medium">尚未添加 PDF 文件</p>
                        <p className="text-sm opacity-70 mt-1">点击右上角“＋”或从左侧添加 PDF 文件</p>
                    </div>
                )}
            </div>
        </LiquidMainArea>
      </LiquidAppLayout>
      {previewFileId && files.find(item => item.id === previewFileId) && (() => {
        const previewFile = files.find(item => item.id === previewFileId)!;
        return (
          <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm" onClick={() => setPreviewFileId(null)}>
            <div className="w-full max-w-lg rounded-2xl border border-white/30 bg-[var(--card-bg)] p-5 shadow-2xl" onClick={event => event.stopPropagation()}>
              <div className="mb-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-semibold text-[var(--text)]">页面预览</h2>
                  <p className="truncate text-sm text-[var(--text-sec)]">{previewFile.name} · 共 {previewFile.pageCount} 页</p>
                </div>
                <button type="button" onClick={() => setPreviewFileId(null)} className="rounded-lg p-2 text-[var(--text-sec)] hover:bg-black/5" aria-label="关闭预览"><X size={18} /></button>
              </div>
              <div className="flex h-[min(55vh,480px)] items-center justify-center overflow-hidden rounded-xl bg-white p-5 shadow-inner">
                {previewFile.thumbnail ? <img src={previewFile.thumbnail} alt={`${previewFile.name} 首页预览`} className="max-h-full max-w-full object-contain transition-transform" style={{ transform: `rotate(${previewFile.rotation}deg) scale(${previewFile.scalePct / 100})` }} /> : <p className="text-sm text-gray-500">暂时无法预览此文件</p>}
              </div>
              <div className="mt-5 flex items-center gap-3">
                <label htmlFor="merge-content-scale" className="shrink-0 text-sm text-[var(--text-sec)]">内容缩放</label>
                <input id="merge-content-scale" type="range" min="50" max="150" step="5" value={previewFile.scalePct} onChange={event => updateFileScale(previewFile.id, Number(event.target.value))} className="min-w-0 flex-1 accent-[var(--primary)]" />
                <span className="w-12 text-right text-sm font-medium text-[var(--text)]">{previewFile.scalePct}%</span>
              </div>
              <p className="mt-2 text-xs text-[var(--text-sec)]">缩放只影响所选 PDF 的页面内容，纸张大小保持原样。</p>
              <div className="mt-5 border-t border-[var(--control-group-border)] pt-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text)]">页面提取</h3>
                    <p className="text-xs text-[var(--text-sec)]">已保留 {previewFile.selectedPages.length}/{previewFile.pageCount} 页；点击页码可排除或恢复。</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setFiles(prev => prev.map(item => item.id === previewFile.id ? { ...item, selectedPages: Array.from({ length: item.pageCount }, (_, i) => i) } : item));
                      setPageRangeError('');
                    }}
                    className="shrink-0 rounded-lg border border-[var(--input-border)] px-2.5 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--input-bg)]"
                  >
                    恢复全部
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pageRangeInput}
                    onChange={event => { setPageRangeInput(event.target.value); setPageRangeError(''); }}
                    onKeyDown={event => { if (event.key === 'Enter') applyPageRange(previewFile.id); }}
                    placeholder={`保留范围，如 1-5, 8（共 ${previewFile.pageCount} 页）`}
                    aria-label="输入要保留的页码范围"
                    className="min-w-0 flex-1 rounded-lg border border-[var(--input-border)] bg-transparent px-3 py-2 text-sm text-[var(--text)] outline-none"
                  />
                  <button type="button" onClick={() => applyPageRange(previewFile.id)} className="rounded-lg bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white">应用</button>
                </div>
                {pageRangeError && <p className="mt-1.5 text-xs text-red-500" role="alert">{pageRangeError}</p>}
                <div className="mt-3 max-h-36 overflow-y-auto rounded-lg border border-[var(--input-border)] p-2">
                  <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-8">
                    {Array.from({ length: previewFile.pageCount }, (_, pageIndex) => {
                      const isIncluded = previewFile.selectedPages.includes(pageIndex);
                      return (
                        <button
                          key={pageIndex}
                          type="button"
                          onClick={() => togglePageSelection(previewFile.id, pageIndex)}
                          aria-pressed={isIncluded}
                          title={isIncluded ? `第 ${pageIndex + 1} 页（点击排除）` : `第 ${pageIndex + 1} 页（点击恢复）`}
                          className={`h-7 rounded-md border text-[11px] font-semibold transition-colors ${isIncluded ? 'border-[var(--input-border)] bg-[var(--input-bg)] text-[var(--text)] hover:border-red-400/70' : 'border-red-400/40 bg-red-500/10 text-red-500/70 line-through hover:bg-red-500/20'}`}
                        >
                          {pageIndex + 1}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}
    </LiquidContainer>
  );
}

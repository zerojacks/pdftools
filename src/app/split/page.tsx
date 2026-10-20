"use client";

import { useState, useEffect } from "react";
import { PDFDocument } from "pdf-lib";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import { GlassSelect } from "@/components/ui/GlassSelect";
import { Loader2 } from "lucide-react";

export default function SplitPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [splitMode, setSplitMode] = useState<'all' | 'range'>('all');
  const [pageRange, setPageRange] = useState('');
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

      if (splitMode === 'all') {
        for (let i = 0; i < pdfDoc.getPageCount(); i++) {
          const newPdf = await PDFDocument.create();
          const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
          newPdf.addPage(copiedPage);
          const pdfBytes = await newPdf.save();
          zip.file(`page-${i + 1}.pdf`, pdfBytes);
        }
      } else {
        // Range split logic (simplified for now: e.g. "1-3" or "1,5")
        // This is a basic implementation
        const pagesToExtract = parsePageRange(pageRange, pdfDoc.getPageCount());
        for (const i of pagesToExtract) {
           const newPdf = await PDFDocument.create();
           const [copiedPage] = await newPdf.copyPages(pdfDoc, [i]);
           newPdf.addPage(copiedPage);
           const pdfBytes = await newPdf.save();
           zip.file(`page-${i + 1}.pdf`, pdfBytes);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${file.name.replace('.pdf', '')}-split.zip`);
    } catch (error) {
      console.error(error);
      alert("Error processing PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  const parsePageRange = (range: string, max: number): number[] => {
     const pages = new Set<number>();
     const parts = range.split(/[,，]/);
     parts.forEach(p => {
        const [start, end] = p.split('-').map(s => parseInt(s.trim()));
        if (!isNaN(start)) {
            if (!isNaN(end)) {
                for (let i = Math.max(1, start); i <= Math.min(end, max); i++) pages.add(i - 1);
            } else if (start >= 1 && start <= max) {
                pages.add(start - 1);
            }
        }
     });
     return Array.from(pages).sort((a, b) => a - b);
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={onFileSelect}>
        <LiquidSidebar title="Split PDF" subtitle="Split PDF into multiple files">
          <LiquidControlGroup label="Source File">
            <LiquidFileUpload onFileSelect={onFileSelect} fileName={file?.name} />
          </LiquidControlGroup>
          
          <LiquidControlGroup label="Split Mode">
            <GlassSelect 
                value={splitMode}
                onChange={setSplitMode}
                options={[
                    { value: 'all', label: 'Extract All Pages' },
                    { value: 'range', label: 'Extract Custom Range' }
                ]}
            />
          </LiquidControlGroup>

          {splitMode === 'range' && (
             <LiquidControlGroup label="Page Range (e.g. 1-5, 8)">
                 <input 
                    type="text" 
                    value={pageRange}
                    onChange={(e) => setPageRange(e.target.value)}
                    className="w-full bg-transparent border-none text-[var(--text)] outline-none text-sm"
                    placeholder="e.g. 1-3, 5"
                 />
             </LiquidControlGroup>
          )}

          <div className="mt-auto">
             <LiquidButton onClick={handleSplit} disabled={!file || isProcessing} isLoading={isProcessing}>
                {splitMode === 'all' ? 'Split All (ZIP)' : 'Extract Pages (ZIP)'}
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
                                ... and {pageCount - 20} more pages
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-sec)]">
                        <p className="text-lg">Select a PDF file to preview pages</p>
                    </div>
                )}
            </div>
        </LiquidMainArea>
      </LiquidAppLayout>
    </LiquidContainer>
  );
}

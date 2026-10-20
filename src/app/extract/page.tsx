"use client";

import { useState, useEffect } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import { GlassSelect } from "@/components/ui/GlassSelect";

export default function ExtractPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [format, setFormat] = useState<'jpg' | 'png'>('jpg');
  const [quality, setQuality] = useState<number>(0.9);
  const [thumbnails, setThumbnails] = useState<string[]>([]);

  useEffect(() => {
    getPdfJs();
  }, []);

  const onFileSelect = async (f: File) => {
    setFile(f);
    const arrayBuffer = await f.arrayBuffer();
    try {
      const pdfjs = await getPdfJs();
      if (!pdfjs) return;

      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPageCount(pdf.numPages);
      generateThumbnails(pdf);
    } catch (e) {
      console.error(e);
      alert("Invalid PDF");
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

  const extractImages = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const pdfjs = await getPdfJs();
      if (!pdfjs) return;

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const zip = new JSZip();

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 2.0 }); // High quality
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        
        if (!context) continue;

        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport,
        } as any).promise;

        const blob = await new Promise<Blob | null>((resolve) => 
          canvas.toBlob(resolve, format === 'jpg' ? "image/jpeg" : "image/png", quality)
        );

        if (blob) {
          zip.file(`page-${i}.${format}`, blob);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      saveAs(content, `${file.name.replace('.pdf', '')}-images.zip`);
    } catch (error) {
      console.error(error);
      alert("Error extracting images");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={onFileSelect}>
        <LiquidSidebar title="Extract Images" subtitle="Convert PDF pages to Images">
          <LiquidControlGroup label="Source File">
            <LiquidFileUpload onFileSelect={onFileSelect} fileName={file?.name} />
          </LiquidControlGroup>
          
          <LiquidControlGroup label="Image Format">
            <GlassSelect 
                value={format}
                onChange={setFormat}
                options={[
                    { value: 'jpg', label: 'JPG (Smaller Size)' },
                    { value: 'png', label: 'PNG (Lossless)' }
                ]}
            />
          </LiquidControlGroup>

          {format === 'jpg' && (
              <LiquidControlGroup label={`Quality (${Math.round(quality * 100)}%)`}>
                 <input 
                    type="range" 
                    min="0.1" max="1.0" step="0.1" 
                    value={quality}
                    onChange={(e) => setQuality(Number(e.target.value))}
                    className="w-full h-1.5 bg-[var(--input-border)] rounded-full appearance-none outline-none my-2.5 backdrop-blur-sm cursor-pointer"
                 />
              </LiquidControlGroup>
          )}

          <div className="mt-auto">
             <LiquidButton onClick={extractImages} disabled={!file || isProcessing} isLoading={isProcessing}>
                Extract All as {format.toUpperCase()} (ZIP)
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
                        <p className="text-lg">Select a PDF file to preview</p>
                    </div>
                )}
            </div>
        </LiquidMainArea>
      </LiquidAppLayout>
    </LiquidContainer>
  );
}

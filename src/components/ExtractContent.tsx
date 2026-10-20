"use client";

import { useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import FileUpload from "@/components/FileUpload";
import { GlassCard } from "@/components/ui/GlassCard";
import { Loader2, FileText, Image as ImageIcon } from "lucide-react";

// Set worker source
if (typeof window !== "undefined" && "Worker" in window) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export default function ExtractContent() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [pageCount, setPageCount] = useState(0);

  const onFileSelect = async (f: File) => {
    setFile(f);
    const arrayBuffer = await f.arrayBuffer();
    try {
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      setPageCount(pdf.numPages);
    } catch (e) {
      console.error(e);
      alert("Invalid PDF");
      setFile(null);
    }
  };

  const extractImages = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
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
          canvas.toBlob(resolve, "image/jpeg", 0.9)
        );

        if (blob) {
          zip.file(`page-${i}.jpg`, blob);
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
    <div className="max-w-4xl mx-auto py-12 px-4 container overflow-y-auto">
      <h1 className="text-4xl font-bold mb-8 text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-purple-600">
        Extract Images
      </h1>
      
      {!file ? (
        <FileUpload onFileSelect={onFileSelect} />
      ) : (
        <GlassCard className="flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-300">
          <div className="flex items-center gap-4 text-slate-700 dark:text-slate-200">
            <FileText className="w-12 h-12 text-blue-500" />
            <div>
              <p className="font-semibold text-lg">{file.name}</p>
              <p className="text-sm opacity-70">{pageCount} Pages</p>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setFile(null)}
              className="px-6 py-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={extractImages}
              disabled={isProcessing}
              className="glass-button px-8 py-2 rounded-xl text-blue-700 dark:text-blue-400 font-semibold flex items-center gap-2"
            >
              {isProcessing ? <Loader2 className="animate-spin" /> : <ImageIcon size={18} />}
              Extract All as JPG (ZIP)
            </button>
          </div>
        </GlassCard>
      )}
    </div>
  );
}

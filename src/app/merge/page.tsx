"use client";

import { useState, useEffect } from "react";
import { PDFDocument } from "pdf-lib";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import { Loader2, X, MoveUp, MoveDown } from "lucide-react";

interface MergeFile {
  id: string;
  file: File;
  name: string;
  pageCount: number;
}

export default function MergePage() {
  const [files, setFiles] = useState<MergeFile[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    getPdfJs();
  }, []);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || []);
    if (selectedFiles.length === 0) return;

    const newFiles: MergeFile[] = [];
    
    for (const file of selectedFiles) {
      if (file.type !== 'application/pdf') continue;
      
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await PDFDocument.load(arrayBuffer);
      
      newFiles.push({
        id: Math.random().toString(36).substr(2, 9),
        file,
        name: file.name,
        pageCount: pdf.getPageCount()
      });
    }

    setFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const moveFile = (index: number, direction: 'up' | 'down') => {
    const newFiles = [...files];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    
    if (targetIndex >= 0 && targetIndex < newFiles.length) {
      [newFiles[index], newFiles[targetIndex]] = [newFiles[targetIndex], newFiles[index]];
      setFiles(newFiles);
    }
  };

  const handleMerge = async () => {
    if (files.length < 2) return;
    setIsProcessing(true);

    try {
      const mergedPdf = await PDFDocument.create();

      for (const fileObj of files) {
        const arrayBuffer = await fileObj.file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
        copiedPages.forEach(page => mergedPdf.addPage(page));
      }

      const pdfBytes = await mergedPdf.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      saveAs(blob, `merged-document-${Date.now()}.pdf`);
    } catch (error) {
      console.error(error);
      alert("Error merging PDFs");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileDrop = async (file: File) => {
    if (file && file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await PDFDocument.load(arrayBuffer);
        
        setFiles(prev => [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            file,
            name: file.name,
            pageCount: pdf.getPageCount()
        }]);
    }
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={handleFileDrop}>
        <LiquidSidebar title="Merge PDF" subtitle="Combine multiple PDF files">
          <LiquidControlGroup label="Add Files">
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
                    <span>+ Add PDF Files</span>
                </div>
            </div>
          </LiquidControlGroup>
          
          <div className="text-xs text-[var(--text-sec)] px-1">
             Drag and drop files to reorder or use the arrows.
          </div>

          <div className="mt-auto">
             <LiquidButton onClick={handleMerge} disabled={files.length < 2 || isProcessing} isLoading={isProcessing}>
                Merge {files.length} Files
             </LiquidButton>
          </div>
        </LiquidSidebar>

        <LiquidMainArea className="p-8">
            <div className="h-full overflow-y-auto p-4">
                {files.length > 0 ? (
                    <div className="flex flex-col gap-3">
                        {files.map((file, index) => (
                            <div key={file.id} className="group relative flex items-center gap-4 p-4 rounded-xl bg-white/40 dark:bg-black/20 border border-white/20 backdrop-blur-md shadow-sm transition-all hover:bg-white/60 dark:hover:bg-black/30">
                                <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-500/10 text-blue-500">
                                    <span className="font-bold">{index + 1}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-[var(--text)] truncate">{file.name}</div>
                                    <div className="text-xs text-[var(--text-sec)]">{file.pageCount} pages</div>
                                </div>
                                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={() => moveFile(index, 'up')} 
                                        disabled={index === 0}
                                        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
                                    >
                                        <MoveUp size={16} className="text-[var(--text)]" />
                                    </button>
                                    <button 
                                        onClick={() => moveFile(index, 'down')} 
                                        disabled={index === files.length - 1}
                                        className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 disabled:opacity-30"
                                    >
                                        <MoveDown size={16} className="text-[var(--text)]" />
                                    </button>
                                    <button 
                                        onClick={() => removeFile(file.id)}
                                        className="p-2 rounded-lg hover:bg-red-500/10 text-red-500"
                                    >
                                        <X size={18} />
                                    </button>
                                </div>
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
                        <p className="text-lg font-medium">No files selected</p>
                        <p className="text-sm opacity-70 mt-1">Add PDF files from the sidebar to start merging</p>
                    </div>
                )}
            </div>
        </LiquidMainArea>
      </LiquidAppLayout>
    </LiquidContainer>
  );
}

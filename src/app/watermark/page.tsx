"use client";

import { useState, useEffect } from "react";
import { PDFDocument, rgb, degrees } from "pdf-lib";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import { GlassSelect } from "@/components/ui/GlassSelect";

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [watermarkText, setWatermarkText] = useState("Confidential");
  const [opacity, setOpacity] = useState(0.3);
  const [size, setSize] = useState(50);
  const [color, setColor] = useState("#FF0000");
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  useEffect(() => {
    getPdfJs();
  }, []);

  const onFileSelect = async (f: File) => {
    setFile(f);
    updatePreview(f);
  };

  // Simple preview of first page (without watermark overlay for now, hard to do canvas overlay perfectly in short time)
  // Or we can try to render the watermark on the preview canvas? 
  // For now, let's just show the PDF page and apply the watermark to the actual PDF.
  const updatePreview = async (f: File) => {
    try {
      const pdfjs = await getPdfJs();
      if (!pdfjs) return;

      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument(arrayBuffer).promise;
      const page = await pdf.getPage(1);
      const viewport = page.getViewport({ scale: 0.8 });
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        setPreviewImage(canvas.toDataURL());
      }
    } catch (e) {
      console.error(e);
    }
  };

  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16) / 255,
      g: parseInt(result[2], 16) / 255,
      b: parseInt(result[3], 16) / 255
    } : { r: 0, g: 0, b: 0 };
  };

  const applyWatermark = async () => {
    if (!file) return;
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();
      const { r, g, b } = hexToRgb(color);

      pages.forEach(page => {
        const { width, height } = page.getSize();
        page.drawText(watermarkText, {
          x: width / 2 - (watermarkText.length * size) / 4, // Rough centering
          y: height / 2,
          size: size,
          color: rgb(r, g, b),
          opacity: opacity,
          rotate: degrees(45),
        });
      });

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      saveAs(blob, `${file.name.replace('.pdf', '')}-watermark.pdf`);
    } catch (error) {
      console.error(error);
      alert("Error adding watermark");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={onFileSelect}>
        <LiquidSidebar title="Watermark" subtitle="Add text watermark to PDF">
          <LiquidControlGroup label="Source File">
            <LiquidFileUpload onFileSelect={onFileSelect} fileName={file?.name} />
          </LiquidControlGroup>
          
          <LiquidControlGroup label="Watermark Text">
            <input 
                type="text" 
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                className="w-full h-9 bg-transparent border-none text-[var(--text)] outline-none text-sm px-1"
                placeholder="Enter text..."
            />
          </LiquidControlGroup>

          <LiquidControlGroup label={`Size (${size}px)`}>
             <input 
                type="range" 
                min="10" max="200" step="5" 
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-full h-1.5 bg-[var(--input-border)] rounded-full appearance-none outline-none my-2.5 backdrop-blur-sm cursor-pointer"
             />
          </LiquidControlGroup>

          <LiquidControlGroup label={`Opacity (${Math.round(opacity * 100)}%)`}>
             <input 
                type="range" 
                min="0.1" max="1.0" step="0.1" 
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full h-1.5 bg-[var(--input-border)] rounded-full appearance-none outline-none my-2.5 backdrop-blur-sm cursor-pointer"
             />
          </LiquidControlGroup>

          <LiquidControlGroup label="Color">
             <div className="flex items-center gap-3">
                 <input 
                    type="color" 
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                 />
                 <span className="text-sm text-[var(--text)]">{color}</span>
             </div>
          </LiquidControlGroup>

          <div className="mt-auto">
             <LiquidButton onClick={applyWatermark} disabled={!file || isProcessing} isLoading={isProcessing}>
                Apply Watermark (PDF)
             </LiquidButton>
          </div>
        </LiquidSidebar>

        <LiquidMainArea className="p-8">
            <div className="h-full flex items-center justify-center overflow-hidden relative">
                {previewImage ? (
                    <div className="relative shadow-2xl rounded-lg overflow-hidden max-h-full max-w-full">
                        <img src={previewImage} alt="Preview" className="max-h-full max-w-full object-contain" />
                        
                        {/* CSS Preview Overlay - Approximate representation */}
                        <div 
                            className="absolute inset-0 flex items-center justify-center pointer-events-none"
                            style={{
                                transform: 'rotate(-45deg)', // Rotate opposite to counter container? No, simple flex center
                            }}
                        >
                            <div 
                                style={{
                                    fontSize: `${size * 0.8}px`, // Scale down slightly for visual fit on screen
                                    color: color,
                                    opacity: opacity,
                                    transform: 'rotate(45deg)',
                                    fontWeight: 'bold',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                {watermarkText}
                            </div>
                        </div>
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

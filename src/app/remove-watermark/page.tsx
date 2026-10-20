"use client";

import { useState, useEffect, useRef } from "react";
import { PDFDocument, rgb, PDFName, radians } from "pdf-lib";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import { Eraser, MousePointerClick, Trash2, BoxSelect, Layers, Image as ImageIcon } from "lucide-react";
import { GlassSelect } from "@/components/ui/GlassSelect";

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
  dir: string;
  fontName: string;
  hasEOL: boolean;
}

type RemovalMode = 'redact' | 'clean';

export default function RemoveWatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [textItems, setTextItems] = useState<TextItem[]>([]);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [removedIndices, setRemovedIndices] = useState<Set<number>>(new Set());
  const [mode, setMode] = useState<RemovalMode>('redact');
  const [cleanOptions, setCleanOptions] = useState({
    annotations: true,
    artifacts: true,
    images: false
  });
  
  // Dimensions for mapping
  const [pdfPageSize, setPdfPageSize] = useState<{width: number, height: number} | null>(null);
  const [canvasSize, setCanvasSize] = useState<{width: number, height: number} | null>(null);
  const [containerSize, setContainerSize] = useState<{width: number, height: number} | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState<any>(null);

  useEffect(() => {
    getPdfJs();
  }, []);

  // Resize Observer to handle responsive scaling
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
        for (let entry of entries) {
            setContainerSize({
                width: entry.contentRect.width,
                height: entry.contentRect.height
            });
        }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [previewImage]);

  const onFileSelect = async (f: File) => {
    setFile(f);
    setSelectedItemIndex(null);
    setRemovedIndices(new Set());
    updatePreview(f);
  };

  const updatePreview = async (f: File) => {
    try {
      const pdfjs = await getPdfJs();
      if (!pdfjs) return;

      const arrayBuffer = await f.arrayBuffer();
      const pdf = await pdfjs.getDocument(arrayBuffer).promise;
      const page = await pdf.getPage(1);
      
      const viewport = page.getViewport({ scale: 1.5 }); // High res for text selection accuracy
      setViewport(viewport);
      
      // Store sizes
      const { width: pdfW, height: pdfH } = page.getViewport({ scale: 1.0 }); // Base PDF size
      setPdfPageSize({ width: pdfW, height: pdfH });
      setCanvasSize({ width: viewport.width, height: viewport.height });

      // Render Canvas
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");
      if (context) {
        canvas.height = viewport.height;
        canvas.width = viewport.width;
        await page.render({ canvasContext: context, viewport }).promise;
        setPreviewImage(canvas.toDataURL());
      }

      // Get Text Content
      const textContent = await page.getTextContent();
      // @ts-ignore
      setTextItems(textContent.items);

    } catch (e) {
      console.error(e);
    }
  };

  const handleTextClick = (index: number) => {
    if (mode === 'redact') {
        // Toggle removal state locally for preview
        const newRemoved = new Set(removedIndices);
        if (newRemoved.has(index)) {
            newRemoved.delete(index);
        } else {
            newRemoved.add(index);
        }
        setRemovedIndices(newRemoved);
        setSelectedItemIndex(index); // Still track last clicked for logic
    }
  };

  const removeWatermark = async () => {
    if (!file) return;
    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdfDoc = await PDFDocument.load(arrayBuffer);
      const pages = pdfDoc.getPages();

      if (mode === 'redact') {
          if (removedIndices.size === 0 || !pdfPageSize) {
              setIsProcessing(false);
              return;
          }
          
          // Process all selected items
          removedIndices.forEach(index => {
              const item = textItems[index];
              const scaleX = Math.sqrt(item.transform[0]*item.transform[0] + item.transform[1]*item.transform[1]);
              const scaleY = Math.sqrt(item.transform[2]*item.transform[2] + item.transform[3]*item.transform[3]);
              const angle = Math.atan2(item.transform[1], item.transform[0]);
              const padding = 2; 
              const rectX = item.transform[4];
              const rectY = item.transform[5];
              const rectW = item.width > 0 ? item.width : (item.str.length * scaleX * 0.5); 
              const rectH = scaleY; 
    
              pages.forEach(page => {
                 page.drawRectangle({
                    x: rectX - padding,
                    y: rectY - padding,
                    width: rectW + padding * 2,
                    height: rectH + padding * 2,
                    color: rgb(1, 1, 1),
                    opacity: 1,
                    rotate: radians(angle)
                 });
              });
          });
      } else {
          // Clean Mode
          pages.forEach(page => {
              if (cleanOptions.annotations) {
                  // Remove all annotations (often used for stamps/watermarks)
                  page.node.set(PDFName.of('Annots'), pdfDoc.context.obj([]));
              }
              
              // Note: Artifacts removal usually requires content stream parsing which is complex in pdf-lib.
              // However, we can try to clean XObjects if they are used as backgrounds.
              // For now, Annotation removal is the most effective high-level action.
          });
      }

      const pdfBytes = await pdfDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      saveAs(blob, `${file.name.replace('.pdf', '')}-cleaned.pdf`);
    } catch (error) {
      console.error(error);
      alert("Error processing PDF");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={onFileSelect}>
        <LiquidSidebar title="Remove Watermark" subtitle="Advanced tools to clean PDF">
          <LiquidControlGroup label="Source File">
            <LiquidFileUpload onFileSelect={onFileSelect} fileName={file?.name} />
          </LiquidControlGroup>
          
          <LiquidControlGroup label="Removal Method">
            <GlassSelect 
                value={mode}
                onChange={(v) => setMode(v)}
                options={[
                    { value: 'redact', label: 'Visual Redaction (Cover)' },
                    { value: 'clean', label: 'Structure Cleaning (Delete)' }
                ]}
            />
          </LiquidControlGroup>

          {mode === 'redact' ? (
              <div className="text-xs text-[var(--text-sec)] px-1 mb-4">
                 Click on any text (watermark) in the preview to select it. This will cover the text with a white box on all pages.
              </div>
          ) : (
              <div className="flex flex-col gap-3 p-1">
                  <div className="text-xs text-[var(--text-sec)] mb-1">
                      Delete objects from the PDF structure. Useful for overlapping watermarks.
                  </div>
                  
                  <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg hover:bg-white/5 transition-colors">
                      <input 
                        type="checkbox" 
                        checked={cleanOptions.annotations}
                        onChange={e => setCleanOptions({...cleanOptions, annotations: e.target.checked})}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <div className="flex items-center gap-2 text-sm text-[var(--text)]">
                          <Layers size={14} />
                          <span>Remove Annotations (Stamps)</span>
                      </div>
                  </label>
                  
                  {/* Placeholder for future implementations */}
                  <div className="text-xs text-[var(--text-sec)] opacity-50 pl-6">
                      * More cleaning options coming soon
                  </div>
              </div>
          )}

          <div className="mt-auto">
             <LiquidButton 
                onClick={removeWatermark} 
                disabled={!file || isProcessing || (mode === 'redact' && removedIndices.size === 0)} 
                isLoading={isProcessing}
             >
                <div className="flex items-center gap-2">
                    {mode === 'redact' ? <Eraser size={16} /> : <Trash2 size={16} />}
                    <span>{mode === 'redact' ? `Redact ${removedIndices.size} Items` : 'Clean PDF'}</span>
                </div>
             </LiquidButton>
          </div>
        </LiquidSidebar>

        <LiquidMainArea className="p-8">
            <div className="h-full flex items-center justify-center overflow-auto relative select-none bg-gray-50/5 dark:bg-black/20 rounded-xl">
                {previewImage && canvasSize ? (
                    <div 
                        className="relative shadow-2xl rounded-lg overflow-hidden"
                        style={{
                            width: canvasSize.width,
                            height: canvasSize.height,
                            // Scale down if too big for container
                            maxWidth: '100%',
                            maxHeight: '100%',
                            aspectRatio: `${canvasSize.width}/${canvasSize.height}`
                        }}
                    >
                        <img 
                            src={previewImage} 
                            alt="Preview" 
                            className="w-full h-full object-contain pointer-events-none absolute inset-0" 
                            draggable={false}
                        />
                        
                        {/* Text Layer Overlay */}
                        <div className="absolute inset-0 z-10" ref={containerRef}>
                            {textItems.map((item, idx) => {
                                if (!pdfPageSize || !canvasSize || !containerSize || !viewport) return null;

                                // Use PDF.js Viewport to project coordinates
                                // viewport.convertToViewportPoint(x, y) returns [vx, vy]
                                // x, y are in PDF User Space (transform[4], transform[5])
                                
                                const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
                                
                                // Now scale from Viewport (scale=1.5) to Container (Display) size
                                const scaleFactor = containerSize.width / canvasSize.width;
                                
                                const left = vx * scaleFactor;
                                const top = vy * scaleFactor;
                                
                                // Font size and width also need scaling
                                // transform[0] is usually font size in X (scaleX)
                                // transform[3] is usually font size in Y (scaleY)
                                // But this is in User Space. We need to map to Viewport then to Display.
                                
                                // Approximate font size in Viewport pixels:
                                // sqrt(a^2 + b^2) for X, sqrt(c^2 + d^2) for Y
                                const fontScaleY = Math.sqrt(item.transform[2]*item.transform[2] + item.transform[3]*item.transform[3]);
                                const fontSizeViewport = fontScaleY * viewport.scale; // viewport.scale is 1.5
                                const fontSize = fontSizeViewport * scaleFactor;
                                
                                const widthViewport = item.width * viewport.scale; // item.width is in user space
                                const width = widthViewport * scaleFactor;

                                // Rotation
                                const angle = Math.atan2(item.transform[1], item.transform[0]);
                                // PDF rotation is counter-clockwise? 
                                // item.transform[1] is b (skewY), item.transform[0] is a (scaleX).
                                // If angle is positive, it's CCW in standard math.
                                // CSS rotate() is clockwise.
                                // PDF.js usually produces 'rotate(-deg)' styles.
                                const rotationDeg = -angle * (180 / Math.PI);

                                const isSelected = removedIndices.has(idx); 

                                return (
                                    <div
                                        key={idx}
                                        onClick={() => handleTextClick(idx)}
                                        className={`absolute cursor-pointer transition-all duration-200 border ${isSelected ? 'bg-white z-50 opacity-100 border-white' : 'hover:bg-red-500/20 hover:border-red-500/50 border-transparent'}`}
                                        style={{
                                            left: `${left}px`,
                                            top: `${top - fontSize}px`, // Adjust for baseline: PDF (x,y) is baseline start. CSS top is top-left.
                                            width: `${width}px`,
                                            height: `${fontSize}px`,
                                            transform: `rotate(${rotationDeg}deg)`,
                                            transformOrigin: '0% 100%' // Rotate around baseline start (bottom-left of the box)
                                        }}
                                        title={item.str}
                                    />
                                );
                            })}
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-sec)]">
                        <div className="w-20 h-20 mb-4 rounded-3xl bg-white/20 dark:bg-white/5 flex items-center justify-center">
                             <MousePointerClick className="w-10 h-10 opacity-50" />
                        </div>
                        <p className="text-lg font-medium">Select a PDF to start</p>
                        <p className="text-sm opacity-70 mt-1">Click on watermark text to remove it</p>
                    </div>
                )}
            </div>
        </LiquidMainArea>
      </LiquidAppLayout>
    </LiquidContainer>
  );
}

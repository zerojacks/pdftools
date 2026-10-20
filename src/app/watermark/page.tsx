"use client";

import { useState, useEffect, useRef, type CSSProperties } from "react";
import { PDFDocument, rgb, degrees, StandardFonts } from "pdf-lib";
import { saveAs } from "file-saver";
import { getPdfJs } from "@/lib/pdf-worker";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { LiquidFileUpload } from "@/components/ui/LiquidFileUpload";
import { GlassSelect } from "@/components/ui/GlassSelect";

type WatermarkType = 'text' | 'image';
type WatermarkPosition = 'top-left' | 'top-center' | 'top-right' | 'center-left' | 'center' | 'center-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';
type WatermarkLayer = 'above' | 'below';

export default function WatermarkPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [watermarkType, setWatermarkType] = useState<WatermarkType>('text');
  const [watermarkText, setWatermarkText] = useState("Confidential");
  const [watermarkImage, setWatermarkImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [opacity, setOpacity] = useState(0.3);
  const [size, setSize] = useState(25);
  const [color, setColor] = useState("#FF0000");
  const [position, setPosition] = useState<WatermarkPosition>('center');
  const [layer, setLayer] = useState<WatermarkLayer>('above');
  const [rotation, setRotation] = useState(45);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getPdfJs();
  }, []);

  const onFileSelect = async (f: File) => {
    setFile(f);
    updatePreview(f);
  };

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

  const handleWatermarkImage = (image: File | undefined) => {
    if (!image) return;
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(image.type)) {
      alert('请选择 PNG 或 JPG 图片作为水印。');
      return;
    }
    setWatermarkImage(image);
    setImagePreview(URL.createObjectURL(image));
  };

  const calculatePosition = (pageWidth: number, pageHeight: number, itemWidth: number, itemHeight: number) => {
    const margin = Math.max(18, Math.min(pageWidth, pageHeight) * 0.04);
    const horizontal = position.endsWith('left') ? 'left' : position.endsWith('right') ? 'right' : 'center';
    const vertical = position.startsWith('top') ? 'top' : position.startsWith('bottom') ? 'bottom' : 'center';
    const x = horizontal === 'left' ? margin
      : horizontal === 'right' ? pageWidth - itemWidth - margin
        : (pageWidth - itemWidth) / 2;
    const y = vertical === 'bottom' ? margin
      : vertical === 'top' ? pageHeight - itemHeight - margin
        : (pageHeight - itemHeight) / 2;
    return { x, y };
  };

  const imageDimensions = (imageWidth: number, imageHeight: number, pageWidth: number, pageHeight: number) => {
    const maxWidth = pageWidth * (size / 100);
    const maxHeight = pageHeight * (size / 100);
    const scale = Math.min(maxWidth / imageWidth, maxHeight / imageHeight);
    return { width: imageWidth * scale, height: imageHeight * scale };
  };

  const getPreviewPosition = (selectedPosition: WatermarkPosition): CSSProperties => ({
    justifyContent: selectedPosition.endsWith('left') ? 'flex-start' : selectedPosition.endsWith('right') ? 'flex-end' : 'center',
    alignItems: selectedPosition.startsWith('top') ? 'flex-start' : selectedPosition.startsWith('bottom') ? 'flex-end' : 'center',
    padding: '4%',
  });

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
    if (watermarkType === 'text' && !watermarkText.trim()) {
      alert('请输入水印文字。');
      return;
    }
    if (watermarkType === 'image' && !watermarkImage) {
      alert('请先选择水印图片。');
      return;
    }
    setIsProcessing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const sourceDoc = await PDFDocument.load(arrayBuffer);
      const outputDoc = layer === 'below' ? await PDFDocument.create() : sourceDoc;
      const sourcePages = sourceDoc.getPages();
      const { r, g, b } = hexToRgb(color);
      const font = watermarkType === 'text' ? await outputDoc.embedFont(StandardFonts.Helvetica) : null;
      const imageBytes = watermarkImage ? new Uint8Array(await watermarkImage.arrayBuffer()) : null;
      const embeddedImage = watermarkType === 'image' && watermarkImage && imageBytes
        ? watermarkImage.type === 'image/png'
          ? await outputDoc.embedPng(imageBytes)
          : await outputDoc.embedJpg(imageBytes)
        : null;

      for (const sourcePage of sourcePages) {
        const { width: sourceWidth, height: sourceHeight } = sourcePage.getSize();
        const page = layer === 'below'
          ? outputDoc.addPage([sourceWidth, sourceHeight])
          : sourcePage;

        if (layer === 'below') {
          const embeddedPage = await outputDoc.embedPage(sourcePage);
          if (watermarkType === 'text' && font) {
            const textWidth = font.widthOfTextAtSize(watermarkText, size);
            const textHeight = size;
            const { x, y } = calculatePosition(sourceWidth, sourceHeight, textWidth, textHeight);
            page.drawText(watermarkText, { x, y, size, font, color: rgb(r, g, b), opacity, rotate: degrees(rotation) });
          } else if (embeddedImage) {
            const dimensions = imageDimensions(embeddedImage.width, embeddedImage.height, sourceWidth, sourceHeight);
            const { x, y } = calculatePosition(sourceWidth, sourceHeight, dimensions.width, dimensions.height);
            page.drawImage(embeddedImage, { x, y, ...dimensions, opacity, rotate: degrees(rotation) });
          }
          page.drawPage(embeddedPage);
          if (sourcePage.getRotation().angle !== 0) page.setRotation(degrees(sourcePage.getRotation().angle));
        } else {
          if (watermarkType === 'text' && font) {
            const textWidth = font.widthOfTextAtSize(watermarkText, size);
            const textHeight = size;
            const { x, y } = calculatePosition(sourceWidth, sourceHeight, textWidth, textHeight);
            page.drawText(watermarkText, { x, y, size, font, color: rgb(r, g, b), opacity, rotate: degrees(rotation) });
          } else if (embeddedImage) {
            const dimensions = imageDimensions(embeddedImage.width, embeddedImage.height, sourceWidth, sourceHeight);
            const { x, y } = calculatePosition(sourceWidth, sourceHeight, dimensions.width, dimensions.height);
            page.drawImage(embeddedImage, { x, y, ...dimensions, opacity, rotate: degrees(rotation) });
          }
        }
      }

      const pdfBytes = await outputDoc.save();
      const blob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      saveAs(blob, `${file.name.replace(/\.pdf$/i, '')}-水印.pdf`);
    } catch (error) {
      console.error(error);
      alert("添加水印失败，请检查文件和图片格式后重试。");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout onFileDrop={onFileSelect}>
        <LiquidSidebar title="PDF 水印工具" subtitle="为 PDF 添加文字或图片水印">
          <LiquidControlGroup label="源文件">
            <LiquidFileUpload onFileSelect={onFileSelect} fileName={file?.name} />
          </LiquidControlGroup>
          
          <LiquidControlGroup label="水印类型">
            <GlassSelect
              value={watermarkType}
              onChange={setWatermarkType}
              options={[
                { value: 'text', label: '文字水印' },
                { value: 'image', label: '图片水印' },
              ]}
            />
          </LiquidControlGroup>

          {watermarkType === 'text' ? <LiquidControlGroup label="水印文字">
            <input 
                type="text" 
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                className="w-full h-9 bg-transparent border-none text-[var(--text)] outline-none text-sm px-1"
                placeholder="请输入水印文字"
            />
          </LiquidControlGroup> : (
            <LiquidControlGroup label="水印图片（PNG/JPG）">
              <input ref={imageInputRef} type="file" accept="image/png,image/jpeg" className="hidden" onChange={event => { handleWatermarkImage(event.target.files?.[0]); event.target.value = ''; }} />
              <button type="button" onClick={() => imageInputRef.current?.click()} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[var(--input-border)] text-sm text-[var(--text)] hover:bg-[var(--input-bg)]">
                {watermarkImage ? '更换水印图片' : '选择 PNG 或 JPG 图片'}
              </button>
              {watermarkImage && <p className="truncate text-xs text-[var(--text-sec)]">{watermarkImage.name}</p>}
            </LiquidControlGroup>
          )}

          <LiquidControlGroup label={watermarkType === 'text' ? `文字大小（${size} pt）` : `图片宽度（页面的 ${size}%）`}>
             <input 
                type="range" 
                min={watermarkType === 'text' ? 10 : 5} max={watermarkType === 'text' ? 200 : 80} step={watermarkType === 'text' ? 5 : 1}
                value={size}
                onChange={(e) => setSize(Number(e.target.value))}
                className="w-full h-1.5 bg-[var(--input-border)] rounded-full appearance-none outline-none my-2.5 backdrop-blur-sm cursor-pointer"
             />
          </LiquidControlGroup>

          <LiquidControlGroup label={`透明度（${Math.round(opacity * 100)}%）`}>
             <input 
                type="range" 
                min="0.1" max="1.0" step="0.1" 
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full h-1.5 bg-[var(--input-border)] rounded-full appearance-none outline-none my-2.5 backdrop-blur-sm cursor-pointer"
             />
          </LiquidControlGroup>

          {watermarkType === 'text' && <LiquidControlGroup label="文字颜色">
             <div className="flex items-center gap-3">
                 <input 
                    type="color" 
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-8 h-8 rounded cursor-pointer border-none p-0 bg-transparent"
                 />
                 <span className="text-sm text-[var(--text)]">{color}</span>
             </div>
           </LiquidControlGroup>}

          <LiquidControlGroup label="水印位置">
            <GlassSelect
              value={position}
              onChange={setPosition}
              options={[
                { value: 'top-left', label: '左上' }, { value: 'top-center', label: '顶部居中' }, { value: 'top-right', label: '右上' },
                { value: 'center-left', label: '左侧居中' }, { value: 'center', label: '页面居中' }, { value: 'center-right', label: '右侧居中' },
                { value: 'bottom-left', label: '左下' }, { value: 'bottom-center', label: '底部居中' }, { value: 'bottom-right', label: '右下' },
              ]}
            />
          </LiquidControlGroup>

          <LiquidControlGroup label={`旋转角度（${rotation}°）`}>
            <input type="range" min="-180" max="180" step="5" value={rotation} onChange={event => setRotation(Number(event.target.value))} className="w-full h-1.5 bg-[var(--input-border)] rounded-full appearance-none outline-none my-2.5 cursor-pointer" />
          </LiquidControlGroup>

          <LiquidControlGroup label="图层顺序">
            <GlassSelect
              value={layer}
              onChange={setLayer}
              options={[
                { value: 'above', label: '置于 PDF 内容上方' },
                { value: 'below', label: '置于 PDF 内容下方' },
              ]}
            />
          </LiquidControlGroup>

          <div className="mt-auto">
             <LiquidButton onClick={applyWatermark} disabled={!file || isProcessing} isLoading={isProcessing}>
                应用水印并下载 PDF
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
                                ...getPreviewPosition(position),
                            }}
                        >
                            <div 
                                style={{
                                    fontSize: `${size * 0.8}px`,
                                    color: color,
                                    opacity: opacity,
                                    transform: `rotate(${rotation}deg)`,
                                    fontWeight: 'bold',
                                    whiteSpace: 'nowrap'
                                }}
                            >
                                  {watermarkType === 'text' ? watermarkText : imagePreview && <img src={imagePreview} alt="水印预览" className="max-h-40 object-contain" style={{ width: `${size}%` }} />}
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col items-center justify-center h-full text-[var(--text-sec)]">
                        <p className="text-lg">请选择 PDF 文件以预览效果</p>
                    </div>
                )}
            </div>
        </LiquidMainArea>
      </LiquidAppLayout>
    </LiquidContainer>
  );
}

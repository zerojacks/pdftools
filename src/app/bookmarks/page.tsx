"use client";

import { useState, useRef, useEffect } from "react";
import { PDFDocument, rgb, StandardFonts, PDFPage } from "pdf-lib";
import { saveAs } from "file-saver";
import { LiquidContainer, LiquidAppLayout, LiquidSidebar, LiquidMainArea, LiquidControlGroup, LiquidButton } from "@/components/ui/LiquidLayout";
import { Bookmark, Save, Plus, Trash2, Printer, Type, Image as ImageIcon, Palette, LayoutTemplate, Square, Circle, Tag, Sticker, Copy, Maximize, Move } from "lucide-react";
import { GlassSelect } from "@/components/ui/GlassSelect";

interface StickerItem {
  id: string;
  emoji: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
}

interface BookmarkDesign {
  id: string;
  text: string;
  subText: string;
  color: string;
  icon: string;
  font: string;
  shape: 'rectangle' | 'rounded' | 'tag';
  radius: number; // For rounded shape
  width: number; // px (on A4 preview scale)
  height: number; // px
  stickers: StickerItem[];
  x: number; // Relative to A4 Page
  y: number; // Relative to A4 Page
  page: number; // Page index (0-based)
}

const PRESET_COLORS = [
  '#FF9A9E', '#FECFEF', '#A18CD1', '#FBC2EB', '#8FD3F4', '#84FAB0', 
  '#E0C3FC', '#F6D365', '#FFDEE9', '#B5FFFC'
];

const PRESET_EMOJIS = ['⭐', '❤️', '🌞', '🌙', '☁️', '🌸', '🎵', '📚', '🐱', '🐶', '🚀', '🌈'];

export default function BookmarksPage() {
  const [designs, setDesigns] = useState<BookmarkDesign[]>([
    { id: '1', text: 'Keep Reading', subText: 'Just one more chapter...', color: '#FF9A9E', icon: 'Book', font: 'Sans', shape: 'rounded', radius: 20, width: 130, height: 450, stickers: [], x: 20, y: 20, page: 0 },
    { id: '2', text: 'Dream Big', subText: 'The future belongs to those who believe', color: '#8FD3F4', icon: 'Star', font: 'Serif', shape: 'tag', radius: 0, width: 130, height: 450, stickers: [], x: 160, y: 20, page: 0 },
    { id: '3', text: 'Stay Cozy', subText: 'Tea, Books & Rain', color: '#F6D365', icon: 'Sun', font: 'Mono', shape: 'rectangle', radius: 0, width: 130, height: 450, stickers: [], x: 300, y: 20, page: 0 },
    { id: '4', text: 'Adventure', subText: 'To the stars and beyond', color: '#A18CD1', icon: 'Moon', font: 'Sans', shape: 'rounded', radius: 20, width: 130, height: 450, stickers: [], x: 440, y: 20, page: 0 }
  ]);
  const [selectedId, setSelectedId] = useState<string | null>('1');
  const [isProcessing, setIsProcessing] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, id: string } | null>(null);
  
  // Resizing state
  const resizeRef = useRef<{ id: string, startX: number, startY: number, startW: number, startH: number } | null>(null);
  
  // Dragging state for bookmarks
  const dragRef = useRef<{ id: string, startX: number, startY: number, initialX: number, initialY: number } | null>(null);

  const selectedDesign = designs.find(d => d.id === selectedId);

  // Close context menu on click elsewhere
  useEffect(() => {
      const closeMenu = () => setContextMenu(null);
      window.addEventListener('click', closeMenu);
      return () => window.removeEventListener('click', closeMenu);
  }, []);

  const updateDesign = (updates: Partial<BookmarkDesign>) => {
      if (!selectedId) return;
      setDesigns(designs.map(d => d.id === selectedId ? { ...d, ...updates } : d));
  };

  const addDesign = () => {
      const newId = Math.random().toString(36).substr(2, 9);
      // Create with temporary safe values, will be fixed by autoLayout immediately
      setDesigns(prev => {
          const newD: BookmarkDesign = {
              id: newId,
              text: 'New Bookmark',
              subText: 'Write something inspiring...',
              color: PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)],
              icon: 'Heart',
              font: 'Sans',
              shape: 'rounded',
              radius: 20,
              width: 130,
              height: 450,
              stickers: [],
              x: 20, 
              y: 20,
              page: 0
          };
          // We need to run layout logic synchronously or inside the setter to avoid flash
          // But autoLayout depends on state. Let's make autoLayout pure.
          const updatedDesigns = [...prev, newD];
          return calculateLayout(updatedDesigns);
      });
      setSelectedId(newId);
  };
  
  const calculateLayout = (currentDesigns: BookmarkDesign[]) => {
      const a4w = 595.28;
      const a4h = 841.89;
      const margin = 20;
      const gap = 10;
      
      let currentX = margin;
      let currentY = margin;
      let rowHeight = 0;
      let currentPage = 0;
      
      return currentDesigns.map(d => {
           // Check if fits in current row
           if (currentX + d.width > a4w - margin) {
               currentX = margin;
               currentY += rowHeight + gap;
               rowHeight = 0;
           }
           
           // Check if fits in current page
           if (currentY + d.height > a4h - margin) {
               currentPage++;
               currentX = margin;
               currentY = margin;
               rowHeight = 0;
           }
           
           const placed = { ...d, x: currentX, y: currentY, page: currentPage };
           
           rowHeight = Math.max(rowHeight, d.height);
           currentX += d.width + gap;
           
           return placed;
      });
  };

  // We can remove the effect based autoLayout or keep it for manual triggers?
  // Let's keep a manual trigger but use the pure function.
  const autoLayout = () => {
      setDesigns(prev => calculateLayout(prev));
  };

  const deleteDesign = (id: string) => {
      const newDesigns = designs.filter(d => d.id !== id);
      setDesigns(newDesigns);
      if (selectedId === id) setSelectedId(newDesigns[0]?.id || null);
  };
  
  const duplicateDesign = (id: string) => {
      const source = designs.find(d => d.id === id);
      if (!source) return;
      const newId = Math.random().toString(36).substr(2, 9);
      setDesigns([...designs, { ...source, id: newId, x: source.x + 20, y: source.y + 20 }]);
      setSelectedId(newId);
  };

  const handleContextMenu = (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({ x: e.clientX, y: e.clientY, id });
      setSelectedId(id);
  };
  
  // Drag Handlers for Bookmarks
  const startDrag = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      // Only start drag if not clicking on sticker or resize handle
      const design = designs.find(d => d.id === id);
      if (!design) return;
      
      dragRef.current = {
          id,
          startX: e.clientX,
          startY: e.clientY,
          initialX: design.x,
          initialY: design.y
      };
      
      document.addEventListener('mousemove', handleDragMove);
      document.addEventListener('mouseup', stopDrag);
  };
  
  const handleDragMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const { id, startX, startY, initialX, initialY } = dragRef.current;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      const scale = 0.8; // Preview scale
      
      const newX = initialX + deltaX / scale;
      const newY = initialY + deltaY / scale;
      
      // Simple page boundary check (optional, or allow dragging freely)
      // For now, allow free drag.
      
      setDesigns(prev => prev.map(d => d.id === id ? { ...d, x: newX, y: newY } : d));
  };
  
  const stopDrag = () => {
      dragRef.current = null;
      document.removeEventListener('mousemove', handleDragMove);
      document.removeEventListener('mouseup', stopDrag);
  };

  // Resize Handlers
  const startResize = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const design = designs.find(d => d.id === id);
      if (!design) return;
      
      resizeRef.current = {
          id,
          startX: e.clientX,
          startY: e.clientY,
          startW: design.width,
          startH: design.height
      };
      
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', stopResize);
  };
  
  const handleResizeMove = (e: MouseEvent) => {
      if (!resizeRef.current) return;
      const { id, startX, startY, startW, startH } = resizeRef.current;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      // Scale is 0.8 in preview, so we need to divide delta by 0.8 to get real px change?
      // Actually the styles are applied directly to the div which is inside a scaled container.
      // So visual delta maps 1:1 to style pixel delta if we are resizing the element itself inside the transform context?
      // No, mouse events are global screen coordinates. The container is scaled 0.8.
      // So 1px mouse movement = 1/0.8 = 1.25px change in internal size.
      const scale = 0.8;
      
      const newW = Math.max(50, startW + deltaX / scale);
      const newH = Math.max(100, startH + deltaY / scale);
      
      setDesigns(prev => prev.map(d => d.id === id ? { ...d, width: newW, height: newH } : d));
  };
  
  const stopResize = () => {
      resizeRef.current = null;
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', stopResize);
  };

  const addSticker = (emoji: string) => {
      if (!selectedDesign) return;
      const newSticker: StickerItem = {
          id: Math.random().toString(36).substr(2, 9),
          emoji,
          x: 50,
          y: 50
      };
      updateDesign({ stickers: [...selectedDesign.stickers, newSticker] });
  };

  const removeSticker = (stickerId: string) => {
      if (!selectedDesign) return;
      updateDesign({ stickers: selectedDesign.stickers.filter(s => s.id !== stickerId) });
  };

  const handleStickerDragStart = (e: React.MouseEvent, stickerId: string) => {
      e.stopPropagation();
  };

  const handleDragOver = (e: React.DragEvent, designId: string) => {
      e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, designId: string) => {
      e.preventDefault();
      const emoji = e.dataTransfer.getData("text/plain");
      if (emoji && selectedId === designId) {
          // Calculate relative position
          const rect = e.currentTarget.getBoundingClientRect();
          const x = ((e.clientX - rect.left) / rect.width) * 100;
          const y = ((e.clientY - rect.top) / rect.height) * 100;
          
          const newSticker: StickerItem = {
              id: Math.random().toString(36).substr(2, 9),
              emoji,
              x,
              y
          };
          updateDesign({ stickers: [...(selectedDesign?.stickers || []), newSticker] });
      }
  };

  const emojiToPng = async (emoji: string): Promise<Uint8Array> => {
      const canvas = document.createElement("canvas");
      canvas.width = 100;
      canvas.height = 100;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("No context");
      
      ctx.font = "80px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(emoji, 50, 50);
      
      return new Promise((resolve) => {
          canvas.toBlob((blob) => {
              if (blob) {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                      const base64data = reader.result as string;
                      const binary = atob(base64data.split(',')[1]);
                      const len = binary.length;
                      const bytes = new Uint8Array(len);
                      for (let i = 0; i < len; i++) {
                          bytes[i] = binary.charCodeAt(i);
                      }
                      resolve(bytes);
                  };
                  reader.readAsDataURL(blob);
              }
          }, 'image/png');
      });
  };

  const downloadPrintable = async () => {
      setIsProcessing(true);
      try {
          const doc = await PDFDocument.create();
          const page = doc.addPage([595.28, 841.89]); // A4
          const { width: a4w, height: a4h } = page.getSize();
          
          const gap = 10;
          const margin = 20;
          
          let currentX = margin;
          let currentY = a4h - margin;
          
          // Group by page for PDF generation if we were doing multi-page doc from scratch
          // But here we just iterate designs which have x,y relative to THEIR page.
          // Wait, the designs state has 'page' index.
          
          // We need to create enough pages first.
          const maxPage = Math.max(0, ...designs.map(d => d.page));
          const pdfPages: PDFPage[] = [];
          for (let i = 0; i <= maxPage; i++) {
              pdfPages.push(doc.addPage([595.28, 841.89]));
          }
          
          // Embed Fonts if needed (standard fonts are built-in)
          const fontRef = await doc.embedFont(StandardFonts.Helvetica);
          
          for (let i = 0; i < designs.length; i++) {
              const d = designs[i];
              // Safety check: if page index is out of bounds (e.g. from old state), default to 0
              const pageIndex = d.page || 0;
              let page = pdfPages[pageIndex];
              
              // If page doesn't exist (should not happen if maxPage logic is correct), create it on demand
              if (!page) {
                   page = doc.addPage([595.28, 841.89]);
                   pdfPages[pageIndex] = page;
              }
              
              const safeNum = (n: any, def: number) => (Number.isFinite(n) ? n : def);
              
              const x = safeNum(d.x, 0);
              const width = safeNum(d.width, 130);
              const height = safeNum(d.height, 450);
              // PDF coords are bottom-up. d.y is top-down relative to page top.
              const y = 841.89 - safeNum(d.y, 0) - height; 
              
              const [r, g, b] = hexToRgb(d.color);
              
              // Draw Shape
              if (d.shape === 'tag') {
                   const cornerSize = 20;
                   // 1. Draw Full Rectangle Background to ensure color
                   page.drawRectangle({
                      x, y, width, height,
                      color: rgb(r, g, b),
                      // No border here, we draw cut lines manually
                   });
                   
                   // 2. Draw Tag Border Lines (Cutting Guide)
                   const borderColor = rgb(0.5, 0.5, 0.5);
                   const borderWidth = 1;
                   
                   // Points
                   // Tag shape: Flat top, pointed bottom.
                   // PDF Coords: y is bottom-left of the rect.
                   // Top-Left: (x, y+height)
                   // Top-Right: (x+width, y+height)
                   // Bottom-Right-Corner: (x+width, y+cornerSize)
                   // Bottom-Tip: (x+width/2, y)
                   // Bottom-Left-Corner: (x, y+cornerSize)
                   
                   const p1 = { x: x, y: y + height }; // Top-Left
                   const p2 = { x: x + width, y: y + height }; // Top-Right
                   const p3 = { x: x + width, y: y + cornerSize }; // Bottom-Right-Start
                   const p4 = { x: x + width / 2, y: y }; // Bottom-Tip
                   const p5 = { x: x, y: y + cornerSize }; // Bottom-Left-Start
                   
                   page.drawLine({ start: p1, end: p2, color: borderColor, thickness: borderWidth });
                   page.drawLine({ start: p2, end: p3, color: borderColor, thickness: borderWidth });
                   page.drawLine({ start: p3, end: p4, color: borderColor, thickness: borderWidth });
                   page.drawLine({ start: p4, end: p5, color: borderColor, thickness: borderWidth });
                   page.drawLine({ start: p5, end: p1, color: borderColor, thickness: borderWidth });

              } else if (d.shape === 'rounded') {
                   const rad = safeNum(d.radius, 10);
                   
                   // Use Primitives: Cross + 4 Circles. Robust and guaranteed to work.
                   // 1. Center Rect vertical
                   page.drawRectangle({ x: x + rad, y: y, width: width - 2 * rad, height: height, color: rgb(r, g, b) });
                   // 2. Center Rect horizontal
                   page.drawRectangle({ x: x, y: y + rad, width: width, height: height - 2 * rad, color: rgb(r, g, b) });
                   // 3. Corners
                   page.drawCircle({ x: x + rad, y: y + rad, size: rad, color: rgb(r, g, b) });
                   page.drawCircle({ x: x + width - rad, y: y + rad, size: rad, color: rgb(r, g, b) });
                   page.drawCircle({ x: x + rad, y: y + height - rad, size: rad, color: rgb(r, g, b) });
                   page.drawCircle({ x: x + width - rad, y: y + height - rad, size: rad, color: rgb(r, g, b) });
                   
                   // 4. Border (Optional, simplified to Rect for cutting guide, or draw 4 lines + 4 arcs? Arcs are hard)
                   // Let's just draw a bounding box cutting guide for simplicity, user cuts rounded.
                   // Or just draw 4 lines connecting the straight parts.
                   const borderColor = rgb(0.5, 0.5, 0.5);
                   const bw = 1;
                   
                   // Left line
                   page.drawLine({ start: { x: x, y: y + rad }, end: { x: x, y: y + height - rad }, color: borderColor, thickness: bw });
                   // Top line
                   page.drawLine({ start: { x: x + rad, y: y + height }, end: { x: x + width - rad, y: y + height }, color: borderColor, thickness: bw });
                   // Right line
                   page.drawLine({ start: { x: x + width, y: y + rad }, end: { x: x + width, y: y + height - rad }, color: borderColor, thickness: bw });
                   // Bottom line
                   page.drawLine({ start: { x: x + rad, y: y }, end: { x: x + width - rad, y: y }, color: borderColor, thickness: bw });
                   
                   // We skip drawing arc borders to avoid complexity/crashes. The fill is correct.

              } else {
                   // Rectangle
                   page.drawRectangle({
                      x, y, width: width, height: height,
                      color: rgb(r, g, b),
                      borderColor: rgb(0.5, 0.5, 0.5),
                      borderWidth: 1
                   });
              }

              // Hole Punch
              page.drawCircle({
                  x: x + width / 2,
                  y: y + height - 30,
                  size: 5,
                  color: rgb(1, 1, 1),
                  borderColor: rgb(0.8, 0.8, 0.8),
                  borderWidth: 1
              });
              
              // Text
              // Center text
              const titleSize = 18;
              const subSize = 10;
              
              // Map font
              let fontToUse = StandardFonts.Helvetica;
              if (d.font === 'Serif') fontToUse = StandardFonts.TimesRoman;
              else if (d.font === 'Mono') fontToUse = StandardFonts.Courier;
              
              const fontRef = await doc.embedFont(fontToUse);
              
              // Helper for text wrapping
              const drawWrappedText = (text: string, x: number, y: number, size: number, maxWidth: number, color: any, font: any) => {
                  const words = text.split(' ');
                  let line = '';
                  let currentY = y;
                  const lineHeight = size * 1.2;
                  
                  // Calculate total height to center vertically
                  // First pass: count lines
                  let lineCount = 0;
                  let testLine = '';
                  for (let n = 0; n < words.length; n++) {
                      const testWord = words[n];
                      const testString = testLine + testWord + ' ';
                      const width = font.widthOfTextAtSize(testString, size);
                      if (width > maxWidth && n > 0) {
                          lineCount++;
                          testLine = testWord + ' ';
                      } else {
                          testLine = testString;
                      }
                  }
                  lineCount++; // Last line
                  
                  // Adjust start Y based on total height
                  const totalHeight = lineCount * lineHeight;
                  // Center Y is `y`. Top is `y + totalHeight/2`.
                  // First line baseline is `y + totalHeight/2 - size`.
                  
                  currentY = y + (totalHeight / 2) - size; 
                  
                  // Draw
                  line = '';
                  for (let n = 0; n < words.length; n++) {
                      const testWord = words[n];
                      const testString = line + testWord + ' ';
                      const width = font.widthOfTextAtSize(testString, size);
                      if (width > maxWidth && n > 0) {
                          // Draw current line centered
                          const lineWidth = font.widthOfTextAtSize(line, size);
                          page.drawText(line, {
                              x: x + (maxWidth - lineWidth) / 2, // Center in maxWidth
                              y: currentY,
                              size: size,
                              color: color,
                              font: font
                          });
                          line = testWord + ' ';
                          currentY -= lineHeight;
                      } else {
                          line = testString;
                      }
                  }
                  // Last line
                  const lineWidth = font.widthOfTextAtSize(line, size);
                  page.drawText(line, {
                      x: x + (maxWidth - lineWidth) / 2,
                      y: currentY,
                      size: size,
                      color: color,
                      font: font
                  });
              };
              
              // Draw Title
              drawWrappedText(d.text || '', x + 10, y + height / 2 + 20, titleSize, width - 20, rgb(0.2, 0.2, 0.2), fontRef);
              
              // Draw Subtext
              // Subtext is usually below title. Let's offset it.
              // Or keep original position logic but wrapped.
              drawWrappedText(d.subText || '', x + 10, y + height / 2 - 20, subSize, width - 20, rgb(0.4, 0.4, 0.4), fontRef);

              // Stickers
              for (const s of d.stickers) {
                  const pngBytes = await emojiToPng(s.emoji);
                  const pngImage = await doc.embedPng(pngBytes);
                  
                  const imgSize = 30; 
                  const sX = x + (s.x / 100) * width - imgSize / 2;
                  const sY = y + ((100 - s.y) / 100) * height - imgSize / 2; 
                  
                  page.drawImage(pngImage, {
                      x: sX,
                      y: sY,
                      width: imgSize,
                      height: imgSize,
                  });
              }
          }

          const pdfBytes = await doc.save();
          saveAs(new Blob([pdfBytes.buffer as ArrayBuffer], { type: 'application/pdf' }), 'printable-bookmarks.pdf');
      } catch (e) {
          console.error(e);
          alert("Error generating PDF");
      } finally {
          setIsProcessing(false);
      }
  };

  const hexToRgb = (hex: string): [number, number, number] => {
      const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
      return result ? [
          parseInt(result[1], 16) / 255,
          parseInt(result[2], 16) / 255,
          parseInt(result[3], 16) / 255
      ] : [1, 1, 1];
  };

  return (
    <LiquidContainer>
      <LiquidAppLayout>
        <LiquidSidebar title="Design Bookmarks" subtitle="Create printable bookmarks">
          {selectedDesign ? (
              <div className="flex flex-col gap-4">
                  <LiquidControlGroup label="Content">
                      <input 
                          className="w-full bg-white/10 p-2 rounded text-[var(--text)] mb-2" 
                          placeholder="Title"
                          value={selectedDesign.text}
                          onChange={e => updateDesign({ text: e.target.value })}
                      />
                      <textarea 
                          className="w-full bg-white/10 p-2 rounded text-[var(--text)] text-sm h-20" 
                          placeholder="Quote or Subtitle"
                          value={selectedDesign.subText}
                          onChange={e => updateDesign({ subText: e.target.value })}
                      />
                  </LiquidControlGroup>
                  
                  <LiquidControlGroup label="Shape">
                      <div className="flex gap-2">
                          {[
                              { id: 'rectangle', icon: Square, label: 'Rect' },
                              { id: 'rounded', icon: Circle, label: 'Round' },
                              { id: 'tag', icon: Tag, label: 'Tag' }
                          ].map(s => (
                              <button
                                key={s.id}
                                className={`flex-1 p-2 rounded flex flex-col items-center gap-1 border transition-all ${selectedDesign.shape === s.id ? 'bg-white/20 border-white' : 'border-transparent hover:bg-white/5'}`}
                                onClick={() => updateDesign({ shape: s.id as any })}
                              >
                                  <s.icon size={16} />
                                  <span className="text-[10px]">{s.label}</span>
                              </button>
                          ))}
                      </div>
                      
                      {selectedDesign.shape === 'rounded' && (
                          <div className="mt-2 flex items-center gap-2">
                              <span className="text-xs text-[var(--text-sec)]">Radius</span>
                              <input 
                                  type="range" min="0" max="50"
                                  value={selectedDesign.radius || 20}
                                  onChange={(e) => updateDesign({ radius: parseInt(e.target.value) })}
                                  className="flex-1 h-1 bg-white/20 rounded-lg appearance-none cursor-pointer"
                              />
                              <span className="text-xs w-6">{selectedDesign.radius || 20}</span>
                          </div>
                      )}
                  </LiquidControlGroup>

                  <LiquidControlGroup label="Stickers">
                      <div className="grid grid-cols-6 gap-2">
                          {PRESET_EMOJIS.map(emoji => (
                              <button
                                  key={emoji}
                                  className="aspect-square flex items-center justify-center hover:bg-white/10 rounded text-xl"
                                  onClick={() => addSticker(emoji)}
                              >
                                  {emoji}
                              </button>
                          ))}
                      </div>
                      <div className="text-xs text-[var(--text-sec)] mt-2">
                          Drag stickers on the preview to move them.
                      </div>
                  </LiquidControlGroup>
                  
                  <LiquidControlGroup label="Style">
                      <div className="flex flex-wrap gap-2 mb-2">
                          {PRESET_COLORS.map(c => (
                              <button 
                                key={c}
                                className={`w-6 h-6 rounded-full border-2 ${selectedDesign.color === c ? 'border-white' : 'border-transparent'}`}
                                style={{ backgroundColor: c }}
                                onClick={() => updateDesign({ color: c })}
                              />
                          ))}
                      </div>
                      <GlassSelect 
                          value={selectedDesign.font}
                          onChange={v => updateDesign({ font: v })}
                          options={['Sans', 'Serif', 'Mono', 'Cursive'].map(f => ({ value: f, label: f }))}
                      />
                  </LiquidControlGroup>
              </div>
          ) : (
              <div className="text-center opacity-50 py-10">Select a bookmark to edit</div>
          )}

          <div className="mt-auto flex gap-2">
             <LiquidButton onClick={addDesign} className="flex-1">
                <div className="flex items-center gap-2 justify-center">
                    <Plus size={16} />
                    <span>New</span>
                </div>
             </LiquidButton>
             
             <LiquidButton onClick={downloadPrintable} disabled={designs.length === 0 || isProcessing} isLoading={isProcessing} className="flex-1">
                <div className="flex items-center gap-2 justify-center">
                    <Printer size={16} />
                    <span>Print PDF</span>
                </div>
             </LiquidButton>
          </div>
        </LiquidSidebar>

        <LiquidMainArea className="p-8 bg-[#e0e0e0] dark:bg-[#1a1a1a]">
            {/* A4 Preview Canvas */}
            <div className="w-full h-full flex items-center justify-center overflow-auto">
                <div 
                    className="bg-white shadow-2xl relative transition-transform origin-top"
                    style={{ 
                        width: '595px', 
                        height: '842px', // A4 aspect ratio 1:1.414 scaled
                        transform: 'scale(0.8)',
                        flexShrink: 0
                    }}
                >
                    <div className="absolute inset-0 p-10 flex justify-center gap-4">
                        {designs.map((d, i) => (
                            <div 
                                key={d.id}
                                onClick={() => setSelectedId(d.id)}
                                onContextMenu={(e) => handleContextMenu(e, d.id)}
                                className={`relative transition-all hover:scale-[1.02] group/bm ${selectedId === d.id ? 'z-10' : ''}`}
                                style={{ 
                                    width: `${d.width}px`,
                                    height: `${d.height}px`,
                                }}
                                onDragOver={(e) => handleDragOver(e, d.id)}
                                onDrop={(e) => handleDrop(e, d.id)}
                            >
                                {/* Selection Ring (Separate to avoid clipping) */}
                                {selectedId === d.id && (
                                    <div className="absolute inset-[-4px] border-2 border-blue-500 rounded-lg pointer-events-none z-20" />
                                )}

                                {/* Main Shape Content */}
                                    <div 
                                        className="w-full h-full flex flex-col items-center p-6 text-center shadow-sm relative overflow-hidden select-none"
                                        style={{
                                            backgroundColor: d.color,
                                            fontFamily: d.font === 'Mono' ? 'monospace' : d.font === 'Serif' ? 'serif' : 'sans-serif',
                                            borderRadius: d.shape === 'rounded' ? `${d.radius || 20}px` : d.shape === 'tag' ? '0' : '0',
                                            clipPath: d.shape === 'tag' ? 'polygon(0% 0%, 100% 0%, 100% 90%, 50% 100%, 0% 90%)' : undefined
                                        }}
                                    >
                                        {/* Hole Punch Mark */}
                                        <div className="w-3 h-3 rounded-full bg-white border border-black/10 mb-8 mx-auto flex-shrink-0" />
                                        
                                        <div className="flex-1 flex flex-col justify-center w-full z-10">
                                            <h2 className="text-2xl font-bold text-gray-800 mb-4 leading-tight break-words pointer-events-none">{d.text}</h2>
                                            <p className="text-sm text-gray-600 italic break-words pointer-events-none">{d.subText}</p>
                                        </div>
                                        
                                        {/* Stickers Layer */}
                                        {d.stickers.map(sticker => (
                                            <div
                                                key={sticker.id}
                                                className="absolute cursor-move select-none hover:scale-110 transition-transform"
                                                style={{
                                                    left: `${sticker.x}%`,
                                                    top: `${sticker.y}%`,
                                                    transform: 'translate(-50%, -50%)',
                                                    fontSize: '24px',
                                                    zIndex: 20
                                                }}
                                                draggable
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData("text/plain", sticker.emoji);
                                                    e.dataTransfer.effectAllowed = "move";
                                                }}
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeSticker(sticker.id);
                                                }}
                                                onMouseDown={(e) => e.stopPropagation()} // Prevent drag of bookmark when clicking sticker
                                                title="Click to remove"
                                            >
                                                {sticker.emoji}
                                            </div>
                                        ))}
                                        
                                        <div className="mt-4 opacity-20">
                                           <div className="text-4xl">★</div>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); deleteDesign(d.id); }}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover/bm:opacity-100 transition-opacity z-30"
                                        onMouseDown={(e) => e.stopPropagation()}
                                    >
                                        <Trash2 size={12} />
                                    </button>

                                {/* Resize Handle */}
                                {selectedId === d.id && (
                                    <div 
                                        className="absolute bottom-1 right-1 w-6 h-6 bg-blue-500 rounded-full cursor-se-resize flex items-center justify-center text-white z-50 opacity-0 group-hover/bm:opacity-100 transition-opacity"
                                        onMouseDown={(e) => startResize(e, d.id)}
                                        onClick={(e) => e.stopPropagation()}
                                    >
                                        <Maximize size={12} className="rotate-90" />
                                    </div>
                                )}
                            </div>
                        ))}
                        
                        {designs.length < 4 && (
                            <div 
                                onClick={addDesign}
                                className="w-[130px] h-[450px] border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 cursor-pointer hover:bg-gray-50"
                            >
                                <Plus size={32} />
                                <span className="mt-2 text-sm">Add Bookmark</span>
                            </div>
                        )}
                    </div>
                    
                    <div className="absolute bottom-2 right-4 text-[10px] text-gray-300">
                        A4 Preview (Auto-Layout)
                    </div>
                    
                    {/* Context Menu */}
                    {contextMenu && (
                        <div 
                            className="fixed bg-white/90 backdrop-blur shadow-xl rounded-lg border border-gray-200 py-1 z-[100] min-w-[150px] flex flex-col"
                            style={{ left: contextMenu.x, top: contextMenu.y }}
                        >
                             <button 
                                className="px-4 py-2 text-left hover:bg-blue-50 text-sm flex items-center gap-2"
                                onClick={(e) => { e.stopPropagation(); duplicateDesign(contextMenu.id); setContextMenu(null); }}
                             >
                                 <Copy size={14} /> Duplicate
                             </button>
                             <button 
                                className="px-4 py-2 text-left hover:bg-red-50 text-red-600 text-sm flex items-center gap-2"
                                onClick={(e) => { e.stopPropagation(); deleteDesign(contextMenu.id); setContextMenu(null); }}
                             >
                                 <Trash2 size={14} /> Delete
                             </button>
                        </div>
                    )}
                </div>
            </div>
        </LiquidMainArea>
      </LiquidAppLayout>
    </LiquidContainer>
  );
}

"use client";

import React, { useState, useEffect, useRef } from 'react';
import { LiquidGlass } from './LiquidGlass';

interface LiquidButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  isLoading?: boolean;
}

export const LiquidButton: React.FC<LiquidButtonProps> = ({ 
  children, 
  isLoading, 
  className = '', 
  disabled,
  ...props 
}) => {
  return (
    <button 
        className={`btn liquid-btn ${className}`} 
        disabled={disabled || isLoading}
        {...props}
    >
        {isLoading ? '处理中...' : children}
    </button>
  );
};

export const LiquidContainer: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="w-full p-0 m-0 flex items-center justify-center h-[calc(100vh-80px)] bg-transparent bg-cover font-sans font-normal overflow-hidden text-[var(--text)]">
    {children}
  </div>
);

interface LiquidAppLayoutProps {
  children: React.ReactNode;
  onFileDrop?: (file: File) => void;
  accept?: string;
}

export const LiquidAppLayout: React.FC<LiquidAppLayoutProps> = ({ children, onFileDrop, accept = 'application/pdf' }) => {
  const [isDragging, setIsDragging] = useState(false);
  const dragCounter = useRef(0);
  const isInternalDrag = (e: React.DragEvent | DragEvent) =>
    Array.from(e.dataTransfer?.types ?? []).includes('application/x-pdf-merge-card');

  const handleDragEnter = (e: React.DragEvent | DragEvent) => {
    if (isInternalDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if (e.dataTransfer && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
       setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent | DragEvent) => {
    if (isInternalDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current === 0) {
      setIsDragging(false);
    }
  };

  const handleDragOver = (e: React.DragEvent | DragEvent) => {
    if (isInternalDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent | DragEvent) => {
    if (isInternalDrag(e)) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;

    if (onFileDrop) {
      const file = e.dataTransfer?.files?.[0];
      if (file) {
        // Simple type check if accept is provided (basic implementation)
        if (accept === '*' || file.type.match(accept.replace('*', '.*'))) {
           onFileDrop(file);
        } else {
           // Optionally alert user or just ignore
           alert(`Please select a valid file (${accept})`);
        }
      }
    }
  };

  useEffect(() => {
    if (!onFileDrop) return;

    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);
    
    return () => {
        window.removeEventListener('dragenter', handleDragEnter);
        window.removeEventListener('dragleave', handleDragLeave);
        window.removeEventListener('dragover', handleDragOver);
        window.removeEventListener('drop', handleDrop);
    };
  }, [onFileDrop]);

  return (
    <div className="appLayout w-full h-full flex p-8 gap-8 relative">
      {onFileDrop && (
          <div className={`globalDragOverlay fixed inset-5 z-[9999] bg-[var(--drag-overlay-bg)] backdrop-blur-2xl rounded-3xl border-2 border-dashed border-[var(--drag-overlay-border)] flex flex-col items-center justify-center opacity-0 pointer-events-none transition-all duration-300 scale-95 shadow-2xl ${isDragging ? 'opacity-100 pointer-events-auto scale-100' : ''}`}>
               <div className="dragContent text-center text-[var(--text)] p-10 bg-[var(--drag-content-bg)] rounded-3xl border border-[var(--drag-overlay-border)] shadow-lg">
                   <svg className="dragIcon w-16 h-16 mb-5 text-[var(--primary)] drop-shadow-md mx-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                   </svg>
                   <div className="dragTitle text-2xl font-bold mb-2">Release to Upload</div>
                   <div className="dragSubtitle text-base text-[var(--text-sec)]">Supports {accept === 'application/pdf' ? 'PDF' : 'files'}</div>
               </div>
          </div>
      )}
      {children}
    </div>
  );
};

export const LiquidSidebar: React.FC<{ children: React.ReactNode, title: string, subtitle: string }> = ({ children, title, subtitle }) => (
  <div className="sidebar liquid-glass-wrapper w-[340px] shrink-0 flex-col">
      <div className="liquid-glass-effect"></div>
      <div className="liquid-glass-tint"></div>
      <div className="liquid-glass-shine"></div>
      <div className="liquid-glass-text sidebarContent flex flex-col px-7 overflow-y-auto h-[calc(100%-3rem)] w-full my-6">
          <div className="header mb-6">
              <div className="title text-2xl font-bold mb-1.5 text-[var(--text)]">{title}</div>
              <div className="subtitle text-sm text-[var(--subtitle-color)] font-medium">{subtitle}</div>
          </div>
          <div className="controls flex flex-col gap-5">
            {children}
          </div>
      </div>
  </div>
);

export const LiquidMainArea: React.FC<{ children: React.ReactNode, className?: string }> = ({ children, className = '' }) => (
  <div className={`mainArea liquid-glass-wrapper w-full flex-1 min-w-0 ${className}`}>
      <div className="liquid-glass-effect"></div>
      <div className="liquid-glass-tint"></div>
      <div className="liquid-glass-shine"></div>
      <div className={`liquid-glass-text mainAreaContent flex flex-col overflow-hidden h-full rounded-[1.8rem] relative`}>
          {children}
      </div>
  </div>
);

export const LiquidControlGroup: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => (
  <div className="controlGroup flex flex-col gap-2.5 p-3 bg-[var(--control-group-bg)] rounded-2xl mb-2.5 shadow-sm border border-[var(--control-group-border)]">
      <label className="label text-xs font-bold text-[var(--label-color)] uppercase mb-1">{label}</label>
      {children}
  </div>
);

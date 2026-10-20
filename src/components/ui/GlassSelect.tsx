"use client";

import React, { useState, useRef, useEffect } from 'react';
import { LiquidGlass } from './LiquidGlass';

interface Option {
  value: any;
  label: string;
}

interface GlassSelectProps {
  value: any;
  options: Option[];
  onChange: (val: any) => void;
}

export const GlassSelect: React.FC<GlassSelectProps> = ({ value, options, onChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedLabel = options.find(o => o.value == value)?.label || value;

  return (
    <div className="customSelectWrapper relative w-full" ref={wrapperRef}>
      <div className={`liquid-input flex items-center justify-between cursor-pointer h-9 rounded-[10px]`} onClick={() => setIsOpen(!isOpen)}>
           <span style={{fontSize: '14px'}}>{selectedLabel}</span>
           <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', opacity: 0.6}}>
               <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
           </svg>
      </div>
      
      <div className={`customSelectOptions absolute top-full left-0 right-0 mt-2 z-50 rounded-xl opacity-0 invisible -translate-y-2.5 transition-all duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)] ${isOpen ? 'opacity-100 visible translate-y-0' : ''}`}>
           <LiquidGlass style={{width: '100%', height: 'auto', borderRadius: '12px', overflow: 'hidden'}}>
               <div className="optionsContent p-1.5 max-h-[200px] overflow-y-auto">
                  {options.map(opt => (
                      <div 
                          key={opt.value} 
                          className={`customOption p-2 px-3 text-sm text-[var(--text)] rounded-lg cursor-pointer transition-colors duration-200 hover:bg-[var(--option-hover)] ${opt.value == value ? '!bg-[var(--primary)] text-white' : ''}`}
                          onClick={() => {
                              onChange(opt.value);
                              setIsOpen(false);
                          }}
                      >
                          {opt.label}
                      </div>
                  ))}
               </div>
           </LiquidGlass>
      </div>
    </div>
  );
};

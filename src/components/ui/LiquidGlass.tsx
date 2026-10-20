import React from 'react';

interface LiquidGlassProps {
  children?: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const LiquidGlass: React.FC<LiquidGlassProps> = ({ children, className = '', style = {} }) => (
  <div className={`liquid-glass-wrapper ${className}`} style={style}>
      <div className="liquid-glass-effect"></div>
      <div className="liquid-glass-tint"></div>
      <div className="liquid-glass-shine"></div>
      <div className="liquid-glass-text">{children}</div>
  </div>
);

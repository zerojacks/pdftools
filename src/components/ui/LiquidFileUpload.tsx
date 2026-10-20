import React, { useRef } from 'react';

interface LiquidFileUploadProps {
  onFileSelect: (file: File) => void;
  fileName?: string;
  accept?: string;
}

export const LiquidFileUpload: React.FC<LiquidFileUploadProps> = ({ 
  onFileSelect, 
  fileName = '点击选择文件', 
  accept = 'application/pdf' 
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div 
        className="fileUploadWrapper liquid-glass-wrapper w-full min-h-[44px] cursor-pointer rounded-xl transition-all duration-200 hover:scale-[1.02]"
        onClick={() => fileInputRef.current?.click()}
    >
        <div className="liquid-glass-effect"></div>
        <div className="liquid-glass-tint"></div>
        <div className="liquid-glass-shine"></div>
        <div className="liquid-glass-text fileUploadContent flex items-center justify-center p-2.5 text-sm text-[var(--text)] text-center">
            <input 
                type="file" 
                ref={fileInputRef}
                accept={accept} 
                className="hidden"
                onChange={handleFileChange}
            />
            <span className="truncate max-w-[200px]">{fileName}</span>
        </div>
    </div>
  );
};

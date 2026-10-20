"use client";

import { useDropzone } from "react-dropzone";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onFileSelect: (file: File) => void;
  className?: string;
  accept?: Record<string, string[]>;
}

export default function FileUpload({ onFileSelect, className, accept }: FileUploadProps) {
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: (acceptedFiles) => {
      if (acceptedFiles?.[0]) {
        onFileSelect(acceptedFiles[0]);
      }
    },
    accept: accept || { 'application/pdf': ['.pdf'] },
    multiple: false
  });

  return (
    <div
      {...getRootProps()}
      className={cn(
        "glass-panel border-2 border-dashed border-white/40 dark:border-white/10 rounded-3xl p-10 cursor-pointer transition-all hover:bg-white/40 dark:hover:bg-white/5",
        isDragActive ? "border-blue-400 bg-blue-50/20 dark:bg-blue-900/20" : "",
        className
      )}
    >
      <input {...getInputProps()} />
      <div className="flex flex-col items-center justify-center text-center gap-4">
        <div className="p-4 bg-white/20 dark:bg-white/5 rounded-full shadow-sm">
          <Upload className="w-8 h-8 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <p className="text-lg font-medium text-slate-700 dark:text-slate-200">
            {isDragActive ? "Drop PDF here" : "Click to upload or drag & drop"}
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">PDF files only</p>
        </div>
      </div>
    </div>
  );
}

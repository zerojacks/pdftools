let pdfjsLib: any = null;

export const getPdfJs = async () => {
  if (typeof window === 'undefined') {
    return null;
  }

  if (!pdfjsLib) {
    pdfjsLib = await import('pdfjs-dist');
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
    }
  }
  return pdfjsLib;
};

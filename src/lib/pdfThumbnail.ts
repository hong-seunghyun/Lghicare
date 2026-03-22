const ensureCanvasBlob = (canvas: HTMLCanvasElement) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("PDF 썸네일 변환에 실패했습니다."));
          return;
        }
        resolve(blob);
      },
      "image/jpeg",
      0.86,
    );
  });

export const createPdfThumbnailBlob = async (
  file: File,
  scale = 1.5,
): Promise<Blob> => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  if (typeof window !== "undefined") {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL(
      "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
      import.meta.url,
    ).toString();
  }
  const data = await file.arrayBuffer();
  const task = pdfjs.getDocument({ data });
  const pdf = await task.promise;
  const page = await pdf.getPage(1);
  const viewport = page.getViewport({ scale });

  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("캔버스 컨텍스트를 생성할 수 없습니다.");
  }

  await page.render({ canvasContext: ctx, viewport }).promise;
  return ensureCanvasBlob(canvas);
};

"use client";

import React, { useEffect, useRef, useState } from "react";
import styled from "styled-components";

type PdfPreviewProps = {
  url: string;
  name: string;
};

type PdfLoadingTask = {
  promise: Promise<{
    getPage: (pageNumber: number) => Promise<{
      getViewport: (options: { scale: number }) => {
        width: number;
        height: number;
      };
      render: (options: {
        canvasContext: CanvasRenderingContext2D;
        viewport: {
          width: number;
          height: number;
        };
      }) => { promise: Promise<void> };
    }>;
  }>;
  destroy?: () => void;
};

const mobileUserAgentRegex = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;
const isMobileDevice = () =>
  typeof navigator !== "undefined" && mobileUserAgentRegex.test(navigator.userAgent);

const PdfPreview: React.FC<PdfPreviewProps> = ({ url, name }) => {
  const [isMobile, setIsMobile] = useState<boolean>(isMobileDevice());

  useEffect(() => {
    setIsMobile(isMobileDevice());
  }, []);

  return isMobile ? (
    <MobilePdfPreview url={url} name={name} />
  ) : (
    <DesktopFrame src={url} title={name} loading="lazy" />
  );
};

const MobilePdfPreview: React.FC<PdfPreviewProps> = ({ url, name }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let loadingTask: PdfLoadingTask | null = null;

    const renderPreview = async () => {
      try {
        setLoading(true);
        setError(null);

        const pdfjs = (await import("pdfjs-dist/legacy/build/pdf.mjs")) as typeof import("pdfjs-dist/legacy/build/pdf.mjs");
        if (typeof window !== "undefined") {
          pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;
        }

        loadingTask = pdfjs.getDocument({ url }) as unknown as PdfLoadingTask;
        const pdf = await loadingTask.promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.2 });
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Canvas context unavailable");
        }
        await page.render({ canvasContext: context, viewport }).promise;
      } catch (err: unknown) {
        if (!cancelled) {
          console.error("PDF preview render failed:", err);
          setError("미리보기를 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
        loadingTask?.destroy?.();
      }
    };

    renderPreview();

    return () => {
      cancelled = true;
      loadingTask?.destroy?.();
    };
  }, [url]);

  const showCanvas = !loading && !error;

  return (
    <MobilePreviewWrapper>
      <MobilePreviewFrame>
        {loading && <PreviewState>미리보는 중...</PreviewState>}
        {error && <PreviewState>{error}</PreviewState>}
        <PreviewCanvas
          ref={canvasRef}
          aria-label={`PDF preview for ${name}`}
          style={{ display: showCanvas ? "block" : "none" }}
        />
      </MobilePreviewFrame>
    </MobilePreviewWrapper>
  );
};

const DesktopFrame = styled.iframe`
  width: 100%;
  min-height: 720px;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  background: #fff;
`;

const MobilePreviewWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const MobilePreviewFrame = styled.div`
  width: 100%;
  min-height: 240px;
  border: 1px solid #e5e5e5;
  border-radius: 10px;
  background: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
`;

const PreviewCanvas = styled.canvas`
  width: 100%;
  height: auto;
  display: block;
`;

const PreviewState = styled.div`
  font-size: 12px;
  color: #666;
`;

export default PdfPreview;

import { useEffect, useRef, useState } from "react";

type AutoHeightIframeProps = {
  src: string;
  title: string;
  minHeight?: number;
};

export default function AutoHeightIframe({
  src,
  title,
  minHeight = 400,
}: AutoHeightIframeProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(minHeight);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (
        event.data &&
        typeof event.data === "object" &&
        event.data.type === "iframeHeight"
      ) {
        setHeight(Math.max(event.data.height, minHeight));
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [minHeight]);

  return (
    <iframe
      ref={iframeRef}
      src={src}
      title={title}
      width="100%"
      height={height}
      style={{
        border: "none",
        display: "block",
        width: "100%",
        minHeight: `${minHeight}px`,
        overflow: "hidden",
      }}
      scrolling="no"
    />
  );
}

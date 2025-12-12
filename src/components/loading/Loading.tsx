// components/common/Loading.tsx
import React from "react";
import styled from "styled-components";
import Lottie from "lottie-react";

// ✅ public/animations/loading.json 파일 필요
import loadingAnimation from "../../../public/animations/Loading.json";

export default function Loading() {
  return (
    <LoadingContainer>
      <Lottie
        animationData={loadingAnimation}
        loop
        autoplay
        style={{ width: 200, height: 200 }}
      />
    </LoadingContainer>
  );
}

const LoadingContainer = styled.div`
  position: fixed;
  inset: 0;
  background-color: rgba(255, 255, 255, 0.9);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 9999;
`;

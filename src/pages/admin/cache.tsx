// pages/admin/cache.tsx
import { useState } from "react";
import styled from "styled-components";

type ClearResult = {
  ok: boolean;
  message?: string;
  warmedSheets?: string[];
  warmedDrive?: string[];
};

export default function AdminCachePage() {
  const [loadingClearDrive, setLoadingClearDrive] = useState(false);
  const [loadingClearSheet, setLoadingClearSheet] = useState(false);
  const [loadingWarmupSheets, setLoadingWarmupSheets] = useState(false);
  const [loadingWarmupDrive, setLoadingWarmupDrive] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleClearDriveCache = async () => {
    setLoadingClearDrive(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/clear-drive-cache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data: ClearResult = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.message || "드라이브 캐시 초기화에 실패했습니다.");
        return;
      }

      setResult(data.message || "드라이브 캐시가 초기화되었습니다.");
    } catch (err) {
      console.error("❌ clear drive cache fetch error:", err);
      setError("요청 중 오류가 발생했습니다.");
    } finally {
      setLoadingClearDrive(false);
    }
  };

  const handleClearSheetCache = async () => {
    setLoadingClearSheet(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch("/api/admin/clear-sheet-cache", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data: ClearResult = await res.json();

      if (!res.ok || !data.ok) {
        setError(data.message || "시트 캐시 초기화에 실패했습니다.");
        return;
      }

      setResult(data.message || "시트 캐시가 초기화되었습니다.");
    } catch (err) {
      console.error("❌ clear sheet cache fetch error:", err);
      setError("요청 중 오류가 발생했습니다.");
    } finally {
      setLoadingClearSheet(false);
    }
  };

  const handleWarmup = async (target: "sheets" | "drive") => {
    const setLoading =
      target === "sheets" ? setLoadingWarmupSheets : setLoadingWarmupDrive;
    setLoading(true);
    setResult(null);
    setError(null);

    try {
      const res = await fetch(`/api/admin/warmup?target=${target}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      });

      const data: ClearResult = await res.json();

      if (!res.ok || !data.ok) {
        setError(
          data.message ||
            `${target === "sheets" ? "시트" : "드라이브"} warmup 실행에 실패했습니다.`
        );
        return;
      }

      const warmedList =
        target === "sheets" ? data.warmedSheets : data.warmedDrive;
      const warmedText = (warmedList || []).join(", ");

      setResult(
        data.message ||
          `${target === "sheets" ? "Sheets" : "Drive"} warmup 완료${
            warmedText ? `\n${warmedText}` : ""
          }`
      );
    } catch (err) {
      console.error("❌ warmup fetch error:", err);
      setError("Warmup 요청 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const isBusy =
    loadingClearDrive ||
    loadingClearSheet ||
    loadingWarmupSheets ||
    loadingWarmupDrive;

  return (
    <PageContainer>
      <Card>
        <Title>캐시 관리 (Admin)</Title>
        <Desc>
          아래 기능으로 캐시를 관리할 수 있습니다.
          <br />
          <br />
          1) <b>캐시 초기화</b>
          <br />
          - 드라이브 이미지 캐시(globalThis.__driveCache.middleCache) 및
          썸네일 캐시(getDriveThumbnail)
          <br />
          - 구글 시트 데이터 캐시(fetchSheetData)
          <br />
          <br />
          2) <b>캐시 미리 채우기 (Warmup)</b>
          <br />
          - 15개 주요 중분류에 대해 시트와 드라이브 정보를 미리 조회합니다.
          <br />
          - 배포 직후 한 번 실행하면, 첫 방문 사용자도 캐시된 데이터를 기준으로
          빠르게 응답할 수 있습니다.
        </Desc>

        <ButtonRow>
          <PrimaryButton
            type="button"
            onClick={handleClearDriveCache}
            disabled={isBusy}
          >
            {loadingClearDrive ? "드라이브 캐시 초기화 중..." : "드라이브 캐시 초기화"}
          </PrimaryButton>

          <SecondaryButton
            type="button"
            onClick={handleClearSheetCache}
            disabled={isBusy}
          >
            {loadingClearSheet ? "시트 캐시 초기화 중..." : "시트 캐시 초기화"}
          </SecondaryButton>
        </ButtonRow>

        <ButtonRow>
          <SecondaryButton
            type="button"
            onClick={() => handleWarmup("sheets")}
            disabled={isBusy}
          >
            {loadingWarmupSheets ? "Sheets Warmup 중..." : "Sheets Warmup"}
          </SecondaryButton>

          <SecondaryButton
            type="button"
            onClick={() => handleWarmup("drive")}
            disabled={isBusy}
          >
            {loadingWarmupDrive ? "Drive Warmup 중..." : "Drive Warmup"}
          </SecondaryButton>
        </ButtonRow>

        {result && <ResultText>{result}</ResultText>}
        {error && <ErrorText>{error}</ErrorText>}
      </Card>
    </PageContainer>
  );
}

// ====== 스타일 ======
const PageContainer = styled.div`
  min-height: 100vh;
  padding: 80px 16px;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  background: #f5f5f5;
`;

const Card = styled.div`
  width: 100%;
  max-width: 600px;
  padding: 32px 28px;
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 12px;
`;

const Desc = styled.p`
  font-size: 14px;
  color: #555;
  line-height: 1.6;
  margin-bottom: 24px;
  white-space: pre-line;
`;

const ButtonRow = styled.div`
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.button`
  padding: 10px 18px;
  border-radius: 999px;
  border: none;
  background: #111;
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const SecondaryButton = styled.button`
  padding: 10px 18px;
  border-radius: 999px;
  border: 1px solid #111;
  background: #fff;
  color: #111;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    opacity: 0.6;
    cursor: default;
  }
`;

const ResultText = styled.div`
  margin-top: 8px;
  font-size: 13px;
  color: #0a7b34;
  white-space: pre-line;
`;

const ErrorText = styled.div`
  margin-top: 8px;
  font-size: 13px;
  color: #d93025;
`;

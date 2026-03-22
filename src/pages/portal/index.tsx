// pages/portal/index.tsx
import { useRouter } from "next/router";
import styled from "styled-components";

export default function PortalSelectPage() {
  const router = useRouter();

  return (
    <PageWrap>
      <Card>
        <Title>접속 페이지 선택</Title>
        <Desc>원하는 화면으로 이동하세요.</Desc>
        <ButtonRow>
          <PrimaryButton type="button" onClick={() => router.push("/admin")}>
            관리자로 이동
          </PrimaryButton>
          <GhostButton type="button" onClick={() => router.push("/manager")}>
            매니저로 이동
          </GhostButton>
        </ButtonRow>
      </Card>
    </PageWrap>
  );
}

const PageWrap = styled.main`
  min-height: calc(100vh - 120px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 16px 80px;
  background: linear-gradient(180deg, #f7f8fb 0%, #ffffff 100%);
`;

const Card = styled.section`
  width: min(520px, 100%);
  border: 1px solid #e7e9ef;
  border-radius: 16px;
  padding: 32px 28px;
  background: #fff;
  box-shadow: 0 12px 30px rgba(18, 24, 40, 0.08);
  text-align: center;
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 700;
  margin-bottom: 10px;
  color: #1d2433;
`;

const Desc = styled.p`
  font-size: 14px;
  color: #6b7280;
  margin-bottom: 24px;
`;

const ButtonRow = styled.div`
  display: grid;
  gap: 12px;
`;

const BaseButton = styled.button`
  width: 100%;
  padding: 12px 16px;
  border-radius: 10px;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 10px 18px rgba(0, 0, 0, 0.08);
  }
`;

const PrimaryButton = styled(BaseButton)`
  background: #1f2937;
  color: #fff;

  &:hover {
    background: #111827;
  }
`;

const GhostButton = styled(BaseButton)`
  background: #fff;
  color: #1f2937;
  border: 1px solid #d1d5db;

  &:hover {
    background: #f9fafb;
  }
`;

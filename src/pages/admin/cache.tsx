import { useRef, useState } from "react";
import styled from "styled-components";
import { PRODUCT_CATEGORIES } from "@/lib/renewalTest";
import { adminCatalogRequest } from "@/lib/admin/catalogClient";
import Link from "next/link";

type Target = "sheets" | "drive" | "all";
type Task = { category: string; target: "sheets" | "drive"; status: "대기" | "진행 중" | "완료" | "실패"; message?: string };
const targetName = (target: Target) => target === "all" ? "전체" : target === "sheets" ? "상품 데이터" : "이미지";
const resetUrl = (target: Target) => target === "all" ? "/api/admin/cache" : target === "sheets" ? "/api/admin/clear-sheet-cache" : "/api/admin/clear-drive-cache";

export default function AdminCachePage() {
  const [busy, setBusy] = useState(false);
  const [category, setCategory] = useState("전체");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [tasks, setTasks] = useState<Task[]>([]);
  const stopRequested = useRef(false);
  const reset = async (target: Target) => {
    await adminCatalogRequest(resetUrl(target), {});
  };
  const clear = async (target: Target) => {
    setBusy(true); setError(""); setResult(""); setTasks([]);
    try {
      await reset(target);
      setResult(targetName(target) + " 캐시를 초기화했습니다. 다른 서버에도 5초 이내에 반영됩니다.");
    } catch (e) { setError(e instanceof Error ? e.message : "초기화 중 오류가 발생했습니다."); }
    finally { setBusy(false); }
  };
  const run = async (target: Target, retry = false) => {
    const categories = category === "전체" ? PRODUCT_CATEGORIES : [category];
    const queue: Task[] = retry ? tasks.filter((t) => t.status === "실패" || t.status === "대기").map((t) => ({ ...t, status: "대기", message: undefined })) :
      categories.flatMap((name) => (target === "all" ? ["sheets", "drive"] as const : [target]).map((kind) => ({ category: name, target: kind, status: "대기" })));
    const next: Task[] = retry ? tasks.map((t) => t.status === "완료" ? t : { ...t, status: "대기", message: undefined }) : queue;
    const update = (task: Task, patch: Partial<Task>) => {
      const index = next.findIndex((t) => t.category === task.category && t.target === task.target);
      next[index] = { ...next[index], ...patch };
      setTasks([...next]);
    };
    setBusy(true); setError(""); setResult(""); setTasks([...next]); stopRequested.current = false;
    try {
      if (!retry) await reset(target);
      for (const task of queue) {
        if (stopRequested.current) break;
        update(task, { status: "진행 중" });
        try {
          await adminCatalogRequest("/api/admin/warmup?target=" + task.target, { category: task.category, reset: false });
          update(task, { status: "완료" });
        } catch (e) { update(task, { status: "실패", message: e instanceof Error ? e.message : "요청 중 오류가 발생했습니다." }); }
      }
      const done = next.filter((t) => t.status === "완료").length;
      const failed = next.filter((t) => t.status === "실패").length;
      setResult((stopRequested.current ? "현재 항목까지 처리하고 중지했습니다. " : "웜업 처리를 마쳤습니다. ") + "완료 " + done + "건 / 실패 " + failed + "건");
    } catch (e) { setError(e instanceof Error ? e.message : "웜업을 시작하지 못했습니다."); }
    finally { setBusy(false); }
  };
  const finished = tasks.filter((t) => t.status === "완료" || t.status === "실패").length;
  return (
    <PageContainer><Card>
      <Title>상품 캐시 관리</Title>
      <p><Link href="/admin/product-import">제품 엑셀 통합 업로드</Link></p>
      <Desc>상품 정보와 이미지를 최신 상태로 갱신합니다. 초기화 후 웜업을 실행하면 최신 데이터를 미리 불러올 수 있습니다.</Desc>
      <h2>캐시 초기화</h2>
      <Desc>선택한 종류의 캐시를 모든 제품 분류에서 초기화합니다. 상품 목록과 관련 이미지·상세 정보도 함께 갱신됩니다.</Desc>
      <ButtonRow>
        {(["all", "sheets", "drive"] as const).map((target) => <SecondaryButton key={target} disabled={busy} onClick={() => clear(target)}>{targetName(target)} 초기화</SecondaryButton>)}
      </ButtonRow>
      <h2>최신 데이터로 웜업</h2>
      <Desc>먼저 관련 캐시를 초기화한 뒤 분류별로 새 데이터를 읽습니다. 실패한 항목은 따로 다시 실행할 수 있습니다.</Desc>
      <CategoryLabel>웜업할 제품 분류<select value={category} disabled={busy} onChange={(e) => setCategory(e.target.value)}><option>전체</option>{PRODUCT_CATEGORIES.map((name) => <option key={name}>{name}</option>)}</select></CategoryLabel>
      <ButtonRow>
        {(["all", "sheets", "drive"] as const).map((target) => <PrimaryButton key={target} disabled={busy} onClick={() => run(target)}>{targetName(target)} 초기화 후 웜업</PrimaryButton>)}
      </ButtonRow>
      {tasks.length > 0 && <>
        <ProgressLabel aria-live="polite">{finished} / {tasks.length}건 처리{busy ? " 중" : ""}</ProgressLabel>
        <Progress value={finished} max={tasks.length} aria-label="웜업 진행률" />
        <TaskList aria-label="분류별 웜업 결과">{tasks.map((task) => <li key={task.category + task.target}>
          <span>{task.category} · {targetName(task.target)}</span><b data-status={task.status}>{task.status}</b>{task.message && <small>{task.message}</small>}
        </li>)}</TaskList>
        <ButtonRow>{busy ? <SecondaryButton onClick={() => { stopRequested.current = true; setResult("현재 항목 완료 후 중지합니다."); }}>현재 항목 후 중지</SecondaryButton> : tasks.some((t) => t.status === "실패" || t.status === "대기") && <SecondaryButton onClick={() => run("all", true)}>실패·대기 항목 다시 실행</SecondaryButton>}</ButtonRow>
      </>}
      {result && <ResultText role="status">{result}</ResultText>}
      {error && <ErrorText role="alert">{error}</ErrorText>}
    </Card></PageContainer>
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

const CategoryLabel = styled.label`display: flex; align-items: center; flex-wrap: wrap; gap: 12px; margin: 16px 0; font-size: 14px; select { padding: 9px 12px; border: 1px solid #ccc; border-radius: 8px; }`;
const ProgressLabel = styled.p`font-size: 14px; margin: 20px 0 8px;`;
const Progress = styled.progress`width: 100%; height: 10px; accent-color: #a50034;`;
const TaskList = styled.ul`list-style: none; padding: 0; margin: 16px 0; max-height: 340px; overflow-y: auto; li { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; padding: 12px 0; border-bottom: 1px solid #eee; font-size: 14px; } small { width: 100%; color: #c33; line-height: 1.6; } b { font-size: 12px; color: #777; } b[data-status="실패"] { color: #c33; } b[data-status="완료"] { color: #0a7b34; } b[data-status="진행 중"] { color: #a50034; }`;

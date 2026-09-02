"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";
import styled from "styled-components";
import { app, db } from "@/lib/firebase";
import { serviceAreas as fallbackServiceAreas, type ServiceArea } from "@/data/serviceAreas";

type SheetRow = unknown[];
type ColumnKey = keyof ServiceArea;

const FIELD_LABELS: Record<ColumnKey, string[]> = {
  manager: ["담당", "담당지역", "담당본부"],
  office: ["사무소", "사무소명"],
  phone: ["사무소전화", "전화", "전화번호", "사무소전화번호"],
  area: ["관할구역", "관할지역", "담당구역"],
};

const normalizeHeader = (value: unknown) =>
  String(value ?? "").replace(/[\s·\-_]/g, "").toLowerCase();

const normalizePhone = (value: unknown) => {
  const text = String(value ?? "").trim();
  if (typeof value !== "number" || !/^\d+$/.test(text)) return text;
  const digits = text.startsWith("0") ? text : `0${text}`;
  if (digits.startsWith("02") && digits.length === 10) return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  if (digits.length === 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  if (digits.length === 11) return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  return digits;
};

const formatDate = (value?: Timestamp) => {
  if (!value?.toDate) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(value.toDate());
};

const parseWorkbookRows = (rows: SheetRow[]): ServiceArea[] => {
  const columns = {} as Record<ColumnKey, { index: number; row: number }>;
  const keys = Object.keys(FIELD_LABELS) as ColumnKey[];

  rows.slice(0, 12).forEach((row, rowIndex) => {
    row.forEach((cell, columnIndex) => {
      const normalized = normalizeHeader(cell);
      keys.forEach((key) => {
        if (!columns[key] && FIELD_LABELS[key].some((label) => normalizeHeader(label) === normalized)) {
          columns[key] = { index: columnIndex, row: rowIndex };
        }
      });
    });
  });

  const missing = keys.filter((key) => !columns[key]);
  if (missing.length) {
    throw new Error(`필수 열을 찾을 수 없습니다: ${missing.map((key) => FIELD_LABELS[key][0]).join(", ")}`);
  }

  const firstDataRow = Math.max(...keys.map((key) => columns[key].row)) + 1;
  let previousManager = "";

  return rows.slice(firstDataRow).flatMap((row) => {
    const manager = String(row[columns.manager.index] ?? "").trim() || previousManager;
    const office = String(row[columns.office.index] ?? "").trim();
    const phone = normalizePhone(row[columns.phone.index]);
    const area = String(row[columns.area.index] ?? "").trim();
    if (manager) previousManager = manager;
    if (!office && !phone && !area) return [];
    return [{ manager, office, phone, area }];
  });
};

export default function ServiceAreasAdminPage() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [areas, setAreas] = useState<ServiceArea[]>([]);
  const [savedAreas, setSavedAreas] = useState<ServiceArea[]>([]);
  const [sourceFile, setSourceFile] = useState("");
  const [savedSourceFile, setSavedSourceFile] = useState("");
  const [updatedAt, setUpdatedAt] = useState("-");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const filteredAreas = useMemo(() => {
    const keyword = query.trim().replace(/\s/g, "").toLowerCase();
    if (!keyword) return areas.map((item, index) => ({ item, index }));
    return areas
      .map((item, index) => ({ item, index }))
      .filter(({ item }) => `${item.manager}${item.office}${item.phone}${item.area}`.replace(/\s/g, "").toLowerCase().includes(keyword));
  }, [areas, query]);

  const hasChanges = JSON.stringify(areas) !== JSON.stringify(savedAreas) || sourceFile !== savedSourceFile;

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      const snapshot = await getDoc(doc(db, "serviceAreas", "current"));
      if (!snapshot.exists()) {
        setAreas(fallbackServiceAreas);
        setSavedAreas(fallbackServiceAreas);
        setSourceFile("초기 등록 데이터");
        setSavedSourceFile("초기 등록 데이터");
        return;
      }
      const data = snapshot.data() as { areas?: ServiceArea[]; sourceFile?: string; updatedAt?: Timestamp };
      const nextAreas = Array.isArray(data.areas) ? data.areas : [];
      setAreas(nextAreas);
      setSavedAreas(nextAreas);
      setSourceFile(data.sourceFile || "직접 입력");
      setSavedSourceFile(data.sourceFile || "직접 입력");
      setUpdatedAt(formatDate(data.updatedAt));
    } catch (err) {
      console.error("관할지역 관리 데이터 로딩 오류:", err);
      setError("저장된 관할지역 데이터를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setParsing(true);
      setError("");
      setMessage("");
      const { readSheet } = await import("read-excel-file/browser");
      const rows = (await readSheet(file)) as SheetRow[];
      const parsed = parseWorkbookRows(rows);
      if (!parsed.length) throw new Error("등록할 데이터 행이 없습니다.");
      setAreas(parsed);
      setSourceFile(file.name);
      setQuery("");
      setMessage(`${parsed.length}개 행을 읽었습니다. 내용을 확인한 후 저장해 주세요.`);
    } catch (err) {
      console.error("관할지역 엑셀 파싱 오류:", err);
      setError(err instanceof Error ? err.message : "엑셀 파일을 읽지 못했습니다.");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const updateArea = (index: number, key: ColumnKey, value: string) => {
    setAreas((previous) => previous.map((item, itemIndex) => itemIndex === index ? { ...item, [key]: value } : item));
  };

  const addRow = () => {
    setAreas((previous) => [...previous, { manager: "", office: "", phone: "", area: "" }]);
    setQuery("");
  };

  const removeRow = (index: number) => setAreas((previous) => previous.filter((_, itemIndex) => itemIndex !== index));

  const handleSave = async () => {
    const invalidRow = areas.findIndex((item) => !item.manager.trim() || !item.office.trim() || !item.phone.trim() || !item.area.trim());
    if (invalidRow >= 0) {
      setError(`${invalidRow + 1}번째 행에 비어 있는 항목이 있습니다.`);
      return;
    }
    if (!areas.length && !window.confirm("목록을 비운 상태로 저장하시겠습니까? 공개 화면에도 목록이 표시되지 않습니다.")) return;
    try {
      setSaving(true);
      setError("");
      setMessage("");
      await setDoc(doc(db, "serviceAreas", "current"), {
        areas,
        sourceFile: sourceFile || "직접 입력",
        rowCount: areas.length,
        updatedAt: serverTimestamp(),
        updatedBy: getAuth(app).currentUser?.email || "admin",
      });
      setSavedAreas(areas);
      setSavedSourceFile(sourceFile || "직접 입력");
      setUpdatedAt(new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium", timeStyle: "short" }).format(new Date()));
      setMessage("저장되었습니다. 고객 화면에 즉시 반영됩니다.");
    } catch (err) {
      console.error("관할지역 데이터 저장 오류:", err);
      setError("저장하지 못했습니다. 관리자 권한과 네트워크 상태를 확인해 주세요.");
    } finally {
      setSaving(false);
    }
  };

  const downloadExcel = () => {
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const csv = [
      ["담당", "사무소", "사무소전화", "관할구역"],
      ...areas.map((item) => [item.manager, item.office, item.phone, item.area]),
    ].map((row) => row.map(escapeCell).join(",")).join("\r\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `관할지역_${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Page>
      <PageHeader>
        <div><h1>관할지역 관리</h1><p>엑셀 목록을 등록하고 고객혜택의 관할지역찾기 화면을 관리합니다.</p></div>
        <HeaderActions>
          <OutlineButton onClick={downloadExcel} disabled={!areas.length}>현재 목록 CSV</OutlineButton>
          <SaveButton onClick={handleSave} disabled={saving || !hasChanges}>{saving ? "저장 중..." : "변경사항 저장"}</SaveButton>
        </HeaderActions>
      </PageHeader>

      <SummaryGrid>
        <SummaryCard><span>등록된 사무소</span><b>{areas.length}<small>개</small></b></SummaryCard>
        <SummaryCard><span>원본 파일</span><strong title={sourceFile}>{sourceFile || "-"}</strong></SummaryCard>
        <SummaryCard><span>최근 저장</span><strong>{updatedAt}</strong></SummaryCard>
      </SummaryGrid>

      <UploadPanel>
        <UploadCopy><IconBox>↑</IconBox><div><h2>엑셀 파일 업로드</h2><p>.xlsx 파일의 첫 번째 시트를 읽습니다.</p></div></UploadCopy>
        <UploadButton as="label" $disabled={parsing}>
          {parsing ? "파일 분석 중..." : "엑셀 선택"}
          <input ref={fileInputRef} type="file" accept=".xlsx" onChange={handleFile} disabled={parsing} />
        </UploadButton>
        <FormatHint><b>필수 열</b><span>담당</span><span>사무소</span><span>사무소전화</span><span>관할구역</span></FormatHint>
      </UploadPanel>

      {message && <Message>{message}</Message>}
      {error && <ErrorMessage>{error}</ErrorMessage>}

      <ListPanel>
        <ListHeader>
          <div><h2>관할지역 목록</h2><p>셀을 직접 수정하거나 행을 추가·삭제할 수 있습니다.</p></div>
          <ListActions>
            <SearchInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="지역 또는 사무소 검색" />
            <OutlineButton onClick={addRow}>행 추가</OutlineButton>
            <DangerButton onClick={() => { if (window.confirm("모든 행을 목록에서 제거하시겠습니까? 저장 전에는 되돌릴 수 있습니다.")) setAreas([]); }}>전체 비우기</DangerButton>
          </ListActions>
        </ListHeader>

        {loading ? <StateBox>데이터를 불러오는 중입니다...</StateBox> : filteredAreas.length ? (
          <TableWrap>
            <Table>
              <thead><tr><th>No.</th><th>담당</th><th>사무소</th><th>사무소전화</th><th>관할구역</th><th>관리</th></tr></thead>
              <tbody>
                {filteredAreas.map(({ item, index }) => (
                  <tr key={`${index}-${item.office}`}>
                    <td>{index + 1}</td>
                    <td><CellInput value={item.manager} onChange={(event) => updateArea(index, "manager", event.target.value)} /></td>
                    <td><CellInput value={item.office} onChange={(event) => updateArea(index, "office", event.target.value)} /></td>
                    <td><CellInput value={item.phone} onChange={(event) => updateArea(index, "phone", event.target.value)} /></td>
                    <td><AreaTextarea value={item.area} onChange={(event) => updateArea(index, "area", event.target.value)} /></td>
                    <td><RowDeleteButton onClick={() => removeRow(index)}>삭제</RowDeleteButton></td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </TableWrap>
        ) : <StateBox>{query ? "검색 결과가 없습니다." : "등록된 관할지역이 없습니다."}</StateBox>}
      </ListPanel>

      <BottomBar $visible={hasChanges}>
        <span>저장하지 않은 변경사항이 있습니다.</span>
        <button onClick={() => { setAreas(savedAreas); setSourceFile(savedSourceFile); setQuery(""); }}>변경 취소</button>
        <SaveButton onClick={handleSave} disabled={saving}>{saving ? "저장 중..." : "저장하고 반영"}</SaveButton>
      </BottomBar>
    </Page>
  );
}

const Page = styled.div`min-height:100vh;background:#f6f7f9;padding:42px 44px 110px;color:#202124;`;
const PageHeader = styled.div`display:flex;justify-content:space-between;align-items:flex-end;gap:24px;margin-bottom:28px;h1{font-size:30px;letter-spacing:-1px}p{margin-top:8px;color:#777;font-size:14px}`;
const HeaderActions = styled.div`display:flex;gap:9px;flex:none`;
const buttonBase = `height:42px;padding:0 17px;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;transition:.2s;&:disabled{opacity:.45;cursor:default}`;
const OutlineButton = styled.button`${buttonBase};border:1px solid #d8d8d8;background:#fff;color:#444;&:hover:not(:disabled){border-color:#999}`;
const SaveButton = styled.button`${buttonBase};background:#1f2329;color:#fff;&:hover:not(:disabled){background:#a50034}`;
const DangerButton = styled.button`${buttonBase};border:1px solid #ecd8de;color:#a50034;background:#fff8fa;`;
const SummaryGrid = styled.div`display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:16px;`;
const SummaryCard = styled.div`min-width:0;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:20px 22px;span{display:block;color:#888;font-size:12px;margin-bottom:10px}b{font-size:27px}small{font-size:13px;margin-left:3px;font-weight:500}strong{display:block;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}`;
const UploadPanel = styled.div`position:relative;display:flex;align-items:center;gap:18px;background:#fff;border:1px solid #e0e2e6;border-radius:16px;padding:23px 25px;margin-bottom:18px;`;
const UploadCopy = styled.div`display:flex;align-items:center;gap:14px;min-width:290px;h2{font-size:16px;margin-bottom:5px}p{font-size:12px;color:#888}`;
const IconBox = styled.span`width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:#f6edf0;color:#a50034;font-size:21px;font-weight:300;`;
const UploadButton = styled.button<{ $disabled?: boolean }>`height:42px;padding:0 18px;border-radius:9px;background:#a50034;color:#fff;font-weight:600;font-size:13px;display:flex;align-items:center;cursor:${({$disabled})=>$disabled?"default":"pointer"};opacity:${({$disabled})=>$disabled?.55:1};input{display:none}`;
const FormatHint = styled.div`display:flex;align-items:center;gap:7px;margin-left:auto;font-size:11px;color:#888;b{margin-right:3px}span{padding:6px 9px;border-radius:6px;background:#f3f4f6;color:#666}`;
const Message = styled.div`padding:13px 16px;margin-bottom:14px;border:1px solid #cfe5d5;background:#f1faf4;color:#28703b;border-radius:10px;font-size:13px;`;
const ErrorMessage = styled(Message)`border-color:#efccd5;background:#fff3f6;color:#a50034;`;
const ListPanel = styled.div`background:#fff;border:1px solid #e0e2e6;border-radius:16px;overflow:hidden;`;
const ListHeader = styled.div`display:flex;align-items:center;justify-content:space-between;gap:20px;padding:23px 25px;border-bottom:1px solid #eceef1;h2{font-size:18px}p{margin-top:5px;color:#888;font-size:12px}`;
const ListActions = styled.div`display:flex;gap:8px;`;
const SearchInput = styled.input`width:220px;height:42px;border:1px solid #ddd;border-radius:9px;padding:0 13px;font-size:13px;&:focus{border-color:#888}`;
const TableWrap = styled.div`overflow:auto;max-height:650px;`;
const Table = styled.table`width:100%;min-width:980px;border-collapse:collapse;table-layout:fixed;thead{position:sticky;top:0;z-index:2}th{height:43px;background:#f8f9fa;color:#666;font-size:12px;text-align:left;border-bottom:1px solid #e5e7eb;padding:0 9px}th:nth-child(1){width:55px;text-align:center}th:nth-child(2){width:105px}th:nth-child(3){width:130px}th:nth-child(4){width:155px}th:nth-child(6){width:65px;text-align:center}td{padding:8px;border-bottom:1px solid #eef0f2;vertical-align:middle;font-size:12px}td:first-child{text-align:center;color:#999}tbody tr:hover{background:#fbfbfc}`;
const CellInput = styled.input`width:100%;height:38px;border:1px solid transparent;border-radius:7px;padding:0 8px;font-size:13px;background:transparent;&:hover{border-color:#ddd;background:#fff}&:focus{border-color:#a50034;background:#fff}`;
const AreaTextarea = styled.textarea`width:100%;min-height:52px;resize:vertical;border:1px solid transparent;border-radius:7px;padding:8px;font-size:12px;line-height:1.5;background:transparent;&:hover{border-color:#ddd;background:#fff}&:focus{border-color:#a50034;background:#fff}`;
const RowDeleteButton = styled.button`display:block;margin:auto;color:#b24661;font-size:12px;cursor:pointer;padding:7px;`;
const StateBox = styled.div`padding:70px;text-align:center;color:#999;font-size:14px;`;
const BottomBar = styled.div<{ $visible: boolean }>`position:fixed;left:240px;right:0;bottom:${({$visible})=>$visible?"0":"-90px"};height:76px;padding:0 44px;background:rgba(255,255,255,.96);border-top:1px solid #ddd;box-shadow:0 -8px 30px rgba(0,0,0,.06);display:flex;align-items:center;justify-content:flex-end;gap:10px;z-index:20;transition:.25s;span{margin-right:auto;font-size:13px;color:#a50034}button:not(:last-child){padding:10px 14px;color:#777;cursor:pointer;font-size:13px}`;

/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  popupDisplayLocationLabels,
  type PopupDisplayLocation,
  type PopupItem,
} from "@/types/popup";
import {
  comparePopupsByPriority,
  formatPopupDate,
  getPopupPriority,
} from "@/lib/popups";

export default function AdminPopupListPage() {
  const router = useRouter();
  const [popups, setPopups] = useState<PopupItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const fetchPopups = async () => {
      try {
        setLoading(true);
        setError(null);
        const popupQuery = query(
          collection(db, "popups"),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(popupQuery);
        if (cancelled) return;
        setPopups(
          snap.docs
            .map((docSnap) => ({
              id: docSnap.id,
              ...(docSnap.data() as any),
            }))
            .sort(comparePopupsByPriority),
        );
      } catch (err) {
        console.error("popup list load error:", err);
        if (!cancelled) {
          setError("팝업 목록을 불러오는 중 오류가 발생했습니다.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPopups();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Page>
      <HeaderRow>
        <div>
          <Title>팝업 관리</Title>
          <SubTitle>관리자/매니저 페이지에 노출할 팝업을 관리합니다.</SubTitle>
        </div>
        <PrimaryButton type="button" onClick={() => router.push("/admin/popups/new")}>
          팝업 등록
        </PrimaryButton>
      </HeaderRow>

      {loading && <InfoText>팝업 목록을 불러오는 중입니다...</InfoText>}
      {error && <ErrorText>{error}</ErrorText>}
      {!loading && !error && popups.length === 0 && (
        <InfoText>등록된 팝업이 없습니다.</InfoText>
      )}

      {!loading && !error && popups.length > 0 && (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <th>우선순위</th>
                <th>팝업 제목</th>
                <th>게시 상태</th>
                <th>게시 시작일</th>
                <th>게시 종료일</th>
                <th>노출 위치</th>
                <th>등록일</th>
                <th>관리</th>
              </tr>
            </thead>
            <tbody>
              {popups.map((popup) => (
                <tr key={popup.id}>
                  <td>{getPopupPriority(popup)}</td>
                  <td>
                    <TitleCell>{popup.title || "(제목 없음)"}</TitleCell>
                  </td>
                  <td>
                    <StatusBadge $active={popup.status === "active"}>
                      {popup.status === "active" ? "게시중" : "게시중지"}
                    </StatusBadge>
                  </td>
                  <td>{formatPopupDate(popup.startDate)}</td>
                  <td>{formatPopupDate(popup.endDate)}</td>
                  <td>
                    <LocationList>
                      {(popup.displayLocations ?? []).map(
                        (location: PopupDisplayLocation) => (
                          <span key={location}>
                            {popupDisplayLocationLabels[location] ?? location}
                          </span>
                        ),
                      )}
                    </LocationList>
                  </td>
                  <td>{formatPopupDate(popup.createdAt ?? null)}</td>
                  <td>
                    <SmallButton
                      type="button"
                      onClick={() => router.push(`/admin/popups/${popup.id}/edit`)}
                    >
                      수정
                    </SmallButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </Page>
  );
}

const Page = styled.div`
  padding: 25px;
  min-height: calc(100vh - 93px);
  background: #f8fafc;
`;

const HeaderRow = styled.div`
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
  flex-wrap: wrap;
`;

const Title = styled.h1`
  font-size: 22px;
  font-weight: 800;
  color: #111827;
`;

const SubTitle = styled.p`
  margin-top: 5px;
  font-size: 13px;
  color: #64748b;
`;

const PrimaryButton = styled.button`
  height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  background: #111827;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
`;

const InfoText = styled.div`
  font-size: 13px;
  color: #64748b;
`;

const ErrorText = styled.div`
  font-size: 13px;
  color: #dc2626;
`;

const TableWrap = styled.div`
  overflow-x: auto;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
`;

const Table = styled.table`
  width: 100%;
  min-width: 980px;
  border-collapse: collapse;
  font-size: 13px;

  th,
  td {
    padding: 12px 14px;
    border-bottom: 1px solid #eef2f7;
    text-align: left;
    vertical-align: middle;
  }

  th {
    background: #f9fafb;
    color: #475569;
    font-size: 12px;
    font-weight: 800;
  }

  tr:last-child td {
    border-bottom: none;
  }
`;

const TitleCell = styled.div`
  max-width: 260px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #111827;
  font-weight: 700;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 68px;
  height: 26px;
  border-radius: 999px;
  background: ${(p) => (p.$active ? "#eff6ff" : "#f3f4f6")};
  color: ${(p) => (p.$active ? "#1d4ed8" : "#6b7280")};
  font-size: 12px;
  font-weight: 800;
`;

const LocationList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 5px;

  span {
    border-radius: 999px;
    background: #f1f5f9;
    color: #334155;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 700;
  }
`;

const SmallButton = styled.button`
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
`;

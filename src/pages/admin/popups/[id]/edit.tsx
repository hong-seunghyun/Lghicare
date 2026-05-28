/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";
import { doc, getDoc, serverTimestamp, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import PopupForm, { type PopupFormValues } from "@/components/Popups/PopupForm";
import type { PopupItem } from "@/types/popup";
import { dateInputToTimestamp, toDateInputValue } from "@/lib/popups";
import {
  deletePopupStorageFile,
  uploadPopupMainImage,
} from "@/lib/popupStorage";

export default function AdminPopupEditPage() {
  const router = useRouter();
  const popupId = typeof router.query.id === "string" ? router.query.id : "";
  const [popup, setPopup] = useState<PopupItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!router.isReady || !popupId) return;
    let cancelled = false;

    const fetchPopup = async () => {
      try {
        setLoading(true);
        setError(null);
        const snap = await getDoc(doc(db, "popups", popupId));
        if (cancelled) return;
        if (!snap.exists()) {
          setError("해당 팝업을 찾을 수 없습니다.");
          setPopup(null);
          return;
        }
        setPopup({
          id: snap.id,
          ...(snap.data() as any),
        });
      } catch (err) {
        console.error("popup load error:", err);
        if (!cancelled) setError("팝업 데이터를 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    fetchPopup();
    return () => {
      cancelled = true;
    };
  }, [popupId, router.isReady]);

  const handleSubmit = async (values: PopupFormValues) => {
    if (!popup) return;

    try {
      setSaving(true);
      setError(null);

      let imageUrl = popup.imageUrl ?? null;
      let imageStoragePath = popup.imageStoragePath ?? null;

      if (values.imageFile) {
        const uploaded = await uploadPopupMainImage(popup.id, values.imageFile);
        imageUrl = uploaded.imageUrl;
        imageStoragePath = uploaded.imageStoragePath;
      }

      await updateDoc(doc(db, "popups", popup.id), {
        title: values.title,
        contentHtml: values.contentHtml,
        imageUrl,
        imageStoragePath,
        status: values.status,
        priority: values.priority,
        startDate: dateInputToTimestamp(values.startDate),
        endDate: dateInputToTimestamp(values.endDate, true),
        displayLocations: values.displayLocations,
        updatedAt: serverTimestamp(),
      });

      if (values.imageFile) {
        await deletePopupStorageFile(popup.imageStoragePath);
      }

      router.replace("/admin/popups");
    } catch (err) {
      console.error("popup update error:", err);
      setError("팝업을 수정하는 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Page>
        <InfoText>팝업 데이터를 불러오는 중입니다...</InfoText>
      </Page>
    );
  }

  if (!popup) {
    return (
      <Page>
        <ErrorText>{error ?? "팝업을 찾을 수 없습니다."}</ErrorText>
      </Page>
    );
  }

  return (
    <Page>
      <HeaderRow>
        <div>
          <Title>팝업 수정</Title>
          <SubTitle>이미지 변경 시 새 URL로 교체하고 기존 Storage 파일은 삭제합니다.</SubTitle>
        </div>
      </HeaderRow>
      {error && <ErrorText>{error}</ErrorText>}
      <PopupForm
        popupId={popup.id}
        submitLabel="수정 완료"
        saving={saving}
        initialValues={{
          title: popup.title,
          contentHtml: popup.contentHtml,
          imageUrl: popup.imageUrl,
          status: popup.status,
          priority: popup.priority,
          startDate: toDateInputValue(popup.startDate),
          endDate: toDateInputValue(popup.endDate),
          displayLocations: popup.displayLocations,
        }}
        onSubmit={handleSubmit}
        onCancel={() => router.push("/admin/popups")}
      />
    </Page>
  );
}

const Page = styled.div`
  padding: 25px;
  min-height: calc(100vh - 93px);
  background: #f8fafc;
`;

const HeaderRow = styled.div`
  margin-bottom: 18px;
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

const InfoText = styled.div`
  font-size: 13px;
  color: #64748b;
`;

const ErrorText = styled.div`
  margin-bottom: 12px;
  font-size: 13px;
  color: #dc2626;
`;

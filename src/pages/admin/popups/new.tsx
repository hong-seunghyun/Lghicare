"use client";

import React, { useMemo, useState } from "react";
import styled from "styled-components";
import { useRouter } from "next/router";
import { collection, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import PopupForm, { type PopupFormValues } from "@/components/Popups/PopupForm";
import { dateInputToTimestamp } from "@/lib/popups";
import { uploadPopupMainImage } from "@/lib/popupStorage";

export default function AdminPopupCreatePage() {
  const router = useRouter();
  const popupId = useMemo(() => doc(collection(db, "popups")).id, []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (values: PopupFormValues) => {
    try {
      setSaving(true);
      setError(null);

      const uploaded = values.imageFile
        ? await uploadPopupMainImage(popupId, values.imageFile)
        : { imageUrl: null, imageStoragePath: null };

      await setDoc(doc(db, "popups", popupId), {
        title: values.title,
        contentHtml: values.contentHtml,
        imageUrl: uploaded.imageUrl,
        imageStoragePath: uploaded.imageStoragePath,
        status: values.status,
        priority: values.priority,
        startDate: dateInputToTimestamp(values.startDate),
        endDate: dateInputToTimestamp(values.endDate, true),
        displayLocations: values.displayLocations,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      router.replace("/admin/popups");
    } catch (err) {
      console.error("popup create error:", err);
      setError("팝업을 저장하는 중 오류가 발생했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <HeaderRow>
        <div>
          <Title>팝업 등록</Title>
          <SubTitle>이미지 단독 또는 이미지와 텍스트 조합으로 등록할 수 있습니다.</SubTitle>
        </div>
      </HeaderRow>
      {error && <ErrorText>{error}</ErrorText>}
      <PopupForm
        popupId={popupId}
        submitLabel="등록"
        saving={saving}
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

const ErrorText = styled.div`
  margin-bottom: 12px;
  font-size: 13px;
  color: #dc2626;
`;

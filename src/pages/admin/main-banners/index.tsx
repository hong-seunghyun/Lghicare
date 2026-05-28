"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled, { css } from "styled-components";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from "firebase/storage";
import { app, db } from "@/lib/firebase";
import type { MainBanner, MainBannerStatus } from "@/types/mainPage";

type BannerFormState = {
  title: string;
  status: MainBannerStatus;
  priority: string;
  linkUrl: string;
  pcImageFile: File | null;
  mobileImageFile: File | null;
  pcImageUrl: string;
  mobileImageUrl: string;
  pcImageStoragePath: string;
  mobileImageStoragePath: string;
};

const emptyForm: BannerFormState = {
  title: "",
  status: "active",
  priority: "1",
  linkUrl: "",
  pcImageFile: null,
  mobileImageFile: null,
  pcImageUrl: "",
  mobileImageUrl: "",
  pcImageStoragePath: "",
  mobileImageStoragePath: "",
};

const sanitizeFileName = (fileName: string) =>
  fileName.replace(/[^\w.-]+/g, "_").slice(-120);

export default function MainBannerAdminPage() {
  const [banners, setBanners] = useState<MainBanner[]>([]);
  const [form, setForm] = useState<BannerFormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sortedBanners = useMemo(
    () => [...banners].sort((a, b) => a.priority - b.priority),
    [banners],
  );

  const loadBanners = async () => {
    try {
      setLoading(true);
      setError(null);
      const bannerQuery = query(
        collection(db, "mainBanners"),
        orderBy("priority", "asc"),
      );
      const snap = await getDocs(bannerQuery);
      setBanners(
        snap.docs.map((docSnap) => ({
          id: docSnap.id,
          ...(docSnap.data() as Omit<MainBanner, "id">),
        })),
      );
    } catch (err) {
      console.error("main banner load error:", err);
      setError("배너 목록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBanners();
  }, []);

  const uploadImage = async (
    bannerId: string,
    kind: "pc" | "mobile",
    file: File | null,
  ) => {
    if (!file) return null;
    const storage = getStorage(app);
    const storagePath = `mainBanners/${bannerId}/${kind}/${Date.now()}_${sanitizeFileName(
      file.name,
    )}`;
    const storageRef = ref(storage, storagePath);
    const snapshot = await uploadBytes(storageRef, file);
    const imageUrl = await getDownloadURL(snapshot.ref);
    return { imageUrl, storagePath };
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  };

  const startEdit = (banner: MainBanner) => {
    setEditingId(banner.id);
    setForm({
      title: banner.title ?? "",
      status: banner.status,
      priority: String(banner.priority ?? 1),
      linkUrl: banner.linkUrl ?? "",
      pcImageFile: null,
      mobileImageFile: null,
      pcImageUrl: banner.pcImageUrl ?? "",
      mobileImageUrl: banner.mobileImageUrl ?? "",
      pcImageStoragePath: banner.pcImageStoragePath ?? "",
      mobileImageStoragePath: banner.mobileImageStoragePath ?? "",
    });
    setError(null);
  };

  const handleDelete = async (banner: MainBanner) => {
    if (!window.confirm("배너를 삭제하시겠습니까?")) return;
    try {
      setSaving(true);
      await deleteDoc(doc(db, "mainBanners", banner.id));
      const storage = getStorage(app);
      await Promise.all(
        [banner.pcImageStoragePath, banner.mobileImageStoragePath]
          .filter(Boolean)
          .map(async (path) => {
            try {
              await deleteObject(ref(storage, path as string));
            } catch (err) {
              console.warn("banner image delete error:", err);
            }
          }),
      );
      await loadBanners();
      if (editingId === banner.id) resetForm();
    } catch (err) {
      console.error("main banner delete error:", err);
      setError("배너 삭제에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const priority = Number(form.priority);
    if (!Number.isFinite(priority)) {
      setError("노출 순서는 숫자로 입력해 주세요.");
      return;
    }
    if (!form.pcImageFile && !form.pcImageUrl) {
      setError("PC 배너 이미지를 등록해 주세요.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      const bannerId = editingId ?? doc(collection(db, "mainBanners")).id;
      const [pcUpload, mobileUpload] = await Promise.all([
        uploadImage(bannerId, "pc", form.pcImageFile),
        uploadImage(bannerId, "mobile", form.mobileImageFile),
      ]);

      const payload = {
        title: form.title.trim(),
        status: form.status,
        priority,
        linkUrl: form.linkUrl.trim(),
        pcImageUrl: pcUpload?.imageUrl ?? form.pcImageUrl,
        pcImageStoragePath:
          pcUpload?.storagePath ?? form.pcImageStoragePath ?? "",
        mobileImageUrl: mobileUpload?.imageUrl ?? form.mobileImageUrl,
        mobileImageStoragePath:
          mobileUpload?.storagePath ?? form.mobileImageStoragePath ?? "",
        updatedAt: serverTimestamp(),
        ...(editingId ? {} : { createdAt: serverTimestamp() }),
      };

      await setDoc(doc(db, "mainBanners", bannerId), payload, { merge: true });
      await loadBanners();
      resetForm();
    } catch (err) {
      console.error("main banner save error:", err);
      setError("배너 저장에 실패했습니다.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <HeaderRow>
        <div>
          <Title>메인 배너 관리</Title>
          <SubTitle>
            활성화된 배너만 메인에 노출되며, 노출 순서가 낮을수록 먼저 표시됩니다.
          </SubTitle>
        </div>
        {editingId && (
          <SecondaryButton type="button" onClick={resetForm}>
            신규 등록으로 전환
          </SecondaryButton>
        )}
      </HeaderRow>

      <LayoutGrid>
        <Form onSubmit={handleSubmit}>
          <SectionTitle>{editingId ? "배너 수정" : "배너 등록"}</SectionTitle>
          <Field>
            <Label htmlFor="banner-title">관리용 제목</Label>
            <Input
              id="banner-title"
              value={form.title}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="예: 5월 메인 프로모션"
            />
          </Field>
          <FieldGrid>
            <Field>
              <Label htmlFor="banner-priority">노출 순서</Label>
              <Input
                id="banner-priority"
                type="number"
                min="1"
                value={form.priority}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, priority: event.target.value }))
                }
              />
            </Field>
            <Field>
              <Label>활성화 여부</Label>
              <SwitchButton
                type="button"
                $active={form.status === "active"}
                onClick={() =>
                  setForm((prev) => ({
                    ...prev,
                    status: prev.status === "active" ? "inactive" : "active",
                  }))
                }
              >
                {form.status === "active" ? "활성화" : "비활성화"}
              </SwitchButton>
            </Field>
          </FieldGrid>
          <Field>
            <Label htmlFor="banner-link">클릭 링크 URL</Label>
            <Input
              id="banner-link"
              value={form.linkUrl}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, linkUrl: event.target.value }))
              }
              placeholder="/products/정수기 또는 https://..."
            />
          </Field>
          <FieldGrid>
            <Field>
              <Label>PC 이미지</Label>
              <FileLabel>
                이미지 선택
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      pcImageFile: event.target.files?.[0] ?? null,
                    }))
                  }
                />
              </FileLabel>
              {(form.pcImageFile || form.pcImageUrl) && (
                <PreviewImage
                  src={
                    form.pcImageFile
                      ? URL.createObjectURL(form.pcImageFile)
                      : form.pcImageUrl
                  }
                  alt="PC 배너 미리보기"
                />
              )}
            </Field>
            <Field>
              <Label>모바일 이미지</Label>
              <FileLabel>
                이미지 선택
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      mobileImageFile: event.target.files?.[0] ?? null,
                    }))
                  }
                />
              </FileLabel>
              {(form.mobileImageFile || form.mobileImageUrl) && (
                <PreviewImage
                  src={
                    form.mobileImageFile
                      ? URL.createObjectURL(form.mobileImageFile)
                      : form.mobileImageUrl
                  }
                  alt="모바일 배너 미리보기"
                />
              )}
              <Hint>모바일 이미지가 없으면 PC 이미지가 사용됩니다.</Hint>
            </Field>
          </FieldGrid>

          {error && <ErrorText>{error}</ErrorText>}
          <ButtonRow>
            <PrimaryButton type="submit" disabled={saving}>
              {saving ? "저장 중..." : editingId ? "수정 저장" : "배너 등록"}
            </PrimaryButton>
          </ButtonRow>
        </Form>

        <ListPanel>
          <SectionTitle>배너 리스트</SectionTitle>
          {loading && <InfoText>배너 목록을 불러오는 중입니다...</InfoText>}
          {!loading && sortedBanners.length === 0 && (
            <InfoText>등록된 배너가 없습니다.</InfoText>
          )}
          {!loading && sortedBanners.length > 0 && (
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <th>순서</th>
                    <th>이미지</th>
                    <th>제목</th>
                    <th>상태</th>
                    <th>관리</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedBanners.map((banner) => (
                    <tr key={banner.id}>
                      <td>{banner.priority}</td>
                      <td>
                        {banner.pcImageUrl ? (
                          <Thumb src={banner.pcImageUrl} alt="" />
                        ) : (
                          "-"
                        )}
                      </td>
                      <td>
                        <TitleCell>{banner.title || "(제목 없음)"}</TitleCell>
                        {banner.linkUrl && <LinkCell>{banner.linkUrl}</LinkCell>}
                      </td>
                      <td>
                        <StatusBadge $active={banner.status === "active"}>
                          {banner.status === "active" ? "활성" : "비활성"}
                        </StatusBadge>
                      </td>
                      <td>
                        <ActionRow>
                          <SmallButton type="button" onClick={() => startEdit(banner)}>
                            수정
                          </SmallButton>
                          <DangerButton
                            type="button"
                            disabled={saving}
                            onClick={() => handleDelete(banner)}
                          >
                            삭제
                          </DangerButton>
                        </ActionRow>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          )}
        </ListPanel>
      </LayoutGrid>
    </Page>
  );
}

const Page = styled.div`
  min-height: calc(100vh - 93px);
  padding: 25px;
  background: #f8fafc;
`;

const HeaderRow = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
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

const LayoutGrid = styled.div`
  display: grid;
  grid-template-columns: minmax(360px, 440px) minmax(0, 1fr);
  gap: 18px;

  @media (max-width: 1100px) {
    grid-template-columns: 1fr;
  }
`;

const panelStyle = css`
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  padding: 20px;
`;

const Form = styled.form`
  ${panelStyle}
  display: flex;
  flex-direction: column;
  gap: 14px;
`;

const ListPanel = styled.div`
  ${panelStyle}
`;

const SectionTitle = styled.h2`
  font-size: 15px;
  font-weight: 800;
  color: #111827;
`;

const FieldGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;

  @media (max-width: 720px) {
    grid-template-columns: 1fr;
  }
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;
`;

const Label = styled.label`
  font-size: 12px;
  font-weight: 700;
  color: #4b5563;
`;

const Input = styled.input`
  height: 40px;
  border: 1px solid #d1d5db;
  border-radius: 8px;
  padding: 0 12px;
  font-size: 13px;
  color: #111827;
  background: #fff;
`;

const SwitchButton = styled.button<{ $active: boolean }>`
  width: 116px;
  height: 40px;
  border-radius: 999px;
  border: 1px solid ${(p) => (p.$active ? "#2563eb" : "#d1d5db")};
  background: ${(p) => (p.$active ? "#eff6ff" : "#f9fafb")};
  color: ${(p) => (p.$active ? "#1d4ed8" : "#6b7280")};
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;
`;

const FileLabel = styled.label`
  height: 36px;
  padding: 0 12px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  input {
    display: none;
  }
`;

const PreviewImage = styled.img`
  width: 100%;
  max-height: 160px;
  object-fit: contain;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  background: #f9fafb;
`;

const Hint = styled.span`
  font-size: 12px;
  color: #64748b;
`;

const ErrorText = styled.div`
  font-size: 13px;
  color: #dc2626;
`;

const InfoText = styled.div`
  margin-top: 10px;
  font-size: 13px;
  color: #64748b;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const buttonStyle = css`
  height: 38px;
  padding: 0 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 800;
  cursor: pointer;

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
`;

const PrimaryButton = styled.button`
  ${buttonStyle}
  background: #111827;
  color: #fff;
`;

const SecondaryButton = styled.button`
  ${buttonStyle}
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
`;

const TableWrap = styled.div`
  margin-top: 12px;
  overflow-x: auto;
`;

const Table = styled.table`
  width: 100%;
  min-width: 760px;
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
`;

const Thumb = styled.img`
  width: 96px;
  height: 46px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
`;

const TitleCell = styled.div`
  max-width: 280px;
  font-weight: 800;
  color: #111827;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const LinkCell = styled.div`
  max-width: 280px;
  margin-top: 3px;
  color: #64748b;
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const StatusBadge = styled.span<{ $active: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 58px;
  height: 26px;
  border-radius: 999px;
  background: ${(p) => (p.$active ? "#eff6ff" : "#f3f4f6")};
  color: ${(p) => (p.$active ? "#1d4ed8" : "#6b7280")};
  font-size: 12px;
  font-weight: 800;
`;

const ActionRow = styled.div`
  display: flex;
  gap: 6px;
`;

const SmallButton = styled.button`
  height: 30px;
  padding: 0 10px;
  border-radius: 7px;
  border: 1px solid #d1d5db;
  background: #fff;
  color: #111827;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;
`;

const DangerButton = styled(SmallButton)`
  color: #dc2626;
`;

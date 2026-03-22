/* eslint-disable @typescript-eslint/no-explicit-any */
// pages/manager/password.tsx
"use client";

import React, { useEffect, useState } from "react";
import styled from "styled-components";
import { db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const ManagerPasswordPage: React.FC = () => {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMessage(null);
    setError(null);
  }, [currentPassword, newPassword, confirmPassword]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newPassword || !confirmPassword) {
      setError("새 비밀번호를 입력해 주세요.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setMessage(null);

      const auth = getAuth();
      const currentUser = auth.currentUser;
      if (!currentUser) {
        setError("로그인이 필요합니다.");
        return;
      }

      const userRef = doc(db, "users", currentUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        setError("사용자 정보를 찾을 수 없습니다.");
        return;
      }

      const userData = userSnap.data() as any;
      const savedPassword = userData.password as string | undefined;
      if (savedPassword && currentPassword && savedPassword !== currentPassword) {
        setError("현재 비밀번호가 일치하지 않습니다.");
        return;
      }

      await updateDoc(userRef, {
        password: newPassword.trim(),
        updatedAt: serverTimestamp(),
      });

      setMessage("비밀번호가 변경되었습니다.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err) {
      console.error("비밀번호 변경 오류:", err);
      setError("비밀번호 변경 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <Title>비밀번호 변경</Title>
      <Card>
        <Form onSubmit={handleSubmit}>
          <Field>
            <Label>현재 비밀번호</Label>
            <Input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="현재 비밀번호를 입력해 주세요"
            />
          </Field>
          <Field>
            <Label>새 비밀번호 (생년월일 6자리)</Label>
            <Input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="예: 900101"
            />
          </Field>
          <Field>
            <Label>새 비밀번호 확인</Label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="새 비밀번호를 다시 입력해 주세요"
            />
          </Field>

          {error && <ErrorText>{error}</ErrorText>}
          {message && <SuccessText>{message}</SuccessText>}

          <ButtonRow>
            <PrimaryButton type="submit" disabled={loading}>
              {loading ? "변경 중..." : "비밀번호 변경"}
            </PrimaryButton>
          </ButtonRow>
        </Form>
      </Card>
    </PageWrapper>
  );
};

export default ManagerPasswordPage;

const PageWrapper = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Title = styled.h1`
  font-size: 20px;
  font-weight: 700;
`;

const Card = styled.div`
  background: #fff;
  border-radius: 12px;
  padding: 18px 20px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.04);
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Field = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.div`
  font-size: 13px;
  font-weight: 500;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 10px;
  border-radius: 6px;
  border: 1px solid #ddd;
  font-size: 13px;
`;

const ErrorText = styled.div`
  font-size: 12px;
  color: #e74c3c;
`;

const SuccessText = styled.div`
  font-size: 12px;
  color: #0b9150;
`;

const ButtonRow = styled.div`
  display: flex;
  justify-content: flex-end;
`;

const PrimaryButton = styled.button`
  padding: 8px 14px;
  border-radius: 6px;
  border: none;
  background: #333;
  color: #fff;
  font-size: 13px;
  cursor: pointer;

  &:hover {
    background: #111;
  }

  &:disabled {
    background: #aaa;
    cursor: default;
  }
`;


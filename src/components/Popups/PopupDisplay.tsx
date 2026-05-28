/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import React, { useEffect, useMemo, useState } from "react";
import styled from "styled-components";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { PopupDisplayLocation, PopupItem } from "@/types/popup";
import {
  comparePopupsByPriority,
  getLocalDateKey,
  getPopupHiddenStorageKey,
  isPopupWithinPeriod,
  sanitizePopupHtml,
} from "@/lib/popups";

type PopupDisplayProps = {
  location: PopupDisplayLocation;
};

export default function PopupDisplay({ location }: PopupDisplayProps) {
  const [popups, setPopups] = useState<PopupItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const fetchPopups = async () => {
      try {
        const popupQuery = query(
          collection(db, "popups"),
          where("status", "==", "active"),
          where("displayLocations", "array-contains", location),
        );
        const snap = await getDocs(popupQuery);
        if (cancelled) return;

        const todayKey = getLocalDateKey();
        const now = new Date();
        const visiblePopups = snap.docs
          .map((docSnap) => ({
            id: docSnap.id,
            ...(docSnap.data() as any),
          }))
          .filter((popup: PopupItem) => {
            if (!isPopupWithinPeriod(popup, now)) return false;
            if (typeof window === "undefined") return true;
            return (
              localStorage.getItem(getPopupHiddenStorageKey(popup.id)) !==
              todayKey
            );
          })
          .sort(comparePopupsByPriority);

        setPopups(visiblePopups);
      } catch (err) {
        console.error("popup load error:", err);
        if (!cancelled) setPopups([]);
      }
    };

    fetchPopups();
    return () => {
      cancelled = true;
    };
  }, [location]);

  const closePopup = (popupId: string) => {
    setPopups((prev) => prev.filter((popup) => popup.id !== popupId));
  };

  const hideToday = (popupId: string) => {
    try {
      localStorage.setItem(getPopupHiddenStorageKey(popupId), getLocalDateKey());
    } catch (err) {
      console.warn("popup hide storage error:", err);
    }
    closePopup(popupId);
  };

  if (popups.length === 0) return null;

  return (
    <>
      {popups.map((popup, index) => (
        <PopupCard
          key={popup.id}
          popup={popup}
          index={index}
          onClose={() => closePopup(popup.id)}
          onHideToday={() => hideToday(popup.id)}
        />
      ))}
    </>
  );
}

type PopupCardProps = {
  popup: PopupItem;
  index: number;
  onClose: () => void;
  onHideToday: () => void;
};

function PopupCard({ popup, index, onClose, onHideToday }: PopupCardProps) {
  const safeHtml = useMemo(
    () => sanitizePopupHtml(popup.contentHtml ?? ""),
    [popup.contentHtml],
  );

  return (
    <Modal
      role="dialog"
      aria-modal="false"
      aria-label={popup.title || "팝업"}
      $index={index}
    >
      <ModalBody>
        {popup.imageUrl && (
          <ImageWrap>
            <PopupImage src={popup.imageUrl} alt={popup.title} loading="eager" />
          </ImageWrap>
        )}
        {safeHtml && (
          <HtmlContent dangerouslySetInnerHTML={{ __html: safeHtml }} />
        )}
      </ModalBody>
      <ButtonRow>
        <SecondaryButton type="button" onClick={onClose}>
          닫기
        </SecondaryButton>
        <PrimaryButton type="button" onClick={onHideToday}>
          오늘 하루 보지 않기
        </PrimaryButton>
      </ButtonRow>
    </Modal>
  );
}

const Modal = styled.div<{ $index: number }>`
  position: fixed;
  top: calc(32px + ${(p) => p.$index * 24}px);
  right: calc(32px + ${(p) => p.$index * 24}px);
  z-index: ${(p) => 3000 - p.$index};
  width: 420px;
  max-width: calc(100vw - 64px);
  max-height: min(594px, calc(100vh - 64px));
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.18);
  border: 1px solid rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  overflow: hidden;

  @media (max-width: 520px) {
    top: calc(16px + ${(p) => p.$index * 12}px);
    left: calc(16px + ${(p) => p.$index * 8}px);
    right: calc(16px + ${(p) => p.$index * 8}px);
    width: auto;
    max-width: none;
    max-height: calc(100vh - 32px);
  }
`;

const ModalBody = styled.div`
  min-height: 0;
  flex: 0 1 auto;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  scrollbar-width: thin;
  scrollbar-color: #cbd5e1 transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
  }

  &::-webkit-scrollbar-thumb {
    background: #cbd5e1;
    border-radius: 999px;
  }

  &::-webkit-scrollbar-thumb:hover {
    background: #94a3b8;
  }
`;

const ImageWrap = styled.div`
  display: flex;
  justify-content: center;
  align-items: flex-start;
  width: 100%;
`;

const PopupImage = styled.img`
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: 520px;
  object-fit: contain;
  border-radius: 10px;
  background: #f9fafb;
`;

const HtmlContent = styled.div`
  color: #111827;
  font-size: 14px;
  line-height: 1.7;

  img {
    max-width: 100%;
    max-height: 520px;
    height: auto;
    object-fit: contain;
  }

  a {
    color: #2563eb;
    text-decoration: underline;
  }

  ul,
  ol {
    list-style-position: inside;
  }
`;

const ButtonRow = styled.div`
  flex: 0 0 auto;
  padding: 12px 14px;
  border-top: 1px solid #e5e7eb;
  background: #fff;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
`;

const SecondaryButton = styled.button`
  height: 42px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #d1d5db;
  background: #f9fafb;
  color: #374151;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
`;

const PrimaryButton = styled.button`
  height: 42px;
  padding: 0 10px;
  border-radius: 8px;
  border: 1px solid #111827;
  background: #111827;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
`;

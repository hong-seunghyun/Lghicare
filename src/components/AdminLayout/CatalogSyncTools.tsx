import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { adminCatalogRequest } from "@/lib/admin/catalogClient";
import { PRODUCT_CATEGORIES } from "@/lib/catalog/types";
import type { SheetMirrorJob } from "@/lib/catalog/sheetMirror";
import styles from "./productImport.module.css";

type Task = SheetMirrorJob;
export default function CatalogSyncTools({
  generation,
  published,
  local,
}: {
  generation: string;
  published: boolean;
  local: boolean;
}) {
  const [category, setCategory] = useState("정수기"),
    [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const [sheets, setSheets] = useState<SheetMirrorJob[]>([]);
  const [progress, setProgress] = useState<Task | null>(null);
  const stop = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      stop.current = true;
    };
  }, []);
  const reload = useCallback(async () => {
    const data = await adminCatalogRequest<{ jobs: SheetMirrorJob[] }>(
      "/api/admin/product-import/sheets",
    );
    if (mounted.current) {
      setSheets(data.jobs);
    }
  }, []);
  useEffect(() => {
    void reload().catch(() =>
      setError("동기화 내역을 불러오지 못했습니다. 새로 확인해 주세요."),
    );
  }, [reload]);
  const run = async (resume?: Task) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    stop.current = false;
    try {
      let current =
        resume ??
        (
          await adminCatalogRequest<{ job: Task }>(
            "/api/admin/product-import/sheets",
            { action: "start", category, generation },
          )
        ).job;
      if (mounted.current) setProgress(current);
      while (current.state !== "complete" && !stop.current) {
        current = (
          await adminCatalogRequest<{ job: Task }>(
            "/api/admin/product-import/sheets",
            { action: "step", id: current.id },
          )
        ).job;
        if (mounted.current) setProgress(current);
      }
      if (mounted.current)
        setMessage(
          current.state === "complete"
            ? `${current.category} Google 시트 동기화를 완료했습니다.`
            : "현재 항목까지 처리했습니다. 아래 내역에서 이어서 실행할 수 있습니다.",
        );
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "동기화를 완료하지 못했습니다.",
        );
    } finally {
      await reload().catch(() => {});
      if (mounted.current) setBusy(false);
    }
  };
  const history = [...sheets]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12);
  return (
    <>
      <section className={styles.card}>
        <div className={styles.cardTitle}>
          <h2>제품 이미지 수동 등록</h2>
        </div>
        <p>
          제품 이미지는 기존 Google Drive 폴더에 직접 업로드해 주세요. 분류·모델
          폴더명과 파일 순서는 기존 규칙을 유지합니다.
        </p>
        <p className={styles.help}>
          사진을 추가하거나 교체한 뒤 <Link href="/admin/cache">캐시 관리</Link>
          에서 해당 분류의 ‘이미지 초기화 후 웜업’을 실행하면 최신 사진을 미리
          불러옵니다.
        </p>
      </section>
      <section className={styles.card}>
        <div className={styles.cardTitle}>
          <h2>Google 시트에 사본 보관</h2>
          <button
            disabled={busy}
            onClick={() =>
              void reload().catch(() => setError("내역을 불러오지 못했습니다."))
            }
          >
            내역 새로 확인
          </button>
        </div>
        <p>
          필요한 경우에만 사이트에 반영된 상품을 기존 Google 시트에 입력합니다.
          현재 등록된 상품을 확인하거나 이미지를 올릴 때는 실행하지 않아도
          됩니다.
        </p>
        <div className={styles.uploadRow}>
          <label>
            제품 분류{" "}
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              disabled={busy}
            >
              {PRODUCT_CATEGORIES.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || !published || local}
            onClick={() => void run()}
          >
            현재 상품을 Google 시트에 입력
          </button>
        </div>
        <p className={styles.help}>
          상품 버전을 반영한 뒤 사용할 수 있습니다. Google 시트 동기화가
          실패해도 사이트는 등록된 상품 버전으로 계속 서비스합니다.
        </p>
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
        {message && (
          <p className={styles.notice} role="status">
            {message}
          </p>
        )}
        {busy && (
          <div className={styles.progress} role="status">
            <div>
              <b>{progress?.category ?? category} 처리 중</b>
              <p>
                {progress
                  ? `${progress.offset} / ${progress.total}`
                  : "원본을 확인하고 있습니다."}
              </p>
            </div>
            <button
              onClick={() => {
                stop.current = true;
              }}
            >
              현재 항목 후 중지
            </button>
          </div>
        )}
        <div className={styles.history}>
          {history.map((task) => (
            <div key={task.id} className={styles.syncTask}>
              <div>
                <b>{task.category} · Google 시트</b>
                <p className={styles.help}>
                  {task.state === "complete"
                    ? "완료"
                    : task.state === "failed"
                      ? "확인 필요"
                      : "준비 중"}{" "}
                  · {task.offset}/{task.total}
                  {task.error ? ` · ${task.error}` : ""}
                </p>
              </div>
              {task.state !== "complete" && (
                <button disabled={busy || local} onClick={() => void run(task)}>
                  이어서 실행
                </button>
              )}
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useUser } from "@/contexts/UserContext";
import { adminCatalogRequest } from "@/lib/admin/catalogClient";
import type {
  CatalogPointer,
  ImportJob,
  ImportSelection,
} from "@/lib/catalog/types";
import styles from "@/components/AdminLayout/productImport.module.css";
import CatalogSyncTools from "@/components/AdminLayout/CatalogSyncTools";
import CatalogChangeReview from "@/components/AdminLayout/CatalogChangeReview";

const label = {
  products: "상품·구독 조건",
  disclaimers: "디스클레이머",
  vouchers: "상품권",
};
const stateLabel: Record<ImportJob["state"], string> = {
  uploaded: "업로드 완료",
  analyzing: "분석 중",
  analyzed: "검토 대기",
  preparing: "파일 준비 중",
  ready: "반영 대기",
  published: "반영 완료",
  failed: "확인 필요",
};
const emptySelection: ImportSelection = {
  products: true,
  disclaimers: true,
  vouchers: true,
  categories: [],
  mode: "merge",
};
type Response = { ok: boolean; job: ImportJob };
const date = (value: string) =>
  new Date(value).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });

export default function ProductImportPage() {
  const { user } = useUser();
  const [jobs, setJobs] = useState<ImportJob[]>([]),
    [job, setJob] = useState<ImportJob | null>(null);
  const [pointer, setPointer] = useState<CatalogPointer>({
    id: null,
    generation: "legacy",
  });
  const [localMode, setLocalMode] = useState(true);
  const [file, setFile] = useState<File | null>(null),
    [selection, setSelection] = useState<ImportSelection>(emptySelection);
  const [busy, setBusy] = useState(false),
    [phase, setPhase] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [acknowledged, setAcknowledged] = useState(false),
    [rollbackAcknowledged, setRollbackAcknowledged] = useState(false);
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
    const data = await adminCatalogRequest<{
      jobs: ImportJob[];
      pointer: CatalogPointer;
      mode: string;
    }>("/api/admin/product-import");
    if (mounted.current) {
      setJobs(data.jobs);
      setPointer(data.pointer);
      setLocalMode(data.mode !== "production");
    }
  }, []);
  useEffect(() => {
    if (user?.role === "admin")
      void reload().catch((error) => setError(error.message));
  }, [user?.uid, user?.role, reload]);
  const adopt = (next: ImportJob) => {
    setJob(next);
    setAcknowledged(false);
    setError("");
    setNotice("");
    setSelection(
      next.preview?.selection ?? {
        ...emptySelection,
        products: !next.analysis?.issueCounts.products.errors,
        disclaimers: !next.analysis?.issueCounts.disclaimers.errors,
        vouchers: !next.analysis?.issueCounts.vouchers.errors,
        categories:
          next.analysis?.statistics.categories.map(
            (category) => category.name,
          ) ?? [],
      },
    );
  };
  const call = async (
    id: string,
    action: string,
    extra: Record<string, unknown> = {},
  ) => {
    const data = await adminCatalogRequest<Response>(
      `/api/admin/product-import/${id}`,
      { action, ...extra },
    );
    if (mounted.current) setJob(data.job);
    return data.job;
  };
  const work = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    stop.current = false;
    try {
      await action();
      await reload();
    } catch (error) {
      if (mounted.current)
        setError(
          error instanceof Error
            ? error.message
            : "처리를 완료하지 못했습니다.",
        );
    } finally {
      if (mounted.current) {
        setBusy(false);
        setPhase("");
      }
    }
  };
  const upload = () =>
    work(async () => {
      if (!file || !/\.xlsx$/i.test(file.name) || file.size > 25 * 1024 * 1024)
        throw new Error("25MB 이하의 .xlsx 원본 파일을 선택해 주세요.");
      setPhase("파일을 업로드하고 있습니다.");
      const uploaded = await adminCatalogRequest<Response>(
        "/api/admin/product-import",
        undefined,
        file,
      );
      setJob(uploaded.job);
      setPhase(
        "엑셀을 분석하고 있습니다. 창을 닫아도 최근 업로드에서 결과를 확인할 수 있습니다.",
      );
      adopt(await call(uploaded.job.id, "analyze"));
    });
  const prepare = (resume = false) =>
    work(async () => {
      if (!job) return;
      setPhase("운영 데이터와 비교하고 있습니다.");
      let current = resume ? job : await call(job.id, "prepare", { selection });
      setAcknowledged(false);
      while (current.state !== "ready" && !stop.current) {
        setPhase(current.phase ?? "운영 파일을 준비하고 있습니다.");
        current = await call(current.id, "step");
      }
      if (stop.current)
        setNotice(
          "현재 항목까지 준비했습니다. ‘파일 준비 계속’으로 이어서 처리할 수 있습니다.",
        );
    });
  const publish = () =>
    work(async () => {
      if (!job || !acknowledged) return;
      setPhase("파일을 검증하고 새 상품 버전을 반영하고 있습니다.");
      const published = await call(job.id, "publish", { acknowledged: true });
      setNotice(
        published.warmup?.failed.length
          ? `반영은 완료했습니다. ${published.warmup.failed.join(", ")}의 사전 조회를 완료하지 못해 다음 조회 시 다시 불러옵니다.`
          : "반영과 변경 항목의 사전 조회를 완료했습니다. 새 조회는 15초 이내에 새 버전을 사용합니다. 시트와 Drive 원본은 유지됩니다.",
      );
    });
  const analysis = job?.analysis;
  const sameSelection =
    JSON.stringify(job?.preview?.selection) === JSON.stringify(selection);
  const ready = job?.state === "ready" && sameSelection;
  const selectedError =
    analysis &&
    (Object.keys(label) as Array<keyof typeof label>).some(
      (section) =>
        selection[section] && analysis.issueCounts[section].errors > 0,
    );
  const selectedAny =
    selection.products || selection.disclaimers || selection.vouchers;
  return (
    <main className={styles.page}>
      <header className={styles.heading}>
        <div>
          <p className={styles.eyebrow}>상품 관리</p>
          <h1>제품 엑셀 통합 업로드</h1>
          <p>
            원본 파일 하나로 상품, 디스클레이머, 상품권을 확인하고 반영합니다.
          </p>
        </div>
        <Link href="/admin/cache">캐시 관리</Link>
      </header>
      <div className={styles.active}>
        <span className={styles.dot} />
        <b>
          {pointer.id
            ? "등록된 상품 버전 사용 중"
            : "기존 시트·Drive 연결 사용 중"}
        </b>
        <span>
          {pointer.id
            ? `버전 ${pointer.id.slice(0, 8)}`
            : "첫 반영 전까지 기존 조회를 유지합니다."}
        </span>
      </div>
      {localMode && (
        <p className={styles.notice}>
          로컬 검증 모드입니다. 업로드와 상품 버전은 이 컴퓨터에 저장하며, 운영
          상품 데이터·Google 시트·Drive 이미지는 수정하지 않습니다.
        </p>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
          <p>
            최근 업로드를 다시 선택하면 서버에 저장된 처리 상태를 확인할 수
            있습니다.
          </p>
        </div>
      )}
      {notice && (
        <div className={styles.notice} role="status">
          {notice}
        </div>
      )}
      {busy && (
        <div className={styles.progress} role="status" aria-live="polite">
          <span className={styles.spinner} />
          <div>
            <b>처리 중</b>
            <p>{phase || job?.phase}</p>
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
      <section className={styles.card} aria-labelledby="upload-heading">
        <div className={styles.cardTitle}>
          <h2 id="upload-heading">1. 원본 파일 업로드</h2>
          <span>.xlsx · 최대 25MB</span>
        </div>
        <p>
          받은 엑셀을 그대로 선택해 주세요. 카테고리별로 나누거나 JSON을 따로
          만들 필요가 없습니다.
        </p>
        <div className={styles.uploadRow}>
          <input
            type="file"
            accept=".xlsx"
            aria-label="제품등록 엑셀 원본"
            disabled={busy}
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <button
            className={styles.primary}
            disabled={!file || busy}
            onClick={() => void upload()}
          >
            업로드하고 분석
          </button>
        </div>
        <p className={styles.help}>
          카드할인·구독교원·등록순서 시트는 반영 대상에서 제외합니다. 제품
          이미지는 기존처럼 Drive에 수동 등록하고 캐시 관리에서 갱신합니다.
        </p>
      </section>
      {job && (
        <section className={styles.card} aria-labelledby="review-heading">
          <div className={styles.cardTitle}>
            <h2 id="review-heading">2. 분석 결과 확인</h2>
            <span className={styles.tag}>{stateLabel[job.state]}</span>
          </div>
          <p className={styles.fileName}>
            {job.fileName} <span>{date(job.createdAt)}</span>
          </p>
          {job.error && (
            <p className={styles.error} role="alert">
              {job.error}
            </p>
          )}
          {!analysis && (
            <button
              disabled={busy}
              onClick={() =>
                void work(async () => {
                  setPhase("엑셀을 분석하고 있습니다.");
                  adopt(await call(job.id, "analyze"));
                })
              }
            >
              분석 시작 / 다시 확인
            </button>
          )}
          {analysis && (
            <>
              <div className={styles.stats}>
                <div>
                  <b>{analysis.statistics.productModels.toLocaleString()}</b>
                  <span>제품 모델</span>
                </div>
                <div>
                  <b>{analysis.statistics.productRows.toLocaleString()}</b>
                  <span>구독 조건</span>
                </div>
                <div>
                  <b>{analysis.statistics.disclaimers}</b>
                  <span>디스클레이머</span>
                </div>
                <div>
                  <b>{analysis.statistics.vouchers}</b>
                  <span>상품권 모델</span>
                </div>
              </div>
              <fieldset
                className={styles.sections}
                disabled={busy || job.state === "published"}
              >
                <legend>반영할 항목</legend>
                {(Object.keys(label) as Array<keyof typeof label>).map(
                  (section) => (
                    <label key={section}>
                      <input
                        type="checkbox"
                        checked={selection[section]}
                        onChange={(event) => {
                          setSelection((current) => ({
                            ...current,
                            [section]: event.target.checked,
                          }));
                          setAcknowledged(false);
                        }}
                      />
                      <b>{label[section]}</b>
                      <span
                        className={
                          analysis.issueCounts[section].errors
                            ? styles.invalid
                            : styles.muted
                        }
                      >
                        오류 {analysis.issueCounts[section].errors} · 확인{" "}
                        {analysis.issueCounts[section].warnings}
                      </span>
                    </label>
                  ),
                )}
              </fieldset>
              {analysis.issues.length > 0 && (
                <details
                  className={styles.issues}
                  open={analysis.issues.some(
                    (issue) => issue.level === "error",
                  )}
                >
                  <summary>
                    누락·중복·기간 확인 내역{" "}
                    {Object.values(analysis.issueCounts).reduce(
                      (sum, value) => sum + value.errors + value.warnings,
                      0,
                    )}
                    건
                  </summary>
                  <div className={styles.tableWrap}>
                    <table>
                      <thead>
                        <tr>
                          <th>구분</th>
                          <th>원본 위치</th>
                          <th>모델</th>
                          <th>내용</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.issues.map((issue, index) => (
                          <tr key={index}>
                            <td
                              className={
                                issue.level === "error"
                                  ? styles.invalid
                                  : styles.muted
                              }
                            >
                              {issue.level === "error" ? "오류" : "확인"}
                            </td>
                            <td>
                              {issue.sheet}
                              {issue.row ? ` ${issue.row}행` : ""}
                            </td>
                            <td>{issue.model || "—"}</td>
                            <td>{issue.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={styles.help}>
                    최대 400건을 표시합니다. 오류가 있는 항목은 원본 수정 후
                    다시 업로드하거나, 해당 반영 항목을 선택 해제해 주세요.
                  </p>
                </details>
              )}
              <fieldset
                className={styles.categories}
                disabled={
                  busy || job.state === "published" || !selection.products
                }
              >
                <legend>상품 분류</legend>
                {analysis.statistics.categories.map((category) => (
                  <label key={category.name}>
                    <input
                      type="checkbox"
                      checked={selection.categories.includes(category.name)}
                      onChange={(event) =>
                        setSelection((current) => ({
                          ...current,
                          categories: event.target.checked
                            ? [...current.categories, category.name]
                            : current.categories.filter(
                                (name) => name !== category.name,
                              ),
                        }))
                      }
                    />
                    {category.name}
                    <small>{category.models}개</small>
                  </label>
                ))}
              </fieldset>
              <fieldset
                className={styles.mode}
                disabled={busy || job.state === "published"}
              >
                <legend>기존 데이터 처리</legend>
                <label>
                  <input
                    type="radio"
                    name="import-mode"
                    checked={selection.mode === "merge"}
                    onChange={() =>
                      setSelection((current) => ({ ...current, mode: "merge" }))
                    }
                  />
                  <div>
                    <b>추가·수정</b>
                    <p>
                      파일에 있는 모델의 조건을 갱신하고, 없는 모델은
                      유지합니다.
                    </p>
                  </div>
                </label>
                <label>
                  <input
                    type="radio"
                    name="import-mode"
                    checked={selection.mode === "replace"}
                    onChange={() =>
                      setSelection((current) => ({
                        ...current,
                        mode: "replace",
                      }))
                    }
                  />
                  <div>
                    <b>전체 교체</b>
                    <p>
                      선택한 분류·항목을 이번 파일 기준으로 바꿉니다. 빠지는
                      모델은 다음 단계에 표시됩니다.
                    </p>
                  </div>
                </label>
              </fieldset>
              {job.state !== "published" && (
                <div className={styles.actions}>
                  <button
                    className={styles.primary}
                    disabled={
                      busy ||
                      !selectedAny ||
                      Boolean(selectedError) ||
                      (selection.products && !selection.categories.length)
                    }
                    onClick={() => void prepare()}
                  >
                    변경 내역 확인
                  </button>
                  {job.prepared && job.state !== "ready" && sameSelection && (
                    <button disabled={busy} onClick={() => void prepare(true)}>
                      파일 준비 계속
                    </button>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      )}
      {job?.preview && (
        <section className={styles.card} aria-labelledby="publish-heading">
          <div className={styles.cardTitle}>
            <h2 id="publish-heading">3. 변경 내역 검토·반영</h2>
            <span>{job.phase}</span>
          </div>
          {!sameSelection && (
            <p className={styles.error}>
              선택이 바뀌었습니다. 변경 내역을 다시 확인해 주세요.
            </p>
          )}
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>반영 항목</th>
                  <th>추가</th>
                  <th>변경</th>
                  <th>유지</th>
                  <th>제외</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(job.preview.differences).map(([name, diff]) => (
                  <tr key={name}>
                    <th>{name}</th>
                    <td>{diff.added}</td>
                    <td className={styles.accent}>{diff.changed}</td>
                    <td>{diff.unchanged}</td>
                    <td className={diff.removed ? styles.invalid : undefined}>
                      {diff.removed}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {job.preview.warnings.map((warning, index) => (
            <p className={styles.help} key={index}>
              {warning}
            </p>
          ))}
          {job.preview.changes && (
            <CatalogChangeReview key={job.prepared?.sha256} job={job} />
          )}
          {job.state !== "published" && (
            <>
              <label className={styles.acknowledge}>
                <input
                  type="checkbox"
                  checked={acknowledged}
                  disabled={!ready || busy}
                  onChange={(event) => setAcknowledged(event.target.checked)}
                />
                변경·제외되는 모델과 상품권 금액·적용 기간을 확인했습니다.
              </label>
              <div className={styles.publishRow}>
                <p>모든 운영 파일의 검증이 끝나면 새 버전으로 전환합니다.</p>
                <button
                  className={styles.primary}
                  disabled={!ready || busy || !acknowledged}
                  onClick={() => void publish()}
                >
                  선택한 내용 반영
                </button>
              </div>
            </>
          )}
        </section>
      )}
      <section className={styles.card}>
        <div className={styles.cardTitle}>
          <h2>최근 업로드</h2>
          <button disabled={busy} onClick={() => void work(reload)}>
            새로 확인
          </button>
        </div>
        {jobs.length ? (
          <div className={styles.history}>
            {jobs.map((item) => (
              <button
                key={item.id}
                disabled={busy}
                aria-pressed={job?.id === item.id}
                onClick={() => adopt(item)}
              >
                <div>
                  <b>{item.fileName}</b>
                  <span>{date(item.createdAt)}</span>
                </div>
                <span className={styles.tag}>{stateLabel[item.state]}</span>
              </button>
            ))}
          </div>
        ) : (
          <p>아직 업로드 내역이 없습니다.</p>
        )}
      </section>
      {pointer.id && pointer.previousId !== undefined && (
        <details className={styles.card}>
          <summary>이전 상품 버전으로 되돌리기</summary>
          <p className={styles.help}>
            현재 버전 {pointer.id.slice(0, 8)}에서{" "}
            {pointer.previousId
              ? `이전 버전 ${pointer.previousId.slice(0, 8)}`
              : "기존 시트·Drive 조회 방식"}
            으로 전환합니다. 원본 파일과 업로드 내역은 보존됩니다.
          </p>
          <label className={styles.acknowledge}>
            <input
              type="checkbox"
              checked={rollbackAcknowledged}
              onChange={(event) =>
                setRollbackAcknowledged(event.target.checked)
              }
              disabled={busy}
            />
            상품·상품권·디스클레이머가 이전 상태로 바뀌는 것을 확인했습니다.
          </label>
          <button
            disabled={busy || !rollbackAcknowledged}
            onClick={() =>
              void work(async () => {
                await adminCatalogRequest(
                  "/api/admin/product-import/rollback",
                  {
                    generation: pointer.generation,
                    target: pointer.previousId,
                  },
                );
                setRollbackAcknowledged(false);
                setNotice("이전 상품 버전으로 전환했습니다.");
              })
            }
          >
            이전 버전으로 전환
          </button>
        </details>
      )}
      <CatalogSyncTools
        generation={pointer.generation}
        published={Boolean(pointer.id)}
        local={localMode}
      />
    </main>
  );
}

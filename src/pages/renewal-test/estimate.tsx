/* eslint-disable @next/next/no-img-element */
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import TestLayout, { Icon, Modal } from "@/components/renewal-test/TestLayout";
import {
  BenefitDialog,
  CardDialog,
  CompareDialog,
  OptionWizard,
  PrintPreview,
  ProductPicker,
  SaveDialog,
} from "@/components/renewal-test/QuoteDialogs";
import {
  CardBenefit,
  TeacherSelection,
  ownerStorageKey,
  canUseRenewalEstimate,
  DRAFT_KEY,
  PreviewLine,
  PreviewQuote,
  SAVED_KEY,
  createLine,
  lowestVariant,
  individualizeQuote,
  emptyQuote,
  isPreviewQuote,
  koreaDate,
  money,
  quoteTotals,
  validUntil,
  VARIANT_FIELDS,
  textValue,
} from "@/lib/renewalTest";
import s from "@/components/renewal-test/renewal.module.css";
import { useUser } from "@/contexts/UserContext";
import { fetchRenewalProducts } from "@/hooks/useRenewalData";
import Link from "next/link";
import QuoteRow from "@/components/renewal-test/QuoteRow";
import {
  ContractDetails,
  RateBreakdown,
} from "@/components/renewal-test/QuoteDetails";
import { getVoucherMasterForModel } from "@/lib/voucherMaster";
import { calcVoucher } from "@/utils/voucher/calcVoucher";

type Dialog =
  | "summary"
  | "products"
  | "save"
  | "cards"
  | "benefits"
  | "print"
  | "reset"
  | "load"
  | null;
export default function RenewalEstimate() {
  const { user, loading, error } = useUser();
  const router = useRouter();
  if (loading)
    return (
      <TestLayout workspace>
        <div className={s.authPanel} role="status">
          <Icon name="user" size={36} />
          <h1>로그인 정보를 확인하고 있습니다.</h1>
        </div>
      </TestLayout>
    );
  if (!canUseRenewalEstimate(user))
    return (
      <TestLayout workspace>
        <div className={s.authPanel}>
          <Icon name="user" size={40} />
          <span className={s.eyebrow}>MANAGER WORKSPACE</span>
          <h1>
            {user
              ? "견적 작성 권한을 확인해 주세요."
              : "매니저 로그인이 필요합니다."}
          </h1>
          <p>
            {error ||
              (user?.profile?.isActive === false
                ? "비활성화된 매니저 계정입니다. 관리자에게 문의해 주세요."
                : "기존 사이트와 동일한 매니저·관리자 계정으로 로그인 후 이용하실 수 있습니다.")}
          </p>
          <Link
            className={s.primary}
            href={{
              pathname: "/manager/login",
              query: {
                next: router.asPath.startsWith("/renewal-test/estimate")
                  ? router.asPath
                  : "/renewal-test/estimate",
              },
            }}
          >
            기존 계정으로 로그인
            <Icon name="arrow" size={20} />
          </Link>
          <Link className={s.secondary} href="/renewal-test">
            메인으로 돌아가기
          </Link>
        </div>
      </TestLayout>
    );
  return (
    <RenewalWorkspace
      key={user!.uid}
      uid={user!.uid}
      manager={user!.profile?.name || user!.displayName || ""}
    />
  );
}
function RenewalWorkspace({ uid, manager }: { uid: string; manager: string }) {
  const router = useRouter();
  const [quote, setQuote] = useState<PreviewQuote>(() =>
    emptyQuote(uid, manager),
  );
  const [saved, setSaved] = useState<PreviewQuote[]>([]);
  const [ready, setReady] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [option, setOption] = useState<{
    line: PreviewLine;
    editing: boolean;
  } | null>(null);
  const [comparing, setComparing] = useState<PreviewLine | null>(null);
  const [pendingLoad, setPendingLoad] = useState<PreviewQuote | null>(null);
  const [toast, setToast] = useState("");
  const [storageError, setStorageError] = useState("");
  const [savedSearch, setSavedSearch] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailLine = quote.lines.find((line) => line.id === detailId);
  const initialized = useRef(false),
    handledAdd = useRef("");
  const savedView = router.query.view === "saved";
  const totals = quoteTotals(quote.lines);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    try {
      const draftText = localStorage.getItem(ownerStorageKey(DRAFT_KEY, uid)),
        savedText = localStorage.getItem(ownerStorageKey(SAVED_KEY, uid));
      const draft: unknown = draftText ? JSON.parse(draftText) : null;
      const list: unknown = savedText ? JSON.parse(savedText) : [];
      if (isPreviewQuote(draft) && draft.ownerUid === uid)
        setQuote(individualizeQuote(draft));
      else if (draftText)
        setStorageError("이전 초안을 읽을 수 없어 빈 견적으로 시작했습니다.");
      if (Array.isArray(list))
        setSaved(
          list
            .filter(isPreviewQuote)
            .filter((q) => q.ownerUid === uid)
            .map(individualizeQuote),
        );
    } catch {
      setStorageError(
        "브라우저 저장소를 읽을 수 없습니다. 화면에서 견적을 구성하고 인쇄할 수 있지만 저장은 제한될 수 있습니다.",
      );
    }
    setReady(true);
  }, [uid]);
  useEffect(() => {
    if (!ready) return;
    try {
      localStorage.setItem(
        ownerStorageKey(DRAFT_KEY, uid),
        JSON.stringify(quote),
      );
    } catch {
      setStorageError(
        "브라우저 저장 공간이 부족하거나 저장이 차단되었습니다. 변경한 견적은 현재 화면에만 유지됩니다.",
      );
    }
  }, [quote, ready, uid]);
  useEffect(() => {
    if (
      !ready ||
      !router.isReady ||
      typeof router.query.add !== "string" ||
      handledAdd.current === router.query.add
    )
      return;
    const controller = new AbortController();
    fetchRenewalProducts(
      typeof router.query.category === "string"
        ? router.query.category
        : "전체",
      "",
      router.query.add,
      controller.signal,
    )
      .then((products) => {
        if (controller.signal.aborted) return;
        handledAdd.current = String(router.query.add);
        const product = products.find((p) => p.id === router.query.add);
        if (product)
          setOption({
            line: createLine(
              product,
              router.query.pricing === "lowest"
                ? lowestVariant(product)
                : undefined,
            ),
            editing: false,
          });
        else setToast("현재 상품 데이터에서 해당 모델을 찾을 수 없습니다.");
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setToast(
            "상품 옵션을 불러오지 못했습니다. 제품 추가에서 다시 시도해 주세요.",
          );
      });
    return () => controller.abort();
  }, [
    ready,
    router.isReady,
    router.query.add,
    router.query.category,
    router.query.pricing,
  ]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const notify = (message: string) => setToast(message);
  const optionRequest = useRef(0);
  const openCurrentOptions = async (line: PreviewLine, compare = false) => {
    const request = ++optionRequest.current;
    notify("현재 상품 조건을 확인하고 있습니다.");
    try {
      const products = await fetchRenewalProducts(
        line.product.category,
        "",
        line.product.id,
      );
      if (request !== optionRequest.current) return;
      const product = products.find((p) => p.id === line.product.id);
      if (!product) throw new Error("상품이 없습니다.");
      const variant = product.variants.find((v) =>
        VARIANT_FIELDS.every(
          (k) => textValue(v[k]) === textValue(line.selectedVariant[k]),
        ),
      );
      const refreshed = {
        ...createLine(product, variant),
        id: line.id,
        quantity: line.quantity,
        card: line.card,
        teachers: line.teachers,
        prepay: variant ? line.prepay : 0,
      };
      if (compare) setComparing(refreshed);
      else setOption({ line: refreshed, editing: true });
      setToast(
        variant
          ? "현재 상품 옵션을 불러왔습니다."
          : "이전 조건이 변경되어 현재 기본 옵션을 불러왔습니다.",
      );
    } catch {
      if (request === optionRequest.current)
        notify("현재 상품을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  };
  const updateLine = (line: PreviewLine) => {
    setQuote((q) => ({
      ...q,
      lines: q.lines.map((l) => (l.id === line.id ? line : l)),
    }));
    if (line.voucherTotal === undefined) {
      getVoucherMasterForModel(line.product.id)
        .then((master) => {
          const voucher = master
            ? calcVoucher({
                voucherMaster: master,
                modelCode: line.product.id,
                promoType: textValue(line.selectedVariant.프로모션유형),
                serviceCycle: textValue(line.selectedVariant["서비스주기/월"]),
                promoName: textValue(line.selectedVariant.프로모션명),
              })
            : { total: 0, details: [] };
          setQuote((q) => ({
            ...q,
            lines: q.lines.map((l) =>
              l.id === line.id && l.selectedVariant === line.selectedVariant
                ? {
                    ...l,
                    voucherTotal: voucher.total,
                    voucherDetails: voucher.details,
                  }
                : l,
            ),
          }));
        })
        .catch(() =>
          notify("제품 요금은 반영했지만 상품권 내역은 확인하지 못했습니다."),
        );
    }
  };
  const applyOption = (line: PreviewLine) => {
    if (option?.editing) updateLine(line);
    else setQuote((q) => ({ ...q, lines: [...q.lines, line] }));
    setOption(null);
    notify(
      option?.editing
        ? "선택한 제품의 조건을 수정했습니다."
        : "견적에 제품을 추가했습니다.",
    );
  };
  const persistSaved = (next: PreviewQuote[]) => {
    try {
      localStorage.setItem(
        ownerStorageKey(SAVED_KEY, uid),
        JSON.stringify(next),
      );
      setSaved(next);
      return true;
    } catch {
      setStorageError(
        "견적을 저장하지 못했습니다. 브라우저 저장 공간과 저장 허용 설정을 확인해 주세요.",
      );
      return false;
    }
  };
  const saveQuote = (value: PreviewQuote, asNew: boolean) => {
    const date = new Date();
    const snapshot = {
      ...value,
      id:
        asNew || !value.id
          ? `T-${koreaDate(date).replace(/-/g, "")}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`
          : value.id,
      savedAt: date.toISOString(),
    };
    const next = [snapshot, ...saved.filter((q) => q.id !== snapshot.id)];
    if (!persistSaved(next)) return;
    setQuote(snapshot);
    setDialog(null);
    notify("견적을 이 브라우저에 저장했습니다.");
  };
  const applyCard = (
    id: string,
    card?: CardBenefit,
    teachers: TeacherSelection[] = [],
  ) => {
    setQuote((q) => ({
      ...q,
      lines: q.lines.map((line) =>
        line.id === id
          ? { ...line, card, teachers: card?.allowTeacher ? teachers : [] }
          : line,
      ),
    }));
    setDialog(null);
    notify(
      card
        ? "선택한 제품에 카드혜택을 적용했습니다."
        : "선택한 제품의 카드혜택을 해제했습니다.",
    );
  };
  const loadQuote = (value: PreviewQuote) => {
    setQuote(JSON.parse(JSON.stringify(value)) as PreviewQuote);
    setDialog(null);
    setPendingLoad(null);
    void router.push("/renewal-test/estimate", undefined, { shallow: true });
    notify("저장 당시의 요금과 조건으로 불러왔습니다.");
  };
  const filteredSaved = saved.filter((q) =>
    `${q.id} ${q.title} ${q.customer}`
      .toLowerCase()
      .includes(savedSearch.toLowerCase()),
  );

  const renderSummary = () => (
    <div className={s.quoteSummary}>
      <div className={s.summaryHeader}>
        <h2>견적 합계</h2>
        <span>선택 제품 {quote.lines.length}개</span>
      </div>
      <dl className={s.summaryNumbers}>
        <div>
          <dt>기본 월 요금</dt>
          <dd>{money(totals.normal)}</dd>
        </div>
        <div>
          <dt>프로모션 할인</dt>
          <dd className={s.burgundy}>-{money(totals.discount)}</dd>
        </div>
        {totals.deposit > 0 && (
          <div>
            <dt>선납에 따른 월 납부 감소</dt>
            <dd>-{money(totals.normal - totals.discount - totals.monthly)}</dd>
          </div>
        )}
      </dl>
      <div className={s.summaryTotal}>
        <span>계약 월 구독료</span>
        <strong>{money(totals.monthly)}</strong>
        <small>카드 청구 할인 전 금액</small>
      </div>
      <div className={s.summaryCard}>
        <div>
          <h3>
            <Icon name="card" size={17} />
            제휴카드 청구 할인
          </h3>
          <button
            disabled={!quote.lines.length}
            onClick={() => setDialog("cards")}
          >
            설정
            <Icon name="chevron" size={12} />
          </button>
        </div>

        <dl>
          <div>
            <dt>예상 청구 할인</dt>
            <dd>-{money(totals.card)}</dd>
          </div>
          <div>
            <dt>구독교원 할인</dt>
            <dd>-{money(totals.teacher)}</dd>
          </div>
          <div>
            <dt>카드·교원 적용 후 월 체감액</dt>
            <dd>{money(totals.effective)}</dd>
          </div>
        </dl>
      </div>
      <dl className={s.summaryNumbers}>
        <div>
          <dt>선납금 합계</dt>
          <dd>{money(totals.deposit)}</dd>
        </div>
        <div>
          <dt>제품별 상품권 합계</dt>
          <dd>{money(totals.voucher)}</dd>
        </div>
        <div>
          <dt>
            예상 총비용 합계
            <small>선택 월 요금 × 계약 기간 · 선납 포함 · 카드·교원 제외</small>
          </dt>
          <dd>{money(totals.total)}</dd>
        </div>
      </dl>
      <div className={s.summaryTools}>
        <button
          className={s.secondary}
          disabled={!quote.lines.length}
          onClick={() => setDialog("cards")}
        >
          <Icon name="card" size={16} />
          카드혜택
        </button>
        <button
          className={s.secondary}
          disabled={!quote.lines.length}
          onClick={() => setDialog("benefits")}
        >
          <Icon name="care" size={16} />
          구독혜택
        </button>
      </div>
      <button
        className={s.primary}
        disabled={!quote.lines.length}
        onClick={() => setDialog("save")}
      >
        <Icon name="save" size={17} />
        견적 저장
      </button>
      <button
        className={s.secondary}
        disabled={!quote.lines.length}
        onClick={() => setDialog("print")}
      >
        <Icon name="print" size={17} />
        인쇄 / PDF
      </button>
      <p className={s.caption}>
        선택한 계약 조건을 기준으로 계산한 예상 금액입니다.
        <br />
        카드 실적·기간 조건은 해당 카드 상품 기준입니다.
      </p>
    </div>
  );
  return (
    <TestLayout workspace>
      <div className={s.workspace}>
        <div className={s.container}>
          <div className={s.workspaceHeading}>
            <div>
              <h1>{savedView ? "저장한 견적" : "견적 작성"}</h1>
            </div>
            <div className={s.workspaceActions}>
              {savedView ? (
                <button
                  className={s.primary}
                  onClick={() => {
                    if (quote.lines.length) setDialog("reset");
                    else {
                      setQuote(emptyQuote(uid, manager));
                      void router.push("/renewal-test/estimate");
                    }
                  }}
                >
                  <Icon name="plus" size={17} />새 견적
                </button>
              ) : (
                <>
                  <button
                    className={s.secondary}
                    onClick={() =>
                      void router.push(
                        "/renewal-test/estimate?view=saved",
                        undefined,
                        { shallow: true },
                      )
                    }
                  >
                    <Icon name="clock" size={16} />
                    저장한 견적{" "}
                    {saved.length > 0 && <span>{saved.length}</span>}
                  </button>
                  <button
                    className={s.secondary}
                    disabled={!quote.lines.length}
                    onClick={() => setDialog("print")}
                  >
                    <Icon name="print" size={16} />
                    인쇄 / PDF
                  </button>
                  <button
                    className={s.primary}
                    disabled={!quote.lines.length}
                    onClick={() => setDialog("save")}
                  >
                    <Icon name="save" size={16} />
                    견적 저장
                  </button>
                </>
              )}
            </div>
          </div>
          {storageError && (
            <div className={s.errorNotice} role="alert">
              {storageError}
              <button
                aria-label="저장 알림 닫기"
                onClick={() => setStorageError("")}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          {!ready ? (
            <div className={s.empty}>견적을 준비하고 있습니다.</div>
          ) : savedView ? (
            <section className={s.savedPanel}>
              <div className={s.savedToolbar}>
                <h2>
                  내 견적 <span>{saved.length}</span>
                </h2>
                <label className={s.searchField}>
                  <Icon name="search" size={18} />
                  <input
                    aria-label="저장한 견적 검색"
                    placeholder="고객명 / 견적명 / 견적번호"
                    value={savedSearch}
                    onChange={(e) => setSavedSearch(e.target.value)}
                  />
                </label>
              </div>
              {!filteredSaved.length ? (
                <div className={s.empty}>
                  <Icon name="document" size={36} />
                  <h3>
                    {savedSearch
                      ? "검색된 견적이 없습니다."
                      : "아직 저장한 견적이 없습니다."}
                  </h3>
                  <p>견적 작성에서 제품을 담고 저장해 보세요.</p>
                  <button
                    className={s.primary}
                    onClick={() => void router.push("/renewal-test/estimate")}
                  >
                    견적 작성하기
                  </button>
                </div>
              ) : (
                <div className={s.savedList}>
                  {filteredSaved.map((value) => (
                    <article className={s.savedItem} key={value.id}>
                      <div className={s.savedIdentity}>
                        <small>{value.id}</small>
                        <h3>{value.title}</h3>
                        <p>
                          {value.customer} · {value.lines.length}개 항목 ·{" "}
                          {value.lines.length}개 제품
                        </p>
                        <small>
                          저장{" "}
                          {value.savedAt
                            ? koreaDate(new Date(value.savedAt))
                            : "-"}{" "}
                          · 유효 {validUntil(value)}
                        </small>
                      </div>
                      <div className={s.savedImages}>
                        {value.lines.slice(0, 3).map((l) => (
                          <img
                            key={l.id}
                            src={l.product.image}
                            alt={l.product.category}
                          />
                        ))}
                      </div>
                      <strong>
                        월 {money(quoteTotals(value.lines).monthly)}
                      </strong>
                      <div className={s.savedButtons}>
                        <button
                          className={s.primary}
                          onClick={() => {
                            if (quote.lines.length) {
                              setPendingLoad(value);
                              setDialog("load");
                            } else loadQuote(value);
                          }}
                        >
                          불러오기
                        </button>
                        <button
                          className={s.secondary}
                          onClick={() => {
                            setPendingLoad(value);
                            setDialog("print");
                          }}
                        >
                          인쇄 / PDF
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              <p className={s.caption}>
                저장 당시의 요금과 조건을 보존합니다. 브라우저 데이터를 지우면
                견적도 삭제됩니다.
              </p>
            </section>
          ) : (
            <>
              <div className={s.quoteMeta}>
                <div>
                  <span className={s.statusDot} />
                  <b>{quote.customer || "고객 정보 미입력"}</b>
                  <span className={s.metaDivider} />
                  {quote.id || "새 견적"}
                  <span className={s.statusBadge}>
                    {quote.id ? "저장한 견적 편집" : "작성 중"}
                  </span>
                </div>
                <button onClick={() => setDialog("reset")}>
                  새로 시작 <Icon name="plus" size={14} />
                </button>
              </div>
              <div className={s.quoteLayout}>
                <section className={s.quotePanel}>
                  <div className={s.quotePanelHeader}>
                    <h2>
                      견적 제품 <span>{quote.lines.length}개 항목</span>
                    </h2>
                  </div>
                  {!quote.lines.length ? (
                    <div className={s.quoteEmpty}>
                      <div className={s.emptyIllustration}>
                        <Icon name="document" size={42} />
                        <span>
                          <Icon name="plus" size={18} />
                        </span>
                      </div>
                      <h3>우리 집 가전을 하나씩 담아보세요.</h3>
                      <p>
                        제품을 선택하고 구독 조건을 설정하면
                        <br />월 구독료와 전체 견적을 함께 확인할 수 있어요.
                      </p>
                      <button
                        className={s.primary}
                        onClick={() => setDialog("products")}
                      >
                        <Icon name="plus" size={17} />첫 제품 추가하기
                      </button>
                    </div>
                  ) : (
                    <div className={s.quoteLines}>
                      {quote.lines.map((line) => (
                        <QuoteRow
                          key={line.id}
                          line={line}
                          onEdit={() => void openCurrentOptions(line)}
                          onCompare={() => void openCurrentOptions(line, true)}
                          onDetails={() => setDetailId(line.id)}
                          onRemove={() => {
                            setQuote((q) => ({
                              ...q,
                              lines: q.lines.filter(
                                (item) => item.id !== line.id,
                              ),
                            }));
                            notify("견적에서 제품을 삭제했습니다.");
                          }}
                        />
                      ))}
                    </div>
                  )}
                  {quote.lines.length > 0 && (
                    <button
                      className={s.addProductButton}
                      onClick={() => setDialog("products")}
                    >
                      <Icon name="plus" size={20} />
                      다른 제품 추가하기
                    </button>
                  )}
                  <div className={s.quotePanelFoot}>
                    <Icon name="document" size={16} />
                    <span>
                      제품별 계약 조건과 할인 내역을 독립적으로 설정할 수
                      있습니다.
                    </span>
                  </div>
                </section>
                <aside className={s.summaryAside}>{renderSummary()}</aside>
              </div>
            </>
          )}
        </div>
      </div>
      {!savedView && quote.lines.length > 0 && (
        <div className={s.mobileQuoteBar}>
          <span>
            {quote.lines.length}개 제품 · 월 <b>{money(totals.monthly)}</b>
          </span>
          <button className={s.primary} onClick={() => setDialog("summary")}>
            합계·저장
          </button>
        </div>
      )}
      {dialog === "summary" && (
        <Modal title="견적 합계" onClose={() => setDialog(null)}>
          <div className={s.mobileSummaryDialog}>{renderSummary()}</div>
        </Modal>
      )}
      {detailLine && (
        <Modal
          title={`${detailLine.product.id} 요금 상세`}
          description={detailLine.product.name}
          onClose={() => setDetailId(null)}
          wide
        >
          <div className={s.lineDetailLayout}>
            <ContractDetails line={detailLine} />
            <RateBreakdown line={detailLine} />
          </div>
        </Modal>
      )}
      {dialog === "products" && (
        <ProductPicker
          lines={quote.lines}
          onChoose={(p) => {
            setDialog(null);
            setOption({ line: createLine(p), editing: false });
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {option && (
        <OptionWizard
          initial={option.line}
          editing={option.editing}
          lines={quote.lines}
          onApply={applyOption}
          onClose={() => setOption(null)}
        />
      )}
      {comparing && (
        <CompareDialog
          line={comparing}
          lines={quote.lines}
          onApply={(line) => {
            updateLine(line);
            setComparing(null);
            notify("선택한 항목에만 비교 조건을 반영했습니다.");
          }}
          onClose={() => setComparing(null)}
        />
      )}
      {dialog === "cards" && quote.lines.length > 0 && (
        <CardDialog
          lines={quote.lines}
          onApply={applyCard}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "benefits" && quote.lines.length > 0 && (
        <BenefitDialog
          lines={quote.lines}
          onApply={applyCard}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "save" && (
        <SaveDialog
          quote={quote}
          onSave={saveQuote}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "print" && (
        <PrintPreview
          quote={pendingLoad || quote}
          onClose={() => {
            setDialog(null);
            setPendingLoad(null);
          }}
        />
      )}
      {dialog === "reset" && (
        <Modal
          title="새 견적을 시작할까요?"
          description="현재 초안은 비워집니다. 저장한 견적은 그대로 남습니다."
          onClose={() => setDialog(null)}
        >
          <div className={s.modalContent}>
            <p>저장하지 않은 변경 내용이 있다면 먼저 견적을 저장해 주세요.</p>
            <div className={s.buttonRow}>
              <button className={s.secondary} onClick={() => setDialog(null)}>
                계속 작성
              </button>
              <button
                className={s.primary}
                onClick={() => {
                  setQuote(emptyQuote(uid, manager));
                  setDialog(null);
                  void router.push("/renewal-test/estimate", undefined, {
                    shallow: true,
                  });
                }}
              >
                새로 시작
              </button>
            </div>
          </div>
        </Modal>
      )}
      {dialog === "load" && pendingLoad && (
        <Modal
          title="저장한 견적을 불러올까요?"
          description="현재 초안은 선택한 견적으로 교체됩니다. 저장하지 않은 변경 사항을 확인해 주세요."
          onClose={() => {
            setDialog(null);
            setPendingLoad(null);
          }}
        >
          <div className={s.modalContent}>
            <h3>{pendingLoad.title}</h3>
            <p>
              {pendingLoad.customer} · {pendingLoad.lines.length}개 항목 · 월{" "}
              {money(quoteTotals(pendingLoad.lines).monthly)}
            </p>
            <div className={s.buttonRow}>
              <button
                className={s.secondary}
                onClick={() => {
                  setDialog(null);
                  setPendingLoad(null);
                }}
              >
                취소
              </button>
              <button
                className={s.primary}
                onClick={() => loadQuote(pendingLoad)}
              >
                저장 당시 조건으로 불러오기
              </button>
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div className={s.toast} role="status">
          <Icon name="check" size={17} />
          {toast}
        </div>
      )}
    </TestLayout>
  );
}

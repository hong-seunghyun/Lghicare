/* eslint-disable @typescript-eslint/no-explicit-any */
import { useRouter } from "next/router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import styled from "styled-components";
import Link from "next/link";
import Image from "next/image";
import Head from "next/head";

import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperType } from "swiper";
import { Navigation, Thumbs } from "swiper/modules";
import "swiper/css";
import "swiper/css/navigation";
import "swiper/css/thumbs";
import type { GetServerSidePropsContext } from "next";

import Loading from "@/components/loading/Loading";
import ToolTip from "@/components/ToolTip/ToolTip";
import AutoHeightIframe from "@/components/Iframe/AutoHeightIframe";
import { getProductColorChipColors } from "@/constants/colorMap";

import disclaimerData from "@/disclaimer/disclaimer.json";

import { classifyPrepayRate } from "@/utils/prepay/classifyPrepayRate";

import { db } from "@/lib/firebase";

import {
  addDoc,
  collection,
  serverTimestamp,
  enableNetwork,
  getDocs,
  doc,
  getDoc,
  setDoc,
  increment,
  query as fsQuery,
  orderBy as fsOrderBy,
} from "firebase/firestore";

type Product = { [key: string]: any };

type OgMeta = {
  title: string;
  description: string;
  image: string;
};

type TeacherPlan = {
  id: string;
  type: string;
  maxSeats: number;
  discountPerSeat: number;
};

type CardDiscount = {
  id: string;
  cardName: string;
  amount: number; // 월 할인 금액
  allowTeacher: boolean;
  isActive: boolean;
};

type CustomSelectOption = {
  value: string;
  label: React.ReactNode;
};

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: CustomSelectOption[];
  placeholder?: string;
  disabled?: boolean;
}

const CustomSelect: React.FC<CustomSelectProps> = ({
  value,
  onChange,
  options,
  placeholder = "선택 안 함",
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  const selectedOption = options.find((o) => o.value === value) || null;
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  // 바깥 영역 클릭 시 닫기
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };

    if (open) {
      window.addEventListener("mousedown", handleClickOutside);
    } else {
      window.removeEventListener("mousedown", handleClickOutside);
    }

    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  const handleToggle = () => {
    if (disabled) return;
    setOpen((prev) => !prev);
  };

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
  };

  return (
    <CustomSelectWrapper ref={wrapperRef} data-disabled={disabled}>
      <CustomSelectButton
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={!selectedOption ? "placeholder" : ""}>
          {displayLabel}
        </span>
        <ArrowIcon>▾</ArrowIcon>
      </CustomSelectButton>

      {open && !disabled && (
        <CustomSelectDropdown role="listbox">
          {options.map((opt) => (
            <CustomSelectOptionItem
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              data-selected={opt.value === value}
              onClick={() => handleSelect(opt.value)}
            >
              {opt.label}
            </CustomSelectOptionItem>
          ))}
        </CustomSelectDropdown>
      )}
    </CustomSelectWrapper>
  );
};

const TEACHER_AVAILABLE_CARD_NAMES = ["신한카드"];

const floorTo10 = (v: number) => Math.floor(v / 100) * 100;

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { middle, id } = context.params as { middle?: string; id?: string };

  try {
    const host = "lghicare-861b3.web.app";
    const protocol = "https";
    const baseUrl = `${protocol}://${host}`;

    const res = await fetch(
      `${baseUrl}/api/products?middle=${middle}&id=${id}`,
    );

    let productName = id || "";
    let imageUrl = "https://lghicare-861b3.web.app/images/logo.png";

    if (res.ok) {
      const data = await res.json();
      const firstOption = data?.options?.[0];
      productName = firstOption?.["상품명"] || id || "";
      imageUrl = firstOption?.thumbnailUrl || imageUrl;

      // ✅ 절대경로 보정
      if (imageUrl && !/^https?:\/\//.test(imageUrl)) {
        imageUrl = `${baseUrl}${
          imageUrl.startsWith("/") ? "" : "/"
        }${imageUrl}`;
      }

      // ✅ 🔹 카카오 대응: /api/image-proxy?fileId=... → Drive 직링크 변환
      if (imageUrl.includes("/api/image-proxy")) {
        const match = imageUrl.match(/fileId=([^&]+)/);
        if (match && match[1]) {
          const fileId = match[1];
          imageUrl = `https://drive.google.com/uc?export=view&id=${fileId}`;
        }
      }
    }

    const ogMeta: OgMeta = {
      title: `${productName} | LG 하이케어솔루션`,
      description: `${productName} 모델 제품 정보 및 혜택 안내`,
      image: imageUrl,
    };

    return { props: { ogMeta } };
  } catch (err) {
    console.error("❌ OG 메타데이터 생성 오류:", err);
    return {
      props: {
        ogMeta: {
          title: `${id} | LG 하이케어솔루션`,
          description: `${id} 모델 제품 정보`,
          image: "https://lghicare-861b3.web.app/images/logo.png",
        } satisfies OgMeta,
      },
    };
  }
}

export default function ProductDetail({ ogMeta }: { ogMeta: OgMeta }) {
  const router = useRouter();

  const { middle, id } = router.query;

  const [options, setOptions] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [relatedModels, setRelatedModels] = useState<Product[]>([]);

  const [contract, setContract] = useState("");
  const [serviceType, setServiceType] = useState("");
  const [serviceCycle, setServiceCycle] = useState("");
  const [promoType, setPromoType] = useState("");
  const [promoName, setPromoName] = useState("");
  const [promoCategory, setPromoCategory] = useState("");

  const [prepay, setPrepay] = useState("");
  const [prepayAmount, setPrepayAmount] = useState("");

  const [thumbsSwiper, setThumbsSwiper] = useState<SwiperType | null>(null);

  const [copied, setCopied] = useState(false);
  const [shared, setShared] = useState(false);

  const allContracts = Array.from(new Set(options.map((o) => o["계약기간"])));
  const allServiceTypes = Array.from(
    new Set(options.map((o) => o["서비스유형"])),
  );
  const allCycles = Array.from(new Set(options.map((o) => o["서비스주기/월"])));

  const normalizeValue = (value?: string) => (value ?? "").toString().trim();

  const filteredByCycle = options.filter((o) => {
    if (
      contract &&
      normalizeValue(o["계약기간"]) !== normalizeValue(contract)
    ) {
      return false;
    }
    if (
      serviceType &&
      normalizeValue(o["서비스유형"]) !== normalizeValue(serviceType)
    ) {
      return false;
    }
    if (
      serviceCycle &&
      normalizeValue(o["서비스주기/월"]) !== normalizeValue(serviceCycle)
    ) {
      return false;
    }
    return true;
  });

  const promoCategoryList = Array.from(
    new Set(
      filteredByCycle
        .map((o) => normalizeValue(o["프로모션 대분류"]))
        .filter(Boolean),
    ),
  );

  const filteredByCategory = promoCategory
    ? filteredByCycle.filter(
        (o) =>
          normalizeValue(o["프로모션 대분류"]) ===
          normalizeValue(promoCategory),
      )
    : [];

  const promoTypeList =
    promoCategory && filteredByCategory.length > 0
      ? Array.from(
          new Set(
            filteredByCategory
              .map((o) => normalizeValue(o["프로모션유형"]))
              .filter(Boolean),
          ),
        )
      : [];

  const promoNameList =
    promoType && filteredByCategory.length > 0
      ? Array.from(
          new Set(
            filteredByCategory
              .filter(
                (o) =>
                  normalizeValue(o["프로모션유형"]) ===
                  normalizeValue(promoType),
              )
              .map((o) => o["프로모션명"])
              .filter((v) => !!v),
          ),
        )
      : [];

  const [disclaimerText, setDisclaimerText] = useState<string | null>(null);

  const [prepayRate, setPrepayRate] = useState(""); // 30 / 50 / ""
  const [prepayAvailableRate, setPrepayAvailableRate] = useState<
    "30" | "30_50" | null
  >(null);
  const [prepayAmountDisplay, setPrepayAmountDisplay] = useState<number | null>(
    null,
  );

  const selectPromoCategory = useCallback((value: string) => {
    setPromoCategory(value);
    setPromoType("");
    setPromoName("");
    setPrepayRate("");
  }, []);

  useEffect(() => {
    if (promoCategoryList.length === 0) {
      if (promoCategory !== "") {
        selectPromoCategory("");
      }
      return;
    }

    const normalizedCurrent = normalizeValue(promoCategory) || "";
    const normalizedList = promoCategoryList.map(normalizeValue);
    const fallback =
      promoCategoryList.find(
        (value) => normalizeValue(value).toLowerCase() === "신규",
      ) ?? promoCategoryList[0];

    if (!normalizedCurrent) {
      selectPromoCategory(fallback);
      return;
    }

    if (!normalizedList.includes(normalizedCurrent)) {
      selectPromoCategory(fallback);
    }
  }, [promoCategoryList, promoCategory, selectPromoCategory]);

  useEffect(() => {
    if (promoTypeList.length === 0) {
      if (promoType !== "") {
        setPromoType("");
        setPromoName("");
        setPrepayRate("");
      }
      return;
    }

    const normalizedList = promoTypeList.map(normalizeValue);
    const normalizedType = normalizeValue(promoType);

    if (!promoType) {
      setPromoType(promoTypeList[0]);
      setPromoName("");
      setPrepayRate("");
      return;
    }

    if (!normalizedList.includes(normalizedType)) {
      setPromoType(promoTypeList[0]);
      setPromoName("");
      setPrepayRate("");
    }
  }, [promoTypeList, promoType]);

  // 🔥 구독교원 상태
  const [teacherPlans, setTeacherPlans] = useState<TeacherPlan[]>([]);
  const [teacherSelections, setTeacherSelections] = useState<
    Record<string, number>
  >({});
  const [teacherLoading, setTeacherLoading] = useState(false);

  // 🔥 제휴카드 할인 상태
  const [cardDiscounts, setCardDiscounts] = useState<CardDiscount[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string>("");

  // 🔹 데이터 불러오기
  useEffect(() => {
    const middleValue = Array.isArray(router.query.middle)
      ? router.query.middle[0]
      : router.query.middle;
    const idValue = Array.isArray(router.query.id)
      ? router.query.id[0]
      : router.query.id;

    if (!router.isReady || !idValue || !middleValue) return;

    const fetchDetail = async () => {
      try {
        setLoading(true);

        const url = `/api/products?middle=${middleValue}&id=${idValue}`;
        const [res] = await Promise.all([fetch(url)]);

        if (!res.ok) throw new Error(`API 요청 실패: ${res.status}`);
        const data = await res.json();

        setOptions(data.options || []);
        setRelatedModels(data.relatedModels || []);
      } catch (err) {
        console.error("상품 불러오기 오류:", err);
        setOptions([]);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [router.isReady, router.query.middle, router.query.id]);

  // ✅ 최저가 자동 선택
  useEffect(() => {
    if (!options.length) return;
    if (router.query.opt) return;
    if (contract || serviceType || serviceCycle || promoType) return; // 사용자가 이미 선택했으면 중단

    const parsePrice = (p: Product) => {
      const raw = p["할인후금액"] || p["할인전금액"] || "0";
      return parseInt(raw.replace(/[^0-9]/g, ""), 10) || Infinity;
    };

    const normalizePromo = (v?: string) =>
      (v || "")
        .replace(/\s+/g, "") // 공백 제거
        .replace(/\u3164/g, "") // 특수 공백 제거
        .trim();

    // ① 완전 일치 (정확히 신규결합)
    const exactNewJoin = options.filter(
      (o) => normalizePromo(o["프로모션유형"]) === "신규결합",
    );

    // ② 포함형 (복합형)
    const mixedNewJoin = options.filter(
      (o) =>
        normalizePromo(o["프로모션유형"]).includes("신규결합") &&
        normalizePromo(o["프로모션유형"]) !== "신규결합",
    );

    // ③ 우선순위 고정
    let targetList: Product[];
    if (exactNewJoin.length > 0) {
      targetList = exactNewJoin;
    } else if (mixedNewJoin.length > 0) {
      targetList = mixedNewJoin;
    } else {
      targetList = options;
    }

    // ④ targetList 내부에서만 최저가 계산
    const cheapest = targetList.reduce((min, cur) =>
      parsePrice(cur) < parsePrice(min) ? cur : min,
    );

    // ⑤ 상태 업데이트
    setContract(cheapest["계약기간"] || "");
    setServiceType(cheapest["서비스유형"] || "");
    setServiceCycle(cheapest["서비스주기/월"] || "");
    setPromoType(cheapest["프로모션유형"]?.trim() || "");
    setPromoName(cheapest["프로모션명"] || "");
  }, [
    options,
    router.query.opt,
    contract,
    serviceType,
    serviceCycle,
    promoType,
  ]);

  // ✅ URL opt 파라미터 → 옵션 자동 선택
  useEffect(() => {
    if (!options.length || !router.query.opt) return;

    const optStr = Array.isArray(router.query.opt)
      ? router.query.opt[0]
      : router.query.opt;

    if (!optStr) return;

    const parts = optStr.split("-");
    try {
      if (parts[0] && options[+parts[0]])
        setContract(options[+parts[0]]["계약기간"] || "");
      if (parts[1] && options[+parts[1]])
        setServiceType(options[+parts[1]]["서비스유형"] || "");
      if (parts[2] && options[+parts[2]])
        setServiceCycle(options[+parts[2]]["서비스주기/월"] || "");
      if (parts[3] && options[+parts[3]])
        selectPromoCategory(
          options[+parts[3]]["프로모션 대분류"]?.trim() || "",
        );
      if (parts[4] && options[+parts[4]])
        setPromoType(options[+parts[4]]["프로모션유형"]?.trim() || "");
      if (parts[5] && options[+parts[5]])
        setPromoName(options[+parts[5]]["프로모션명"] || "");
      if (parts[6]) setPrepay(parts[6]);
      if (parts[7]) setPrepayAmount(parts[7]);
      if (parts[8]) setPrepayRate(parts[8]);
    } catch (e) {
      console.error("URL 옵션 파싱 오류:", e);
    }
  }, [options, router.query.opt]);

  useEffect(() => {
    if (!id) return;

    try {
      const idValue = Array.isArray(id) ? id[0] : id;
      const found = disclaimerData.find((item) => item["모델코드"] === idValue);

      if (found) setDisclaimerText(found["디스클레이머"]);
      else setDisclaimerText(null);
    } catch (err) {
      console.error("❌ 디스클레이머 로드 오류:", err);
    }
  }, [id]);

  // 🔹 포맷 변환
  const formatContract = (value: string) => {
    if (!value) return value;
    const months = parseInt(value.replace(/[^0-9]/g, ""), 10);
    if (isNaN(months)) return value;
    if (months % 12 === 0) return `${months / 12}년`;
    return `${months}개월`;
  };

  const isValidOption = (
    key: string,
    value: string,
    conditions: Record<string, string>,
  ) => {
    if (!value) return false;

    return options.some((o) => {
      // 이전 단계까지만 검사
      const matches = Object.entries(conditions).every(([k, v]) => {
        if (!v) return true;
        return (o[k] || "").trim() === v.trim();
      });

      return matches && (o[key] || "").trim() === value.trim();
    });
  };

  const normalizeNum = (v?: string) =>
    (v || "")
      .toString()
      .replace(/[^0-9]/g, "")
      .trim();
  const normalizeStr = (v?: string) => (v || "").toString().trim();

  const current =
    contract && serviceType && serviceCycle && promoType
      ? options.find((o) => {
          const match =
            normalizeNum(o["계약기간"]) === normalizeNum(contract) &&
            normalizeStr(o["서비스유형"]) === normalizeStr(serviceType) &&
            normalizeNum(o["서비스주기/월"]) === normalizeNum(serviceCycle) &&
            normalizeStr(o["프로모션유형"]) === normalizeStr(promoType) &&
            (!promoName ||
              normalizeStr(o["프로모션명"]) === normalizeStr(promoName));
          return match;
        })
      : undefined;

  const prepayContractOption = useMemo(() => {
    const targetContract = normalizeNum(contract);
    if (targetContract !== "72" || !serviceType || !serviceCycle) {
      return undefined;
    }

    const normalizedServiceType = normalizeStr(serviceType);
    const normalizedServiceCycle = normalizeNum(serviceCycle);

    return options.find((option) => {
      return (
        normalizeNum(option["계약기간"]) === "72" &&
        normalizeStr(option["서비스유형"]) === normalizedServiceType &&
        normalizeNum(option["서비스주기/월"]) === normalizedServiceCycle
      );
    });
  }, [options, contract, serviceType, serviceCycle]);

  useEffect(() => {
    if (!options.length) return;
    const wrong = options.find((o) => o["할인전금액"]?.includes("49,700"));
    console.log("🚨 49,700원 데이터 확인:", wrong);
  }, [options]);

  const isPrepay = current?.["선입금여부"] === "Y";

  const getPriceValue = (product: Product, hasPromo: boolean) => {
    if (!product) return 0;

    // 1️⃣ 기본: 할인전금액
    let base = product["할인전금액"] || product["정상가"] || "";

    // 2️⃣ 프로모션이 선택된 경우, 할인후금액이 있으면 그 값으로 교체
    if (hasPromo && product["할인후금액"]) {
      base = product["할인후금액"];
    }

    // 3️⃣ 숫자만 추출
    const cleaned = base.toString().replace(/[^0-9]/g, "");
    if (!cleaned) return 0;
    return parseInt(cleaned, 10);
  };

  // ✅ 기존 usageFee, bestPrice 부분 유지
  const usageFee = current ? getPriceValue(current, !!promoName) : 0;
  const bestPrice = current ? Math.max(usageFee - 13000, 0) : 0;
  // 선납금 산정 기준: 할인전금액
  const prepayBaseMonthly = useMemo(() => {
    const target = current ?? prepayContractOption;
    if (!target) return 0;
    const value = getPriceValue(target, false);
    return value > 0 ? value : 0;
  }, [current, prepayContractOption]);

  // 선납 반영 월요금 계산 기준: 할인후금액(프로모션 반영 usageFee)
  const prepayBillingBaseMonthly = useMemo(() => {
    if (usageFee > 0) return usageFee;
    return prepayBaseMonthly;
  }, [usageFee, prepayBaseMonthly]);

  const middleValue = options[0]?.["중분류"] ?? "";
  const allModels = Array.from(new Set(options.map((o) => o["모델코드"])));

  const handleCopy = async () => {
    try {
      const text = Array.isArray(id) ? id[0] : id || "";
      if (!text) return;
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (err) {
      console.error("❌ 클립보드 복사 실패:", err);
    }
  };

  const handleShare = async () => {
    try {
      const currentUrl = new URL(window.location.href);

      // 기존 opt 제거
      currentUrl.searchParams.delete("opt");

      const findIndex = (key: string, value: string) => {
        if (!value) return "";
        const idx = options.findIndex(
          (o) => (o[key] || "").trim() === value.trim(),
        );
        return idx >= 0 ? idx.toString() : "";
      };

      // 🔥 인덱스를 "고정 위치"로 유지하는 것이 핵심!
      const indices: string[] = [];

      // 0~4 : 옵션 인덱스
      indices[0] = findIndex("계약기간", contract); // parts[0]
      indices[1] = findIndex("서비스유형", serviceType); // parts[1]
      indices[2] = findIndex("서비스주기/월", serviceCycle); // parts[2]
      indices[3] = findIndex("프로모션 대분류", promoCategory); // parts[3]
      indices[4] = findIndex("프로모션유형", promoType); // parts[4]
      indices[5] = findIndex("프로모션명", promoName); // parts[5]

      // 6~8 : 선입금 / 선입금액 / 선납율
      indices[6] = prepay || ""; // parts[6]
      indices[7] = prepayAmount || ""; // parts[7]
      indices[8] = prepayRate || ""; // parts[8]

      // 빈 값도 포함해서 그대로 join (자리 유지)
      const optParam = indices.join("-");

      // 모든 값이 비어있는 경우만 opt 제거
      const hasAnyValue = indices.some((v) => v && v !== "");
      if (hasAnyValue) {
        currentUrl.searchParams.set("opt", optParam);
      } else {
        currentUrl.searchParams.delete("opt");
      }

      // 🔥 구독교원 선택값 → teacher 파라미터로 직렬화
      const teacherParts = teacherPlans
        .map((plan) => {
          const seats = teacherSelections[plan.id] ?? 0;
          if (!seats) return "";
          return `${plan.id}:${seats}`;
        })
        .filter(Boolean);

      if (teacherParts.length) {
        currentUrl.searchParams.set("teacher", teacherParts.join(","));
      } else {
        currentUrl.searchParams.delete("teacher");
      }

      // 🔥 제휴카드 선택값 → card 파라미터
      if (selectedCardId) {
        currentUrl.searchParams.set("card", selectedCardId);
      } else {
        currentUrl.searchParams.delete("card");
      }

      const shareUrl = currentUrl.toString();
      await navigator.clipboard.writeText(shareUrl);

      setShared(true);
      setTimeout(() => setShared(false), 1500);
      alert("링크를 복사 했습니다.");

      // ================== 🔥 공유 애널리틱스 저장 (shareCount) ==================
      // ================== 🔥 공유 애널리틱스 저장 (shareCount) ==================
      try {
        const { getAuth } = await import("firebase/auth");
        const auth = getAuth();
        const currentUser = auth.currentUser;

        let managerMeta: {
          uid: string;
          managerId: string;
          name: string;
          branch: string;
        } | null = null;

        if (currentUser) {
          const userSnap = await getDoc(doc(db, "users", currentUser.uid));
          if (userSnap.exists()) {
            const userData = userSnap.data() as any;
            if (userData.role === "manager") {
              managerMeta = {
                uid: currentUser.uid,
                managerId: userData.managerId ?? "",
                name: userData.name ?? "",
                branch: userData.branch ?? "",
              };
            }
          }
        }

        const shareCountCol = collection(db, "shareCount");
        const shareTypeCountCol = collection(db, "shareCountByType");
        const sharePageCountCol = collection(db, "shareCountByPage");
        const shareManagerCountCol = collection(db, "shareCountByManager");
        const shareBranchCountCol = collection(db, "shareCountByBranch");
        const managerCategoryStatsCol = collection(db, "managerCategoryStats");
        const managerProductStatsCol = collection(db, "managerProductStats");
        const now = new Date();

        // 👉 페이지 기반 key (ex: /products/abc → "products_abc")
        const pathName = window.location.pathname || "/";
        const pathKey =
          pathName.replace(/^\//, "").replace(/\//g, "_") || "root";

        // ✅ 이 제품의 중분류(type) 추출
        const estimateType: string =
          (options[0]?.["중분류"] as string | undefined) ||
          (typeof middle === "string"
            ? middle
            : Array.isArray(middle)
              ? middle[0]
              : undefined) ||
          "unknown";

        const analyticsTasks: Promise<unknown>[] = [];

        // 0) 타입별 공유 카운트 (BEST 공유용)
        analyticsTasks.push(
          setDoc(
            doc(shareTypeCountCol, `type_${estimateType}`),
            {
              type: estimateType,
              totalCount: increment(1),
              updatedAt: now,
            },
            { merge: true },
          ),
        );

        analyticsTasks.push(
          setDoc(
            doc(sharePageCountCol, `page_${pathKey}_type_${estimateType}`),
            {
              path: pathName,
              type: estimateType,
              totalCount: increment(1),
              updatedAt: now,
            },
            { merge: true },
          ),
        );

        // 1) 전체 페이지 기준 공유 카운트
        analyticsTasks.push(
          setDoc(
            doc(shareCountCol, `page_${pathKey}`),
            {
              path: pathName,
              type: estimateType, // ✅ 중분류 type 저장
              shareCount: increment(1),
              lastSharedUrl: shareUrl,
              updatedAt: now,
            },
            { merge: true },
          ),
        );

        if (managerMeta) {
          const { uid, managerId, name, branch } = managerMeta;

          // 2) 매니저별 페이지 공유 카운트
          analyticsTasks.push(
            setDoc(
              doc(shareCountCol, `manager_${uid}_${pathKey}`),
              {
                path: pathName,
                type: estimateType, // ✅ 중분류 type 저장
                managerUid: uid,
                managerId,
                managerName: name,
                branch,
                shareCount: increment(1),
                lastSharedUrl: shareUrl,
                updatedAt: now,
              },
              { merge: true },
            ),
          );

          analyticsTasks.push(
            setDoc(
              doc(shareManagerCountCol, `manager_${uid}_type_${estimateType}`),
              {
                type: estimateType,
                managerUid: uid,
                managerId,
                managerName: name,
                branch,
                totalCount: increment(1),
                updatedAt: now,
              },
              { merge: true },
            ),
          );

          // 3) 지점별 페이지 공유 카운트
          if (branch) {
            analyticsTasks.push(
              setDoc(
                doc(shareCountCol, `branch_${branch}_${pathKey}`),
                {
                  path: pathName,
                  type: estimateType, // ✅ 중분류 type 저장
                  branch,
                  shareCount: increment(1),
                  lastSharedUrl: shareUrl,
                  updatedAt: now,
                },
                { merge: true },
              ),
            );

            analyticsTasks.push(
              setDoc(
                doc(
                  shareBranchCountCol,
                  `branch_${branch}_type_${estimateType}`,
                ),
                {
                  type: estimateType,
                  branch,
                  totalCount: increment(1),
                  updatedAt: now,
                },
                { merge: true },
              ),
            );
          }

          const modelCode =
            (current?.["모델코드"] as string | undefined) ||
            (options[0]?.["모델코드"] as string | undefined) ||
            (typeof id === "string"
              ? id
              : Array.isArray(id)
                ? id[0]
                : "unknown") ||
            "unknown";
          const productName =
            (current?.["상품명"] as string | undefined) ||
            (options[0]?.["상품명"] as string | undefined) ||
            "";
          const region = (managerMeta as any).region ?? "";
          const office = (managerMeta as any).office ?? "";

          analyticsTasks.push(
            setDoc(
              doc(
                managerCategoryStatsCol,
                `manager_${uid}_category_${estimateType}`,
              ),
              {
                type: estimateType,
                managerUid: uid,
                managerId,
                managerName: name,
                branch,
                region,
                office,
                shareCount: increment(1),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ),
          );

          analyticsTasks.push(
            setDoc(
              doc(
                managerProductStatsCol,
                `manager_${uid}_product_${modelCode}`,
              ),
              {
                type: estimateType,
                modelCode,
                productName,
                managerUid: uid,
                managerId,
                managerName: name,
                branch,
                region,
                office,
                shareCount: increment(1),
                updatedAt: serverTimestamp(),
              },
              { merge: true },
            ),
          );
        }

        if (analyticsTasks.length > 0) {
          await Promise.all(analyticsTasks);
        }
      } catch (analyticsError) {
        console.error("❌ 공유 애널리틱스 저장 실패:", analyticsError);
      }

      // =================================================================
    } catch (err) {
      console.error("❌ 링크 복사 실패:", err);
    }
  };

  useEffect(() => {
    const cardParamRaw = router.query.card;
    if (!cardParamRaw) return;

    const cardId = Array.isArray(cardParamRaw) ? cardParamRaw[0] : cardParamRaw;

    if (!cardId) return;

    // cardDiscounts 로딩 여부와 상관없이 id만 먼저 세팅
    setSelectedCardId(cardId);
  }, [router.query.card]);

  // ✅ URL → 옵션 자동 세팅 (선납 rate 포함)
  useEffect(() => {
    if (!options.length || !router.query.opt) return;

    const optStr = Array.isArray(router.query.opt)
      ? router.query.opt[0]
      : router.query.opt;

    if (!optStr) return;
    const parts = optStr.split("-");

    try {
      const setIfValid = (
        idxStr: string,
        key: string,
        setter: (v: string) => void,
      ) => {
        const idx = parseInt(idxStr, 10);
        if (!isNaN(idx) && idx >= 0 && options[idx]) {
          setter(options[idx][key] || "");
        }
      };

      if (parts[0]) setIfValid(parts[0], "계약기간", setContract);
      if (parts[1]) setIfValid(parts[1], "서비스유형", setServiceType);
      if (parts[2]) setIfValid(parts[2], "서비스주기/월", setServiceCycle);
      if (parts[3])
        setIfValid(parts[3], "프로모션 대분류", selectPromoCategory);
      if (parts[4]) setIfValid(parts[4], "프로모션유형", setPromoType);
      if (parts[5]) setIfValid(parts[5], "프로모션명", setPromoName);
      if (parts[6]) setPrepay(parts[6]);
      if (parts[7]) setPrepayAmount(parts[7]);
      if (parts[8]) setPrepayRate(parts[8]);
    } catch (e) {
      console.error("URL 옵션 파싱 오류:", e);
    }
  }, [options, router.query.opt]);

  // 🔥 선납 가능 여부 판별 (이제 비동기 API 기반)
  // 🔥 선납 가능 여부 판별 (Firestore + API 기반 비동기)
  useEffect(() => {
    if (!options.length) return;

    const middle = options[0]["중분류"];
    const sub = options[0]["소분류"];
    const model = options[0]["모델코드"];

    if (!middle) {
      setPrepayAvailableRate(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const result = await classifyPrepayRate({
          middle,
          sub,
          model,
        });

        if (!cancelled) {
          setPrepayAvailableRate(result);
        }
      } catch (err) {
        console.error("❌ 선납 규칙 조회 오류:", err);
        if (!cancelled) {
          setPrepayAvailableRate(null);
        }
      }
    })();

    // 언마운트 / options 변경 시 이전 요청 무시
    return () => {
      cancelled = true;
    };
  }, [options]);

  // 🔥 선납금 계산 (요금 = 월요금 × 72 × (선납비율))
  useEffect(() => {
    if (!prepayRate || !current) {
      setPrepayAmountDisplay(null);
      return;
    }

    const rate = Number(prepayRate); // 30 or 50
    const baseMonthly = prepayBaseMonthly || usageFee;
    const total = baseMonthly * 72;

    const rawPrepay = total * (rate / 100);
    const truncatedPrepay = floorTo10(rawPrepay);

    setPrepayAmountDisplay(truncatedPrepay);
  }, [prepayRate, current, usageFee, prepayBaseMonthly]);

  // 🔥 구독교원 Firestore에서 불러오기
  useEffect(() => {
    const fetchTeacherPlans = async () => {
      try {
        setTeacherLoading(true);
        const colRef = collection(db, "teacherPlans");
        const q = fsQuery(colRef, fsOrderBy("type"));
        const snap = await getDocs(q);

        const list: TeacherPlan[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            type: data.type || "",
            maxSeats: Number(data.maxSeats ?? 0),
            discountPerSeat: Number(data.discountPerSeat ?? 0),
          };
        });

        // ✅ type 안의 숫자 기준으로 내림차순 정렬 (예: 144 → 130 → 108 → 80 → 72)
        const sorted = [...list].sort((a, b) => {
          const numA = parseInt(a.type.replace(/[^0-9]/g, ""), 10) || 0;
          const numB = parseInt(b.type.replace(/[^0-9]/g, ""), 10) || 0;
          return numB - numA; // 큰 숫자 먼저
        });

        setTeacherPlans(sorted);
        setTeacherSelections((prev) => {
          const next: Record<string, number> = { ...prev };
          sorted.forEach((p) => {
            if (next[p.id] == null) next[p.id] = 0;
          });
          return next;
        });
      } catch (err) {
        console.error("❌ 구독교원 데이터 불러오기 오류:", err);
      } finally {
        setTeacherLoading(false);
      }
    };

    fetchTeacherPlans();
  }, []);

  // 🔥 제휴카드 할인 Firestore에서 불러오기 (예: cardDiscounts 컬렉션)
  useEffect(() => {
    const fetchCardDiscounts = async () => {
      try {
        const colRef = collection(db, "cardDiscounts");
        const q = fsQuery(colRef, fsOrderBy("order")); // order 기준 정렬 (없으면 cardName으로 바꿔도 됨)
        const snap = await getDocs(q);

        const list: CardDiscount[] = snap.docs.map((d) => {
          const data = d.data() as any;
          return {
            id: d.id,
            cardName: data.cardName || "",
            amount: Number(data.amount ?? 0),
            allowTeacher: !!data.allowTeacher,
            isActive: data.isActive !== false, // undefined면 true로 취급
          };
        });

        // 활성 카드만 필터링
        setCardDiscounts(list.filter((c) => c.isActive));
      } catch (err) {
        console.error("❌ 제휴카드 할인 데이터 불러오기 오류:", err);
      }
    };

    fetchCardDiscounts();
  }, []);

  // 🔥 URL → 구독교원 좌수 자동 세팅 (teacher 파라미터)
  useEffect(() => {
    if (!teacherPlans.length) return;

    const teacherParamRaw = router.query.teacher;
    if (!teacherParamRaw) return;

    const teacherStr = Array.isArray(teacherParamRaw)
      ? teacherParamRaw[0]
      : teacherParamRaw;

    if (!teacherStr) return;

    const items = teacherStr.split(",");

    // 기본값 0으로 초기화
    const nextSelections: Record<string, number> = {};
    teacherPlans.forEach((p) => {
      nextSelections[p.id] = 0;
    });

    let totalSeats = 0;

    for (const item of items) {
      const [planId, seatsStr] = item.split(":");
      if (!planId) continue;

      const rawSeats = parseInt(seatsStr || "0", 10);
      if (!rawSeats || rawSeats <= 0) continue;

      const plan = teacherPlans.find((p) => p.id === planId);
      if (!plan) continue;

      const remaining = 4 - totalSeats;
      if (remaining <= 0) break;

      const allowed = Math.min(rawSeats, plan.maxSeats, remaining);
      if (allowed <= 0) continue;

      nextSelections[plan.id] = allowed;
      totalSeats += allowed;
    }

    setTeacherSelections(nextSelections);
  }, [teacherPlans, router.query.teacher]);

  // 🔥 usageFee & bestPrice에 선납 수수료 반영 (선납금 × 1.135)
  const finalUsageFee = (() => {
    if (!current) return 0;

    // 6년 & 선납 선택된 경우
    if (
      normalizeNum(contract) === "72" &&
      prepayRate &&
      prepayAmountDisplay &&
      prepayBillingBaseMonthly
    ) {
      const baseMonthly = prepayBillingBaseMonthly;
      const total = baseMonthly * 72;
      const prepayWithFee = prepayAmountDisplay * 1.135; // 실제 표시 선납금 + 수수료

      const newMonthlyRaw = (total - prepayWithFee) / 72;
      const newMonthly = floorTo10(newMonthlyRaw);

      return newMonthly;
    }

    return usageFee;
  })();

  // 🔥 구독교원 선택 변경 핸들러 (총 4구좌 제한)
  const handleTeacherSeatsChange = (
    planId: string,
    maxSeats: number,
    nextSeats: number,
  ) => {
    if (nextSeats < 0 || nextSeats > maxSeats) return;

    setTeacherSelections((prev) => {
      const currentSeats = prev[planId] ?? 0;

      // 현재 전체 구좌 수
      let totalSeats = 0;
      teacherPlans.forEach((p) => {
        const cnt = p.id === planId ? currentSeats : (prev[p.id] ?? 0);
        totalSeats += cnt;
      });

      const nextTotal = totalSeats - currentSeats + nextSeats;

      if (nextTotal > 4) {
        alert("구독교원 전체 구좌 수는 최대 4개까지 가능합니다.");
        return prev;
      }

      return {
        ...prev,
        [planId]: nextSeats,
      };
    });
  };

  // 🔍 현재 선택된 카드
  const selectedCard = useMemo(() => {
    if (!selectedCardId) return null;
    return cardDiscounts.find((c) => c.id === selectedCardId) ?? null;
  }, [cardDiscounts, selectedCardId]);

  // 🔥 이 카드에서만 구독교원 노출
  const isTeacherAvailable = !!selectedCard?.allowTeacher;

  // 🔥 구독교원 허용되지 않는 카드 선택 시, 구좌 선택 초기화
  useEffect(() => {
    if (isTeacherAvailable) return;

    if (teacherPlans.length > 0) {
      setTeacherSelections((prev) => {
        const next: Record<string, number> = {};
        teacherPlans.forEach((p) => {
          next[p.id] = 0;
        });
        return next;
      });
    }
  }, [isTeacherAvailable, teacherPlans]);

  // 🔢 구독교원 총 구좌 / 총 할인액
  const { teacherTotalSeats, teacherTotalDiscount } = useMemo(() => {
    // 제휴카드가 구독교원 허용 카드가 아니면 강제로 0 처리
    if (!isTeacherAvailable) {
      return { teacherTotalSeats: 0, teacherTotalDiscount: 0 };
    }

    let seats = 0;
    let discount = 0;

    teacherPlans.forEach((p) => {
      const cnt = teacherSelections[p.id] ?? 0;
      if (!cnt) return;
      seats += cnt;
      discount += cnt * p.discountPerSeat;
    });

    return { teacherTotalSeats: seats, teacherTotalDiscount: discount };
  }, [teacherPlans, teacherSelections, isTeacherAvailable]);

  // 🔥 최대혜택가 (제휴카드 + 구독교원) 계산

  // 1단계: 제휴카드까지 반영된 "기본 최대혜택가"
  const baseBestPrice = (() => {
    if (!current) return 0;

    // 제휴카드 선택이 없을 경우: 이용요금 - 13,000
    if (!selectedCard) {
      const bp = finalUsageFee > 13000 ? finalUsageFee - 0 : finalUsageFee;
      return Math.max(bp, 0);
    }

    // 제휴카드 선택 시: 이용요금 - 카드 할인금액
    const discounted = finalUsageFee - selectedCard.amount;
    return Math.max(discounted, 0);
  })();

  // 2단계: 구독교원까지 반영된 "최종 최대혜택가"
  const finalBestPriceWithTeacher = Math.max(
    baseBestPrice - teacherTotalDiscount,
    0,
  );

  if (loading) return <Loading />;
  if (!options.length) return <div>상품을 찾을 수 없습니다.</div>;

  return (
    <>
      <Head>
        <title>{ogMeta?.title}</title>
        <meta name="description" content={ogMeta?.description} />
        <meta property="og:title" content={ogMeta?.title} />
        <meta property="og:description" content={ogMeta?.description} />
        <meta property="og:image" content={ogMeta?.image} />
        <meta property="twitter:card" content="summary_large_image" />
        <meta property="twitter:image" content={ogMeta?.image} />
      </Head>
      <Container>
        <Section>
          <Breadcrumb>
            <Link href="/">홈</Link>
            <span> &gt; </span>
            {options[0]?.["대분류"] && (
              <>
                <Link
                  href={`/products/${encodeURIComponent(options[0]["대분류"])}`}
                >
                  {options[0]["대분류"]}
                </Link>
                <span> &gt; </span>
              </>
            )}
            <Link
              href={`/products/${encodeURIComponent(options[0]["중분류"])}`}
            >
              {options[0]["중분류"]}
            </Link>
            <span> &gt; </span>
            <strong>{id}</strong>
          </Breadcrumb>
        </Section>
        <ProductDetailWrap>
          <ThumbsWrap>
            <Section>
              {options[0]?.images?.length ? (
                <>
                  {/* ✅ 메인 슬라이드 */}
                  <Swiper
                    modules={[Navigation, Thumbs]}
                    slidesPerView={1}
                    style={{
                      width: "100%",
                    }}
                    thumbs={{
                      swiper:
                        thumbsSwiper && !thumbsSwiper.destroyed
                          ? thumbsSwiper
                          : null,
                    }}
                  >
                    {Array.isArray(options[0]?.images) &&
                      options[0].images.map((src: string, idx: number) => (
                        <SwiperSlide
                          key={idx}
                          style={{
                            position: "relative",
                            width: "100%",
                            height: "auto",
                            overflow: "hidden",
                            aspectRatio: "1 / 1",
                          }}
                        >
                          <Image
                            src={src}
                            alt={`상품 이미지 ${idx + 1}`}
                            width={1000}
                            height={1000}
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                            }}
                          />
                        </SwiperSlide>
                      ))}
                  </Swiper>

                  {/* ✅ 썸네일 슬라이드 */}
                  <ThumbnailSwiper>
                    <Swiper
                      modules={[Thumbs]}
                      onSwiper={setThumbsSwiper}
                      spaceBetween={24}
                      slidesPerView={"auto"}
                      watchSlidesProgress
                    >
                      {Array.isArray(options[0]?.images) &&
                        options[0].images.map((src: string, idx: number) => (
                          <SwiperSlide key={idx}>
                            <Image
                              src={src}
                              alt={`썸네일 ${idx + 1}`}
                              width={90}
                              height={90}
                              style={{
                                width: "90px",
                                height: "90px",
                                borderRadius: "4px",
                                objectFit: "cover",
                                cursor: "pointer",
                              }}
                            />
                          </SwiperSlide>
                        ))}
                    </Swiper>
                  </ThumbnailSwiper>
                </>
              ) : (
                <NonThumnail>
                  <Logo src={"/images/logo.png"} alt="logo" />
                  이미지를 준비중 입니다.
                </NonThumnail>
              )}
            </Section>
          </ThumbsWrap>

          <ProductInfo>
            <Title>
              {options[0]["상품명"]}

              <Share onClick={handleShare}>
                <Image
                  src={"/images/icon_share.svg"}
                  alt="copy"
                  width={24}
                  height={24}
                />
              </Share>
            </Title>
            <Model onClick={handleCopy}>
              <Image
                src={"/images/icon_copy.svg"}
                alt="copy"
                width={24}
                height={24}
              />
              {id}
              {copied && (
                <span
                  style={{
                    color: "red",
                    marginLeft: "8px",
                  }}
                >
                  복사되었습니다.
                </span>
              )}
            </Model>
            <Section>
              <Label>색상</Label>
              <ButtonGroup>
                {(() => {
                  const idValue = Array.isArray(id)
                    ? id[0]
                    : (id as string) || "";
                  const currentModel = options.find(
                    (o) => (o["모델코드"] || "").trim() === idValue.trim(),
                  );
                  if (!currentModel) return null;

                  // ✅ 동일모델기준 없으면 "" 처리
                  const currentCode = (currentModel["모델코드"] || "").trim();
                  const groupKey =
                    (currentModel["동일모델기준"] || "").trim() ===
                    "동일모델기준없음"
                      ? currentCode
                      : (currentModel["동일모델기준"] || "").trim() ||
                        currentCode;

                  // ✅ 그룹에 포함되는 모델 찾기
                  // ✅ API에서 전달된 relatedModels를 우선 사용
                  let groupModels = relatedModels.length
                    ? relatedModels
                    : options.filter((o) => {
                        const modelCode = (o["모델코드"] || "").trim();
                        const sameGroup = (o["동일모델기준"] || "").trim();

                        return (
                          modelCode === groupKey ||
                          sameGroup === groupKey ||
                          modelCode === currentCode ||
                          sameGroup === currentCode
                        );
                      });

                  // ✅ 중복 제거 (API 응답에도 혹시 중복이 있을 수 있으니)
                  groupModels = Array.from(
                    new Map(
                      groupModels.map((m) => [(m["모델코드"] || "").trim(), m]),
                    ).values(),
                  );

                  // ✅ 버튼 렌더링
                  return groupModels.map((item) => {
                    if (!item) return null;

                    const code = (item["모델코드"] || "").trim();
                    const colorName = item["제품색상"] || code;

                    const colors = getProductColorChipColors(colorName);

                    return (
                      <OptionButton
                        key={code}
                        style={{
                          position: "relative",
                          width: "32px",
                          height: "32px",
                          overflow: "hidden",
                          cursor: "pointer",
                          borderRadius: "100%",
                          minWidth: "initial",
                        }}
                        selected={code === idValue}
                        onClick={(e) => {
                          e.preventDefault();
                          router.replace(
                            `/products/${encodeURIComponent(
                              middleValue,
                            )}/${encodeURIComponent(code)}`,
                          );
                        }}
                      >
                        <ColorChipBox
                          colors={colors}
                          data-colorname={colorName}
                        />
                      </OptionButton>
                    );
                  });
                })()}
              </ButtonGroup>
            </Section>

            {/* 계약기간 */}
            <Section>
              <Label>
                계약기간
                <ToolTip
                  title={
                    "고객님이 원하시는 기간을 선택해서 구독할 수 있어요.\n(계약기간 내 무상 A/S 및 케어서비스)"
                  }
                >
                  <svg
                    className="gray--600"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6.875"
                      stroke="black"
                      strokeWidth="1.4"
                      strokeLinecap="square"
                      className="color--stroke"
                    ></circle>
                    <circle
                      cx="8"
                      cy="5.1875"
                      r="0.9375"
                      fill="black"
                      className="color--fill"
                    ></circle>
                    <path
                      d="M8 7.375V11.75"
                      stroke="black"
                      strokeWidth="1.4"
                      className="color--stroke"
                    ></path>
                  </svg>
                </ToolTip>
              </Label>
              <ButtonGroup>
                {allContracts.map((v) => (
                  <OptionButton
                    key={v}
                    style={{ flex: 1 }}
                    selected={contract === v}
                    disabled={!isValidOption("계약기간", v, {})} // 조건 없음
                    onClick={() => {
                      setContract(v);
                      setServiceType("");
                      setServiceCycle("");
                      setPromoType("");
                      setPromoName("");
                      setPrepayRate("");
                    }}
                  >
                    {formatContract(v)}
                  </OptionButton>
                ))}
              </ButtonGroup>
            </Section>
            {/* 서비스유형 */}
            <Section>
              <Label>
                케어서비스 유형
                <ToolTip
                  title={
                    "다양한 케어 서비스 중에서 원하는 옵션을 선택해 보세요."
                  }
                >
                  <svg
                    className="gray--600"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6.875"
                      stroke="black"
                      strokeWidth="1.4"
                      strokeLinecap="square"
                      className="color--stroke"
                    ></circle>
                    <circle
                      cx="8"
                      cy="5.1875"
                      r="0.9375"
                      fill="black"
                      className="color--fill"
                    ></circle>
                    <path
                      d="M8 7.375V11.75"
                      stroke="black"
                      strokeWidth="1.4"
                      className="color--stroke"
                    ></path>
                  </svg>
                </ToolTip>
              </Label>
              <ButtonGroup>
                {allServiceTypes.map((v) => (
                  <OptionButton
                    key={v}
                    selected={serviceType === v}
                    style={{ flex: 1 }}
                    disabled={
                      !isValidOption("서비스유형", v, { 계약기간: contract })
                    }
                    onClick={() => {
                      if (!contract) return;
                      setServiceType(v);
                      setServiceCycle("");
                      setPromoType("");
                      setPromoName("");
                      setPrepayRate("");
                    }}
                  >
                    {v}
                  </OptionButton>
                ))}
              </ButtonGroup>
            </Section>
            {/* 서비스주기 */}
            <Section>
              <Label>
                케어서비스 주기
                <ToolTip
                  title={
                    "제품을 오래 깨끗하게 안심하고 사용하실 수 있도록 정기적으로 관리해드리는 가전 케어 서비스입니다.\n\n방문관리 : 방문주기에 따라 가전 케어 전문가의 관리를 원한다면 추천\n\n자기관리 : 스스로 제품을 관리하고 싶다면 추천"
                  }
                >
                  <svg
                    className="gray--600"
                    width="16"
                    height="16"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
                    <circle
                      cx="8"
                      cy="8"
                      r="6.875"
                      stroke="black"
                      strokeWidth="1.4"
                      strokeLinecap="square"
                      className="color--stroke"
                    ></circle>
                    <circle
                      cx="8"
                      cy="5.1875"
                      r="0.9375"
                      fill="black"
                      className="color--fill"
                    ></circle>
                    <path
                      d="M8 7.375V11.75"
                      stroke="black"
                      strokeWidth="1.4"
                      className="color--stroke"
                    ></path>
                  </svg>
                </ToolTip>
              </Label>
              <ButtonGroup>
                {allCycles.map((v) => (
                  <OptionButton
                    key={v}
                    style={{ flex: 1 }}
                    selected={serviceCycle === v}
                    disabled={
                      !isValidOption("서비스주기/월", v, {
                        계약기간: contract,
                        서비스유형: serviceType,
                      })
                    }
                    onClick={() => {
                      if (!serviceType) return;
                      setServiceCycle(v);
                      setPromoType("");
                      setPromoName("");
                      setPrepayRate("");
                    }}
                  >
                    {v}
                  </OptionButton>
                ))}
              </ButtonGroup>
            </Section>
            {/* 프로모션 대분류 */}
            <Section>
              <Label>프로모션 대분류</Label>
              {promoCategoryList.length > 0 ? (
                <ButtonGroup>
                  {promoCategoryList.map((value) => (
                    <OptionButton
                      key={value}
                      style={{ width: "calc(50% - 4px)" }}
                      selected={promoCategory === value}
                      disabled={
                        !isValidOption("프로모션 대분류", value, {
                          계약기간: contract,
                          서비스유형: serviceType,
                          "서비스주기/월": serviceCycle,
                        })
                      }
                      onClick={() => {
                        if (!serviceCycle) return;
                        selectPromoCategory(value);
                      }}
                    >
                      {value}
                    </OptionButton>
                  ))}
                </ButtonGroup>
              ) : (
                <InfoText>
                  계약/서비스유형/방문주기를 먼저 선택하면 대분류가 나타납니다.
                </InfoText>
              )}
            </Section>

            {/* 프로모션 */}
            <Section>
              <Label>프로모션유형</Label>
              {promoTypeList.length > 0 ? (
                <ButtonGroup>
                  {promoTypeList.map((value) => (
                    <OptionButton
                      style={{ width: "calc(50% - 4px)" }}
                      key={value}
                      selected={promoType === value}
                      disabled={
                        !isValidOption("프로모션유형", value, {
                          계약기간: contract,
                          서비스유형: serviceType,
                          "서비스주기/월": serviceCycle,
                          "프로모션 대분류": promoCategory,
                        })
                      }
                      onClick={() => {
                        if (!serviceCycle || !promoCategory) return;
                        setPromoType(value);
                        setPromoName("");
                        setPrepayRate("");
                      }}
                    >
                      {value}
                    </OptionButton>
                  ))}
                </ButtonGroup>
              ) : (
                <InfoText>먼저 프로모션 대분류를 선택해주세요.</InfoText>
              )}
            </Section>

            {/* 프로모션명 */}
            <Section>
              <Label>프로모션명</Label>
              <div style={{ width: "100%" }}>
                <CustomSelect
                  value={promoName}
                  onChange={(v) => setPromoName(v)}
                  disabled={!promoType}
                  placeholder="선택 안 함"
                  options={[
                    { value: "", label: "선택 안 함" },
                    ...promoNameList.map((v) => ({
                      value: v,
                      label: v,
                    })),
                  ]}
                />
              </div>
            </Section>

            {contract &&
              normalizeNum(contract) === "72" &&
              prepayAvailableRate && (
                <Section>
                  <Label>선납</Label>

                  <div style={{ width: "100%" }}>
                    <CustomSelect
                      value={prepayRate}
                      onChange={(v) => setPrepayRate(v)}
                      placeholder="선택 안 함"
                      disabled={!prepayAvailableRate}
                      options={[
                        { value: "", label: "선택 안 함" },
                        ...(prepayAvailableRate === "30" ||
                        prepayAvailableRate === "30_50"
                          ? [{ value: "30", label: "30% 선납" }]
                          : []),
                        ...(prepayAvailableRate === "30_50"
                          ? [{ value: "50", label: "50% 선납" }]
                          : []),
                      ]}
                    />
                  </div>
                </Section>
              )}

            {/* 제휴카드 할인 */}
            <Section>
              <Label>제휴카드 할인</Label>
              <CustomSelect
                value={selectedCardId}
                onChange={(v) => setSelectedCardId(v)}
                placeholder="선택 안 함"
                options={[
                  { value: "", label: "선택 안 함" }, // 🔥 추가된 부분

                  ...cardDiscounts.map((card) => ({
                    value: card.id,
                    label: (
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontWeight: 600 }}>{card.cardName}</span>
                        <span style={{ color: "#777", fontSize: "13px" }}>
                          월 {card.amount.toLocaleString()}원 할인
                        </span>
                      </div>
                    ),
                  })),
                ]}
              />
            </Section>

            {/* 🔥 구독교원 UI */}
            {teacherPlans.length > 0 && isTeacherAvailable && (
              <Section
                style={{
                  border: "1px solid #eee",
                  padding: "16px",
                  borderRadius: "8px",
                  background: "#fafafa",
                }}
              >
                <Label>구독교원</Label>

                {teacherLoading ? (
                  <InfoText>구독교원 정보를 불러오는 중입니다...</InfoText>
                ) : (
                  <div>
                    {teacherPlans.map((plan) => {
                      const seats = teacherSelections[plan.id] ?? 0;

                      return (
                        <div
                          key={plan.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: "12px",
                            gap: "12px",
                            flexWrap: "wrap",
                          }}
                        >
                          {/* 종류 */}
                          <span
                            style={{
                              fontSize: "14px",
                              fontWeight: 500,
                              minWidth: "100px",
                            }}
                          >
                            {plan.type}
                          </span>

                          {/* 🔥 버튼형 좌수 선택 ( - 0 + ) */}
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: "10px",
                            }}
                          >
                            {/* - 버튼 */}
                            <button
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "6px",
                                border: "1px solid #ddd",
                                background: "#fff",
                                fontSize: "20px",
                                cursor: seats > 0 ? "pointer" : "not-allowed",
                                opacity: seats > 0 ? 1 : 0.4,
                              }}
                              onClick={() =>
                                handleTeacherSeatsChange(
                                  plan.id,
                                  plan.maxSeats,
                                  seats - 1,
                                )
                              }
                              disabled={seats <= 0}
                            >
                              −
                            </button>

                            {/* 현재 구좌 수 */}
                            <span
                              style={{
                                fontSize: "16px",
                                width: "30px",
                                textAlign: "center",
                              }}
                            >
                              {seats}
                            </span>

                            {/* + 버튼 */}
                            <button
                              style={{
                                width: "32px",
                                height: "32px",
                                borderRadius: "6px",
                                border: "1px solid #ddd",
                                background: "#fff",
                                fontSize: "20px",
                                cursor:
                                  seats < plan.maxSeats
                                    ? "pointer"
                                    : "not-allowed",
                                opacity: seats < plan.maxSeats ? 1 : 0.4,
                              }}
                              onClick={() =>
                                handleTeacherSeatsChange(
                                  plan.id,
                                  plan.maxSeats,
                                  seats + 1,
                                )
                              }
                              disabled={seats >= plan.maxSeats}
                            >
                              +
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Section>
            )}

            <Section>
              {/* 🔥 선납금 UI (선납 선택 시에만 노출) */}
              {prepayRate && prepayRate !== "" && prepayAmountDisplay && (
                <SectionFlex>
                  <Label style={{ marginTop: "3px" }}>선납금액</Label>
                  <Prepay>
                    <b>{prepayAmountDisplay.toLocaleString()}</b>원
                  </Prepay>
                </SectionFlex>
              )}

              <div
                style={{
                  marginTop: "8px",
                  fontSize: "13px",
                  fontWeight: 500,
                  textAlign: "right",
                }}
              >
                총 {teacherTotalSeats}구좌 선택, 총 교원 할인액{" "}
                <b>{teacherTotalDiscount.toLocaleString()}</b>원
              </div>
            </Section>

            {/* 가격 */}
            <PriceWrapper
              style={{
                paddingTop: "20px",
                marginTop: "20px",
                borderTop: "1px solid #ddd",
              }}
            >
              <p>이용요금</p>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                1년차 월 요금 기준
                <Price>
                  월
                  <b>{current ? `${finalUsageFee.toLocaleString()}원` : "-"}</b>
                </Price>
              </span>
            </PriceWrapper>

            <PriceWrapper>
              <p>최대혜택가</p>
              <span
                style={{
                  fontSize: "14px",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <PriceSale>
                  월{" "}
                  <b>
                    {current
                      ? `${finalBestPriceWithTeacher.toLocaleString()}원`
                      : "-"}
                  </b>
                </PriceSale>
              </span>
            </PriceWrapper>

            <InfoText>
              혜택은 적용되는 할인 혜택, 제휴 카드사에 따라 다르게 계산되어,
              실제 청약 신청 시 최대 혜택가와 다를 수 있습니다. 상세 내용은
              가전구독 혜택 안내에서 확인이 가능합니다.
            </InfoText>

            <PSTextBox>
              <Text>
                대표요금제 기준이며 요금제에 따라 가전 구독 총 비용이 다를 수
                있음
              </Text>
              <Text>계약기간 동안 무상 A/S</Text>
              <Text>초기 구입비용 0원(계약기간 동안 분할납부)</Text>
              {disclaimerText && <Text>{disclaimerText}</Text>}
              {teacherTotalSeats > 0 && (
                <>
                  <Text>
                    LG구독교원의 가전지원금은 월 구독료 할인이 아닌 결제계좌로
                    캐시백됩니다.
                  </Text>
                  <Text>
                    만기 완납 고객에 한하여 15년차에 원금을 100% 환급받으실 수
                    있으며 중도 해지시 가전구독 지원금이 위약금으로 발생됩니다.
                  </Text>
                  <Text>
                    공정거래위원회 해약 환급금 산정 기준 고지에 따라 선불식
                    할부계약 납입금의 최대 85% 환급됩니다.
                  </Text>
                  <Text>
                    자세한 사항은 담당 매니저님께 문의주시기 바랍니다.
                  </Text>
                </>
              )}
            </PSTextBox>
            <ConsultationButton href="/benefits/service-area">
              상담신청
              <span aria-hidden="true">→</span>
            </ConsultationButton>
          </ProductInfo>
        </ProductDetailWrap>

        {/* ✅ 상세페이지 HTML embed */}
        <ResponsiveSection style={{ marginTop: "240px" }}>
          {id ? (
            <AutoHeightIframe
              src={`/api/product-detail?middle=${middle}&id=${id}`}
              title={`${id} 상세페이지`}
              minHeight={600}
            />
          ) : (
            <div>상세페이지를 불러올 수 없습니다.</div>
          )}
        </ResponsiveSection>
      </Container>
    </>
  );
}

const ThumbnailSwiper = styled.div`
  margin-top: 24px;

  .swiper-slide {
    position: relative;
    width: 90px;
    height: 90px;
  }

  .swiper-slide::before {
    content: "";
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    border: 1px solid #8f8f8f;
    border-radius: 4px;
    pointer-events: none;
    box-sizing: border-box;
  }

  .swiper-slide-thumb-active::before {
    border: 2px solid #000;
  }
`;

// styled-components
const Breadcrumb = styled.nav`
  font-size: 0.85rem;
  color: #555;
  margin-bottom: 1rem;

  a {
    color: #000;
    text-decoration: none;
  }

  a:hover {
    text-decoration: underline;
  }

  span {
    margin: 0 0.25rem;
    color: #aaa;
  }

  strong {
    color: #000;
  }
`;

const Container = styled.div`
  padding: 0 40px;
  max-width: 1460px;
  margin: auto;

  @media (max-width: 499px) {
    padding: 0 16px;
  }
`;
const Title = styled.h1`
  font-size: 28px;
  line-height: 36px;
  padding-right: 80px;
  margin-bottom: 12px;
  font-weight: 800;

  @media (max-width: 768px) {
    font-size: 20px;
    margin-bottom: 6px;
  }
`;
const Share = styled.button`
  position: absolute;
  top: 0;
  right: 0;
  cursor: pointer;
`;
const Model = styled.p`
  font-size: 16px;
  color: #666;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  @media (max-width: 768px) {
    font-size: 12px;

    img {
      width: 16px;
      height: 16px;
    }
  }
`;

const Section = styled.div`
  margin-top: 1.5rem;

  @media (max-width: 768px) {
    margin-top: 1.2rem;
  }
`;
const SectionFlex = styled.div`
  margin-top: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;

  > div {
    margin: 0;
  }

  @media (max-width: 768px) {
    margin-top: 1.2rem;
  }
`;

const Prepay = styled.div`
  font-size: 22px;
  > b {
    font-weight: 500;
  }

  @media (max-width: 768px) {
    font-size: 18px;
  }
`;

const ResponsiveSection = styled(Section)`
  margin-top: 240px;

  @media (max-width: 768px) {
    margin-top: 50px !important;
  }
`;

const Label = styled.div`
  font-size: 15px;
  line-height: 22px;
  color: #111;
  font-weight: 500;
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 6px;

  svg {
    opacity: 0.6;
  }

  @media (max-width: 768px) {
    margin-bottom: 8px;
    font-size: 13px;
  }
`;

const PriceWrapper = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 20px;
  font-weight: 500;

  @media (max-width: 768px) {
    p {
      font-size: 14px;
    }
    span {
      font-size: 12px !important;
    }
  }
`;
const Price = styled.h2`
  color: #000;
  font-size: 24px;
  b {
    font-weight: 700;
  }

  @media (max-width: 768px) {
    font-size: 18px;
  }
`;
const PriceSale = styled.h2`
  color: #ea1917 !important;
  font-size: 24px;
  font-weight: 500;
  font {
    color: #ea1917 !important;
  }
  b {
    font-weight: 700;
  }

  @media (max-width: 768px) {
    font-size: 18px;
  }
`;

const ButtonGroup = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;
const OptionButton = styled.button<{ selected: boolean }>`
  border-radius: 6px;
  font-size: 14px;
  border: 1px solid ${({ selected }) => (selected ? "#000" : "#dee1e5")};
  color: ${({ selected }) => (selected ? "#111" : "#444")};
  font-weight: ${({ selected }) => (selected ? "700" : "400")};
  background: #fff;
  cursor: ${({ disabled }) => (disabled ? "not-allowed" : "pointer")};
  opacity: ${({ disabled }) => (disabled ? 0.5 : 1)};
  height: 48px;
  min-width: 100px;

  @media (max-width: 768px) {
    height: 40px;
    font-size: 13px;
    width: calc(50% - 4px);
  }
`;

const ProductDetailWrap = styled.div`
  display: flex;
  position: relative;
  justify-content: space-between;
  align-items: flex-start;
  gap: 20px;
  @media (max-width: 768px) {
    gap: 24px;

    flex-direction: column;
  }
`;

const ThumbsWrap = styled.div`
  width: 660px;
  overflow: hidden;
  position: sticky;
  top: 0;
  @media (max-width: 1200px) {
    width: calc(50% - 10px);
  }

  @media (max-width: 768px) {
    position: relative;
    width: 100%;
  }
`;

const ProductInfo = styled.div`
  width: 560px;
  @media (max-width: 1200px) {
    width: calc(50% - 10px);
  }

  @media (max-width: 768px) {
    width: 100%;
  }
`;

const InfoText = styled.p`
  font-size: 14px;
  color: #444;
  margin-top: 24px;

  @media (max-width: 768px) {
    font-size: 12px;
  }
`;

const PSTextBox = styled.div`
  margin-top: 24px;
  padding-top: 18px;
  border-radius: 8px;
  font-size: 14px;
  line-height: 23px;
  padding: 24px;
  background-color: #f4f4f4;

  @media (max-width: 768px) {
    font-size: 12px;
  }
`;

const ConsultationButton = styled(Link)`
  width: 100%;
  min-height: 56px;
  margin-top: 14px;
  padding: 0 22px;
  border-radius: 10px;
  border: 1px solid #ea1917;
  background: none;
  color: #ea1917;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 700;
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;

  span {
    color: inherit;
    font-size: 19px;
    line-height: 1;
    transition: transform 0.2s ease;
  }

  &:hover {
    background: #ea1917;
    color: #fff;

    span {
      transform: translateX(3px);
    }
  }

  @media (max-width: 768px) {
    min-height: 52px;
    font-size: 15px;
  }
`;

const Text = styled.p`
  line-height: 1.5;
  font-size: 14px;
  color: #666;
  position: relative;
  padding-left: 11px;

  &::before {
    content: "";
    display: inline-block;
    width: 3px;
    height: 3px;
    background: #666;
    border-radius: 50%;
    position: absolute;
    top: 9px;
    left: 0;
  }

  @media (max-width: 768px) {
    font-size: 12px;
  }
`;

const NonThumnail = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  width: 100%;
  aspect-ratio: 1/1;
`;

const Logo = styled.img`
  width: auto;
  height: 25px;
`;

const ColorChipBox = styled.div<{ colors: string[] }>`
  position: relative;
  width: 32px;
  height: 32px;
  overflow: hidden;
  cursor: pointer;
  border-radius: 100%;

  ${({ colors }) =>
    colors.length === 1
      ? `background: ${colors[0]};`
      : colors.length === 2
        ? `
        background: linear-gradient(to bottom, ${colors[0]} 50%, ${colors[1]} 50%);
      `
        : `background: conic-gradient(${colors
            .map((color, index) => {
              const start = (index / colors.length) * 100;
              const end = ((index + 1) / colors.length) * 100;
              return `${color} ${start}% ${end}%`;
            })
            .join(", ")});
        `}

  &:hover::after {
    content: attr(data-colorname);
    position: absolute;
    top: 100%;
    left: 50%;
    transform: translateX(-50%);
    margin-top: 4px;
    padding: 2px 6px;
    font-size: 12px;
    color: #fff;
    background: rgba(0, 0, 0, 0.75);
    border-radius: 4px;
    white-space: nowrap;
    pointer-events: none;
  }
`;

const CustomSelectWrapper = styled.div`
  position: relative;
  width: 100%;

  &[data-disabled="true"] {
    opacity: 0.6;
    cursor: not-allowed;
  }
`;

const CustomSelectButton = styled.button`
  width: 100%;
  min-height: 40px;
  padding: 8px 12px 8px 12px;
  border-radius: 8px;
  border: 1px solid #ddd;
  background-color: #fff;
  display: flex;
  align-items: center;
  justify-content: space-between;
  text-align: left;
  cursor: pointer;

  font-size: 14px;
  line-height: 1.5;
  color: #222;

  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease,
    background-color 0.15s ease;

  span {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span.placeholder {
    color: #aaa;
  }

  &:hover:not(:disabled) {
    border-color: #bbb;
  }

  &:focus-visible {
    outline: none;
    border-color: #111;
    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.06);
  }

  &:disabled {
    cursor: not-allowed;
    background-color: #f7f7f7;
  }
`;

const ArrowIcon = styled.span`
  margin-left: 8px;
  font-size: 12px;
  flex-shrink: 0;
`;

const CustomSelectDropdown = styled.div`
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 50;
  max-height: 260px;
  overflow-y: auto;
  background-color: #fff;
  border-radius: 8px;
  border: 1px solid #ddd;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
`;

const CustomSelectOptionItem = styled.button`
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: #fff;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  line-height: 1.5;
  color: #222;

  white-space: normal;
  word-break: keep-all;

  &[data-selected="true"] {
    background-color: #f5f5f5;
    font-weight: 500;
  }

  &:hover {
    background-color: #f0f0f0;
  }
`;

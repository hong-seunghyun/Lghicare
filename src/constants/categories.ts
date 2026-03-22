// constants/categories.ts
export type CategoryItem = {
  label: string;
  url: string;
  external?: boolean; //  optional
};

export type SubCategory = {
  name: string;
  url: string;
  items: CategoryItem[];
  external?: boolean; //  optional
};

export type Category = {
  name: string;
  subCategories: SubCategory[];
};

export const categories: Category[] = [
  {
    name: "주방가전",
    subCategories: [
      {
        name: "정수기",
        url: "/products/정수기",
        items: [
          { label: "얼음정수기", url: "/products/정수기/sub?name=얼음정수기" },
          { label: "냉온정수기", url: "/products/정수기/sub?name=냉온정수기" },
          { label: "냉정수기", url: "/products/정수기/sub?name=냉정수기" },
          { label: "정수전용", url: "/products/정수기/sub?name=정수전용" },
          { label: "온정수기", url: "/products/정수기/sub?name=온정수기" },
        ],
      },
      {
        name: "냉장고",
        url: "/products/냉장고",
        items: [
          { label: "STEM", url: "/products/냉장고/sub?name=STEM" },
          { label: "상냉장", url: "/products/냉장고/sub?name=상냉장" },
          { label: "양문형", url: "/products/냉장고/sub?name=양문형" },
          { label: "모던엣지", url: "/products/냉장고/sub?name=모던엣지" },
          { label: "일반냉장고", url: "/products/냉장고/sub?name=일반냉장고" },
          { label: "컨버터블", url: "/products/냉장고/sub?name=컨버터블" },
        ],
      },
      {
        name: "김치냉장고",
        url: "/products/김치냉장고",
        items: [
          { label: "스탠드", url: "/products/김치냉장고/sub?name=스탠드" },
          { label: "뚜껑식", url: "/products/김치냉장고/sub?name=뚜껑식" },
        ],
      },
      {
        name: "식기세척기",
        url: "/products/식기세척기",
        items: [
          { label: "14인용", url: "/products/식기세척기/sub?name=14인용" },
          { label: "12인용", url: "/products/식기세척기/sub?name=12인용" },
        ],
      },
      {
        name: "전기레인지",
        url: "/products/전기레인지",
        items: [
          { label: "인덕션", url: "/products/전기레인지/sub?name=인덕션" },
          { label: "하이브리드", url: "/products/전기레인지/sub?name=하이브리드" },
        ],
      },
      {
        name: "광파오븐",
        url: "/products/광파오븐",
        items: [],
      },
      {
        name: "마이컵",
        url: "/products/마이컵",
        items: [],
      },
    ],
  },
  {
    name: "에어컨/에어케어",
    subCategories: [
      {
        name: "에어컨",
        url: "/products/에어컨",
        items: [
          { label: "스탠드", url: "/products/에어컨/sub?name=스탠드" },
          { label: "2in1", url: "/products/에어컨/sub?name=2in1" },
          { label: "벽걸이형", url: "/products/에어컨/sub?name=벽걸이형" },
        ],
      },
      {
        name: "공기청정기",
        url: "/products/공기청정기",
        items: [
          { label: "360° 공기청정기", url: "/products/공기청정기/sub?name=360공기청정기" },
          { label: "에어로시리즈", url: "/products/공기청정기/sub?name=에어로시리즈" },
          { label: "대형공청기", url: "/products/공기청정기/sub?name=대형공청기" },
          { label: "월핏", url: "/products/공기청정기/sub?name=월핏" },
        ],
      },
      {
        name: "제습기",
        url: "/products/제습기",
        items: [],
      },
      {
        name: "가습기",
        url: "/products/가습기",
        items: [],
      },
      {
        name: "바스에어시스템",
        url: "/products/바스에어시스템",
        items: [],
      },
    ],
  },
  {
    name: "생활가전",
    subCategories: [
      {
        name: "세탁기",
        url: "/products/세탁기",
        items: [
          { label: "드럼세탁기", url: "/products/세탁기/sub?name=드럼세탁기" },
          { label: "통돌이", url: "/products/세탁기/sub?name=통돌이" },
          { label: "미니워시", url: "/products/세탁기/sub?name=미니워시" },
        ],
      },
      {
        name: "워시타워",
        url: "/products/워시타워",
        items: [{ label: "워시타워", url: "/products/워시타워/sub?name=워시타워" },
          { label: "워시타워", url: "/products/워시타워/sub?name=워시타워컴팩트" }
        ],
      },
      {
        name: "워시콤보",
        url: "/products/워시콤보",
        items: [{ label: "워시콤보", url: "/products/워시콤보/sub?name=워시콤보" }],
      },
      {
        name: "의류건조기",
        url: "/products/의류건조기",
        items: [],
      },
      {
        name: "의류관리기",
        url: "/products/의류관리기",
        items: [],
      },
      {
        name: "신발관리기",
        url: "/products/신발관리기",
        items: [],
      },
      {
        name: "청소기",
        url: "/products/청소기",
        items: [
          { label: "무선청소기", url: "/products/청소기/sub?name=무선청소기" },
          { label: "로봇청소기", url: "/products/청소기/sub?name=로봇청소기" },
        ],
      },
      {
        name: "안마의자",
        url: "/products/안마의자",
        items: [
          { label: "전신형", url: "/products/안마의자/sub?name=전신형" },
          { label: "가구형", url: "/products/안마의자/sub?name=가구형" },
        ],
      },
    ],
  },
  {
    name: "TV",
    subCategories: [
      {
        name: "TV",
        url: "/products/TV",
        items: [
          { label: "OLED", url: "/products/TV/sub?name=OLED" },
          { label: "QNED", url: "/products/TV/sub?name=QNED" },
          { label: "스탠바이미", url: "/products/TV/sub?name=스탠바이미" },
        ],
      },
    ],
  },
  {
    name: "고객혜택",
    subCategories: [
      {
        name: "구독 이용 가이드",
        url: "https://lghicaresolution.com/another/rentalService.html", //  네가 직접 URL 지정
        items: [],
      },
      {
        name: "고객혜택",
        url: "https://lghicaresolution.com/another/event/customer.html",
        items: [],
      },
      {
        name: "카드 할인 혜택",
        url: "https://lghicaresolution.com/another/event/card.html",
        items: [],
      },
      {
        name: "신규구독 전단",
        url: "https://lghicaresolution.com/board/%EC%8B%A0%EA%B7%9C%EA%B5%AC%EB%8F%85%20%EC%A0%84%EB%8B%A8/12/",
        items: [],
      },
      {
        name: "통합구독 전단",
        url: "https://lghicaresolution.com/board/%ED%86%B5%ED%95%A9%EA%B5%AC%EB%8F%85%20%EC%A0%84%EB%8B%A8/13/",
        items: [],
      },
      {
        name: "사용자 꿀팁",
        url: "https://www.hi-caresolution.com/user/service/usage.do",
        external: true,
        items: [
          { label: "제품 사용 꿀팁", url: "https://www.hi-caresolution.com/user/service/usage.do",external: true, },
          { label: "LG ThinQ 사용 꿀팁", url: "https://www.hi-caresolution.com/user/service/lgThinQ.do",external: true, },
        ],
      },
    ],
  },
];

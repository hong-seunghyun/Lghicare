import { create } from "zustand";
import { persist } from "zustand/middleware";

interface Variant {
  모델코드: string;
  상품명: string;
  제품색상?: string;
  가격?: string | number;
  thumbnailUrl?: string;
}

interface Product {
  모델코드: string;
  상품명: string;
  제품색상?: string;
  thumbnailUrl?: string;
  selectedOption?: Variant;
}

interface EstimateStore {
  items: Product[];
  addItem: (product: Product) => void;
  removeItem: (modelCode: string) => void;
  clearItems: () => void;
}

const useEstimateStore = create<EstimateStore>()(
  persist(
    (set, get) => ({
      items: [],

      //  제품 담기 (중복 방지)
      addItem: (product) => {
        const exists = get().items.some(
          (p) => p.모델코드 === product.모델코드
        );
        if (exists) return;
        set({ items: [...get().items, product] });
      },

      //  개별 삭제
      removeItem: (modelCode) => {
        set({
          items: get().items.filter((p) => p.모델코드 !== modelCode),
        });
      },

      //  전체 비우기
      clearItems: () => set({ items: [] }),
    }),
    {
      name: "estimate-storage", // localStorage 키
    }
  )
);

export default useEstimateStore;

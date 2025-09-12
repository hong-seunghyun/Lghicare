// src/lib/sheet.ts
import Papa from "papaparse";
import { Product } from "@/types/product";

export async function fetchSheetData(sheetName: string): Promise<Product[]> {
  const url =
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vSbddcvzELdalz6raFQLPAO3-_TMd56tLiD7fZNkcAeV8tMULWgffpTlh8Edtcgj7TOUyjLecrZogkL/pub?output=csv&sheet=" +
    encodeURIComponent(sheetName);

  const res = await fetch(url);
  const text = await res.text();

  // ✅ PapaParse로 안전하게 CSV 파싱
  const { data } = Papa.parse<string[]>(text, { skipEmptyLines: true });

  // ✅ "상품명"이 포함된 행을 헤더로 사용
  const headerIndex = data.findIndex((row: string[]) =>
    row.includes("상품명")
  );
  if (headerIndex === -1) {
    console.warn("❌ 헤더 행을 찾지 못했습니다");
    return [];
  }

  const headers = data[headerIndex];
  const dataRows = data.slice(headerIndex + 1);

  // ✅ Product[] 반환
  return dataRows.map((row: string[]): Product =>
    Object.fromEntries(row.map((val, i) => [headers[i], val])) as Product
  );
}

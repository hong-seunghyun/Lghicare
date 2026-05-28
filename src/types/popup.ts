import type { Timestamp } from "firebase/firestore";

export type PopupStatus = "active" | "inactive";

export type PopupDisplayLocation =
  | "admin_dashboard"
  | "manager_dashboard"
  | "admin_saleshub"
  | "manager_saleshub";

export type PopupDocument = {
  title: string;
  contentHtml: string;
  imageUrl: string | null;
  imageStoragePath?: string | null;
  status: PopupStatus;
  priority?: number;
  startDate: Timestamp;
  endDate: Timestamp;
  displayLocations: PopupDisplayLocation[];
  createdAt?: Timestamp | null;
  updatedAt?: Timestamp | null;
};

export type PopupItem = PopupDocument & {
  id: string;
};

export const popupDisplayLocationLabels: Record<PopupDisplayLocation, string> = {
  admin_dashboard: "/admin 대시보드",
  manager_dashboard: "/manager 대시보드",
  admin_saleshub: "관리자 세일즈허브 게시판",
  manager_saleshub: "매니저 세일즈허브 게시판",
};

export const popupDisplayLocationOptions: {
  value: PopupDisplayLocation;
  label: string;
}[] = [
  { value: "admin_dashboard", label: popupDisplayLocationLabels.admin_dashboard },
  {
    value: "manager_dashboard",
    label: popupDisplayLocationLabels.manager_dashboard,
  },
  { value: "admin_saleshub", label: popupDisplayLocationLabels.admin_saleshub },
  {
    value: "manager_saleshub",
    label: popupDisplayLocationLabels.manager_saleshub,
  },
];

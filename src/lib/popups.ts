import { Timestamp } from "firebase/firestore";
import type { PopupItem } from "@/types/popup";

export const DEFAULT_POPUP_PRIORITY = 100;

export const getPopupPriority = (popup: Pick<PopupItem, "priority">) => {
  const priority = Number(popup.priority);
  return Number.isFinite(priority) ? priority : DEFAULT_POPUP_PRIORITY;
};

export const comparePopupsByPriority = (a: PopupItem, b: PopupItem) => {
  const priorityDiff = getPopupPriority(a) - getPopupPriority(b);
  if (priorityDiff !== 0) return priorityDiff;

  const aTime = a.createdAt?.toDate?.()?.getTime() ?? 0;
  const bTime = b.createdAt?.toDate?.()?.getTime() ?? 0;
  return bTime - aTime;
};

const allowedTags = new Set([
  "A",
  "B",
  "BLOCKQUOTE",
  "BR",
  "DIV",
  "EM",
  "H1",
  "H2",
  "H3",
  "H4",
  "H5",
  "H6",
  "HR",
  "I",
  "IMG",
  "LI",
  "OL",
  "P",
  "PRE",
  "S",
  "SPAN",
  "STRONG",
  "TABLE",
  "TBODY",
  "TD",
  "TH",
  "THEAD",
  "TR",
  "U",
  "UL",
]);

const allowedAttrs = new Set([
  "align",
  "alt",
  "class",
  "colspan",
  "height",
  "href",
  "rel",
  "rowspan",
  "src",
  "style",
  "target",
  "title",
  "width",
]);

const allowedCssProps = new Set([
  "background-color",
  "color",
  "font-size",
  "font-weight",
  "font-style",
  "text-align",
  "text-decoration",
  "line-height",
  "margin-left",
  "margin-right",
  "padding-left",
  "padding-right",
]);

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const isSafeUrl = (value: string) => {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("http://") ||
    normalized.startsWith("https://") ||
    normalized.startsWith("mailto:") ||
    normalized.startsWith("/") ||
    /^data:image\/(png|jpeg|jpg|gif|webp);base64,/i.test(value.trim())
  );
};

const sanitizeStyle = (style: string) =>
  style
    .split(";")
    .map((rule) => rule.trim())
    .filter(Boolean)
    .map((rule) => {
      const [name, ...rawValue] = rule.split(":");
      const prop = name?.trim().toLowerCase();
      const value = rawValue.join(":").trim();
      if (!prop || !value || !allowedCssProps.has(prop)) return "";
      if (/expression|javascript:|url\(/i.test(value)) return "";
      return `${prop}: ${value}`;
    })
    .filter(Boolean)
    .join("; ");

export const sanitizePopupHtml = (html: string) => {
  if (!html) return "";
  if (typeof window === "undefined" || !window.DOMParser) {
    return escapeHtml(html);
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  const walk = (node: Node) => {
    Array.from(node.childNodes).forEach((child) => {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const element = child as HTMLElement;
        if (!allowedTags.has(element.tagName)) {
          element.replaceWith(...Array.from(element.childNodes));
          return;
        }

        Array.from(element.attributes).forEach((attr) => {
          const name = attr.name.toLowerCase();
          const value = attr.value;
          if (
            name.startsWith("on") ||
            !allowedAttrs.has(name) ||
            ((name === "href" || name === "src") && !isSafeUrl(value))
          ) {
            element.removeAttribute(attr.name);
            return;
          }

          if (name === "style") {
            const safeStyle = sanitizeStyle(value);
            if (safeStyle) {
              element.setAttribute("style", safeStyle);
            } else {
              element.removeAttribute("style");
            }
          }
        });

        if (element.tagName === "A") {
          element.setAttribute("rel", "noopener noreferrer");
          if (!element.getAttribute("target")) {
            element.setAttribute("target", "_blank");
          }
        }

        walk(element);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        child.remove();
      }
    });
  };

  walk(doc.body);
  return doc.body.innerHTML;
};

export const toDateInputValue = (value?: Timestamp | Date | null) => {
  if (!value) return "";
  const date = value instanceof Date ? value : value.toDate();
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const dateInputToTimestamp = (value: string, endOfDay = false) => {
  const date = new Date(`${value}T00:00:00`);
  if (endOfDay) date.setHours(23, 59, 59, 999);
  return Timestamp.fromDate(date);
};

export const formatPopupDate = (value?: Timestamp | null) => {
  if (!value) return "-";
  return toDateInputValue(value);
};

export const getLocalDateKey = (date = new Date()) => {
  const yyyy = date.getFullYear();
  const mm = `${date.getMonth() + 1}`.padStart(2, "0");
  const dd = `${date.getDate()}`.padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

export const getPopupHiddenStorageKey = (popupId: string) =>
  `popup_hidden_${popupId}`;

export const isPopupWithinPeriod = (popup: PopupItem, now = new Date()) => {
  const start = popup.startDate?.toDate?.();
  const end = popup.endDate?.toDate?.();
  if (!start || !end) return false;
  return now.getTime() >= start.getTime() && now.getTime() <= end.getTime();
};

export const sanitizeFileName = (name: string) =>
  name.replace(/[^\w.-]+/g, "_").replace(/^_+/, "") || "file";

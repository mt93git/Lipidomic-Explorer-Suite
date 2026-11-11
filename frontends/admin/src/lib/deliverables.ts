// Client deliverables (F4, 0021_deliverables.sql): the files the lab gives a client for an order. Pure rules shared by
// the upload route, the download route, the screens and the demo, so the tests read the same code. The database
// checks every rule again (add_deliverable, the read policies and Storage's admin_files_client_deliverable_read).
import type { AppSession } from "./models";

export const DELIVERABLE_MAX_BYTES = 50 * 1024 * 1024;
export const deliverableKinds = { report: "Report", figure: "Figure", table: "Table", other: "Other" } as const;
export type DeliverableKind = keyof typeof deliverableKinds;

// Extension → content type, exactly admin.deliverable_type in 0021.
export const deliverableTypes: Record<string, string> = {
  pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", svg: "image/svg+xml",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv",
};
export const deliverableAccept = Object.keys(deliverableTypes).map(ext => `.${ext}`).join(",");
const typeLabels: Record<string, string> = {
  "application/pdf": "PDF", "image/png": "PNG", "image/jpeg": "JPEG", "image/svg+xml": "SVG",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX", "text/csv": "CSV",
};
export const typeLabel = (contentType: string) => typeLabels[contentType] ?? "File";

export type Deliverable = {
  id: string; orderCode: string; clientId: string; datasetVersion: number | null; title: string; kind: DeliverableKind;
  fileName: string; contentType: string; sizeBytes: number; sha256: string; storagePath: string;
  visibleToClient: boolean; addedAt: string; addedBy: string | null; retiredAt: string | null; retiredReason: string | null;
};
// What a client reads: no storage path, no staff, no retired rows.
export type ClientDeliverable = Pick<Deliverable, "id" | "title" | "kind" | "fileName" | "contentType" | "sizeBytes" | "addedAt">;
export const forClient = (item: Deliverable): ClientDeliverable =>
  ({ id: item.id, title: item.title, kind: item.kind, fileName: item.fileName, contentType: item.contentType, sizeBytes: item.sizeBytes, addedAt: item.addedAt });
export const clientMaySee = (item: Deliverable) => item.visibleToClient && !item.retiredAt;

export function deliverableType(fileName: string): string | null {
  const ext = /\.([A-Za-z0-9]+)$/.exec(fileName)?.[1]?.toLowerCase();
  return ext ? deliverableTypes[ext] ?? null : null;
}

// The stored name: letters, digits, dot, dash, underscore (0021's rule), the extension kept, 120 characters at most.
export function safeFileName(original: string): string | null {
  const base = original.split(/[\\/]/).pop() ?? "";
  const ext = /\.([A-Za-z0-9]+)$/.exec(base)?.[1]?.toLowerCase();
  if (!ext || !deliverableTypes[ext]) return null;
  const stem = base.slice(0, -(ext.length + 1)).normalize("NFKD").replace(/[^\x00-\x7f]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-{2,}/g, "-").replace(/^[^A-Za-z0-9]+/, "").replace(/[-.]+$/, "");
  const room = 120 - ext.length - 1;
  return `${(stem || "file").slice(0, room).replace(/[-.]+$/, "") || "file"}.${ext}`;
}

// 0021: <client_id>/<order_code>/deliverables/<sha256>/<file_name> in admin-files; add_deliverable computes the same.
export const deliverablePath = (clientId: string, orderCode: string, sha256: string, fileName: string) =>
  `${clientId}/${orderCode}/deliverables/${sha256}/${fileName}`;

// The first bytes must say what the extension says (a renamed HTML page is not a PNG). CSV and SVG are text: CSV must
// not start like markup, SVG must be an SVG document.
export function contentMatches(contentType: string, bytes: Uint8Array): boolean {
  const starts = (...sig: number[]) => sig.every((byte, index) => bytes[index] === byte);
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 1024)).replace(/^﻿/, "").trimStart();
  switch (contentType) {
    case "application/pdf": return starts(0x25, 0x50, 0x44, 0x46, 0x2d); // %PDF-
    case "image/png": return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    case "image/jpeg": return starts(0xff, 0xd8, 0xff);
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": return starts(0x50, 0x4b, 0x03, 0x04); // a zip
    case "image/svg+xml": return /^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head);
    case "text/csv": return !head.startsWith("<") && !bytes.subarray(0, 1024).includes(0);
    default: return false;
  }
}

export type UploadInput = { title: string; kind: string; fileName: string; bytes: Uint8Array; visible: boolean };
export type CheckedUpload = { title: string; kind: DeliverableKind; fileName: string; contentType: string; bytes: Uint8Array; visible: boolean };
export type UploadProblem = "title" | "kind" | "empty" | "size" | "type" | "content";
export function checkUpload(input: UploadInput): { ok: true; value: CheckedUpload } | { ok: false; problem: UploadProblem } {
  const title = input.title.trim();
  if (!title || title.length > 200) return { ok: false, problem: "title" };
  if (!Object.hasOwn(deliverableKinds, input.kind)) return { ok: false, problem: "kind" };
  if (!input.bytes.byteLength) return { ok: false, problem: "empty" };
  if (input.bytes.byteLength > DELIVERABLE_MAX_BYTES) return { ok: false, problem: "size" };
  const fileName = safeFileName(input.fileName);
  const contentType = fileName ? deliverableType(fileName) : null;
  if (!fileName || !contentType) return { ok: false, problem: "type" };
  if (!contentMatches(contentType, input.bytes)) return { ok: false, problem: "content" };
  return { ok: true, value: { title, kind: input.kind as DeliverableKind, fileName, contentType, bytes: input.bytes, visible: input.visible } };
}

// The download guard (the route applies it before reading anything; RLS and Storage apply it again in live mode).
// Lab staff download any deliverable, retired ones too; a client user only a live, visible one of their own client.
export type DownloadDecision = { ok: true } | { ok: false; status: 401 | 403 | 404 };
export function downloadDecision(session: Pick<AppSession, "view" | "clients"> | null, item: Pick<Deliverable, "clientId" | "visibleToClient" | "retiredAt"> | null): DownloadDecision {
  if (!session) return { ok: false, status: 401 };
  if (!item) return { ok: false, status: 404 };
  if (session.view === "staff") return { ok: true };
  // Not found rather than forbidden: a client learns nothing about files it may not read.
  if (!session.clients.some(client => client.id === item.clientId) || !clientMaySee(item as Deliverable)) return { ok: false, status: 404 };
  return { ok: true };
}

// Always a download, never shown in the app's origin: an SVG (or anything else) cannot run script there.
export function downloadHeaders(item: Pick<Deliverable, "fileName" | "contentType" | "sizeBytes">): Record<string, string> {
  const ascii = item.fileName.replace(/[^A-Za-z0-9._-]/g, "_");
  return {
    "Content-Type": item.contentType === "image/svg+xml" ? "application/octet-stream" : item.contentType,
    "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(item.fileName)}`,
    "Content-Length": String(item.sizeBytes),
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Cache-Control": "private, no-store",
  };
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// Open in Nexo for a client: the environment gate (mayOpenInNexo) AND the lab's per-client switch (decision 1).
export const clientMayOpenNexo = (environmentGate: boolean, nexoAccess: boolean) => environmentGate && nexoAccess;

// The notices after an upload (the route redirects back with ?deliverable=<key>); only these keys are ever shown.
export const uploadNotices: Record<string, { tone: "success" | "error"; text: string }> = {
  added: { tone: "success", text: "File added. It stays hidden from the client until you show it." },
  "added-visible": { tone: "success", text: "File added and shown to the client." },
  title: { tone: "error", text: "Give the file a title (200 characters at most). Nothing was added." },
  kind: { tone: "error", text: "Choose a kind: report, figure, table or other. Nothing was added." },
  empty: { tone: "error", text: "Choose a file to upload." },
  size: { tone: "error", text: "A deliverable is 50 MB at most. Nothing was added." },
  type: { tone: "error", text: "Deliverables are PDF, PNG, JPEG, SVG, XLSX or CSV files. Nothing was added." },
  content: { tone: "error", text: "The file's content does not match its type (for example a renamed file). Nothing was added." },
  duplicate: { tone: "error", text: "That file is already a deliverable of this order." },
  closed: { tone: "error", text: "Files can be added only to an accepted, open order." },
  failed: { tone: "error", text: "The file could not be stored. Nothing was added; try again." },
  "demo-size": { tone: "error", text: "The demo keeps files of 5 MB at most. Nothing was added." },
  "not-found": { tone: "error", text: "That order was not found. Nothing was added." },
  shown: { tone: "success", text: "The client now sees this file." },
  hidden: { tone: "success", text: "The file is hidden from the client." },
  retired: { tone: "success", text: "File retired. The client no longer sees it; the lab keeps the record and the file." },
};

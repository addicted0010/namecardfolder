"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { useParams, useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Trash2,
  Save,
  Wand2,
  FileText,
} from "lucide-react";
import { LlmLogViewer } from "@/components/debug/llm-log-viewer";

interface CardImage {
  id: string;
  storageUrl: string;
  imageUrl?: string;
  side: string;
  mimeType: string;
}

interface CardData {
  id: string;
  fullName: string | null;
  nameReading: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  mobilePhone: string | null;
  address: string | null;
  website: string | null;
  department: string | null;
  fax: string | null;
  notes: string | null;
  rawText: string | null;
  recognitionStatus: string;
  createdAt: string;
  images: CardImage[];
  llmLogs: { id: string; provider: string; model: string; durationMs: number; responseStatus: number; createdAt: string }[];
}

export default function CardDetailPage() {
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const td = useTranslations("debug");
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const autoRecognized = useRef(false);
  const [card, setCard] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [recognizing, setRecognizing] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const id = params.id as string;

  useEffect(() => {
    fetchCard();
  }, [id]);

  // Auto-trigger recognition when navigated from upload with ?autoRecognize=1
  useEffect(() => {
    if (
      !autoRecognized.current &&
      card &&
      searchParams.get("autoRecognize") === "1" &&
      card.recognitionStatus === "PENDING" &&
      card.images.length > 0
    ) {
      autoRecognized.current = true;
      handleRecognize();
    }
  }, [card, searchParams]);

  async function fetchCard() {
    try {
      const res = await fetch(`/api/cards/${id}`);
      if (!res.ok) throw new Error("Failed to load card");
      const data = await res.json();
      setCard(data);
      setForm({
        fullName: data.fullName || "",
        nameReading: data.nameReading || "",
        company: data.company || "",
        title: data.title || "",
        email: data.email || "",
        phone: data.phone || "",
        mobilePhone: data.mobilePhone || "",
        address: data.address || "",
        website: data.website || "",
        department: data.department || "",
        fax: data.fax || "",
        notes: data.notes || "",
      });
    } catch {
      toast.error(tc("error"));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/cards/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCard(data);
      toast.success(t("saveSuccess"));
      router.push("/cards");
    } catch (e) {
      console.error("Save failed:", e);
      toast.error(e instanceof Error ? e.message : tc("error"));
    } finally {
      setSaving(false);
    }
  }

  async function handleRecognize() {
    setRecognizing(true);
    try {
      const res = await fetch(`/api/cards/${id}/recognize`, { method: "POST" });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setCard(data);
      setForm({
        fullName: data.fullName || "",
        nameReading: data.nameReading || "",
        company: data.company || "",
        title: data.title || "",
        email: data.email || "",
        phone: data.phone || "",
        mobilePhone: data.mobilePhone || "",
        address: data.address || "",
        website: data.website || "",
        department: data.department || "",
        fax: data.fax || "",
        notes: data.notes || "",
      });
      toast.success(t("recognizeSuccess"));
    } catch (e) {
      console.error("Recognition failed:", e);
      toast.error(e instanceof Error ? e.message : t("recognizeFailed"));
    } finally {
      setRecognizing(false);
    }
  }

  async function handleDelete() {
    if (!confirm(t("deleteConfirm"))) return;
    try {
      const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(t("deleteSuccess"));
      router.push("/cards");
    } catch {
      toast.error(tc("error"));
    }
  }

  const fields: { key: string; label: string }[] = [
    { key: "fullName", label: t("fullName") },
    { key: "nameReading", label: t("nameReading") },
    { key: "company", label: t("company") },
    { key: "title", label: t("jobTitle") },
    { key: "department", label: t("department") },
    { key: "email", label: t("email") },
    { key: "phone", label: t("phone") },
    { key: "mobilePhone", label: t("mobilePhone") },
    { key: "fax", label: t("fax") },
    { key: "website", label: t("website") },
    { key: "address", label: t("address") },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!card) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500">{tc("noData")}</p>
      </div>
    );
  }

  const frontImage = card.images.find((img) => img.side === "FRONT");
  const backImage = card.images.find((img) => img.side === "BACK");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/cards")}
          className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="w-4 h-4" />
          {tc("back")}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowLogs(true)}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
          >
            <FileText className="w-4 h-4" />
            {td("viewLogs")}
          </button>
          <button
            onClick={handleRecognize}
            disabled={recognizing || card.images.length === 0}
            className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            {recognizing ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Wand2 className="w-4 h-4" />
            )}
            {card.recognitionStatus === "SUCCESS" ? t("reRecognize") : t("recognize")}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 min-[480px]:grid-cols-[280px_1fr] gap-6">
        {/* Images */}
        <div className="space-y-3">
          {frontImage && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-1.5 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-700">{t("front")}</span>
              </div>
              <img
                src={frontImage.imageUrl || `/api/images/${frontImage.id}`}
                alt="Front"
                className="w-full"
              />
            </div>
          )}
          {backImage && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-1.5 border-b border-gray-100">
                <span className="text-xs font-medium text-gray-700">{t("back")}</span>
              </div>
              <img
                src={backImage.imageUrl || `/api/images/${backImage.id}`}
                alt="Back"
                className="w-full"
              />
            </div>
          )}
        </div>

        {/* Edit form */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
          {fields.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {label}
              </label>
              <input
                type="text"
                value={form[key] || ""}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          ))}

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("notes")}
            </label>
            <textarea
              value={form.notes || ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />
          </div>

          {/* Raw text */}
          {card.rawText && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("rawText")}
              </label>
              <p className="text-sm text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap">
                {card.rawText}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              <Save className="w-4 h-4" />
              {tc("save")}
            </button>
            <button
              onClick={handleDelete}
              className="px-4 py-2 border border-red-300 text-red-600 rounded-lg text-sm font-medium hover:bg-red-50 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              {tc("delete")}
            </button>
          </div>
        </div>
      </div>

      {/* LLM Log Viewer Modal */}
      {showLogs && (
        <LlmLogViewer
          cardId={id}
          onClose={() => setShowLogs(false)}
        />
      )}
    </div>
  );
}

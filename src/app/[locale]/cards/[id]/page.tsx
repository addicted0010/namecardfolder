"use client";

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import {
  ArrowLeft,
  Camera,
  Loader2,
  Trash2,
  Save,
  FileText,
} from "lucide-react";
import { LlmLogViewer } from "@/components/debug/llm-log-viewer";
import { CardUpload } from "@/components/cards/card-upload";

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
  source: string | null;
  rawText: string | null;
  recognitionStatus: string;
  createdAt: string;
  images: CardImage[];
  llmLogs: { id: string; provider: string; model: string; durationMs: number; responseStatus: number; createdAt: string }[];
}

interface DailyCreditStatus {
  limit: number | null;
  remaining: number | null;
  isUnlimited: boolean;
}

export default function CardDetailPage() {
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const td = useTranslations("debug");
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const [card, setCard] = useState<CardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showUpdate, setShowUpdate] = useState(false);
  const [creditStatus, setCreditStatus] = useState<DailyCreditStatus | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  const id = params.id as string;

  useEffect(() => {
    async function loadCard() {
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
          source: data.source || "",
        });
      } catch {
        toast.error(tc("error"));
      } finally {
        setLoading(false);
      }
    }

    loadCard();
  }, [id, tc]);

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

  async function handleDelete() {
    if (!confirm(t("deleteCardConfirm"))) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/cards/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success(t("deleteSuccess"));
      router.push("/cards");
    } catch {
      toast.error(tc("error"));
      setDeleting(false);
    }
  }

  async function handleOpenUpdate() {
    try {
      const res = await fetch("/api/credits");
      if (res.ok) {
        const data = await res.json();
        setCreditStatus(data.creditStatus);
      }
    } catch {
      setCreditStatus(null);
    }
    setShowUpdate(true);
  }

  async function handleUpdateComplete(
    frontImageId?: string,
    backImageId?: string,
    source?: string
  ) {
    const res = await fetch(`/api/cards/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frontImageId, backImageId, source }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const message =
        data?.error?.code === "DAILY_CREDIT_LIMIT_EXCEEDED"
          ? t("creditLimitExceeded")
          : data?.error?.message || t("updateFailed");
      throw new Error(message);
    }

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
      source: data.source || "",
    });
    setShowUpdate(false);
    if (data.creditStatus) {
      setCreditStatus(data.creditStatus);
      window.dispatchEvent(new Event("cardvault:credits-updated"));
    }
    toast.success(
      data.recognitionResult === "SUCCESS" ? t("updateSuccess") : t("updateRecognitionPending")
    );
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
          {user?.isAdmin && (
            <button
              onClick={() => setShowLogs(true)}
              className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-1.5"
            >
              <FileText className="w-4 h-4" />
              {td("viewLogs")}
            </button>
          )}
          <button
            onClick={handleOpenUpdate}
            disabled={deleting}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5"
          >
            <Camera className="w-4 h-4" />
            {t("update")}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50 flex items-center gap-1.5"
          >
            {deleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            {tc("delete")}
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

          {/* Source */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("source")}
            </label>
            <textarea
              value={form.source || ""}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              rows={2}
              placeholder={t("sourcePlaceholder")}
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
          </div>
        </div>
      </div>

      {showUpdate && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md my-8">
            <CardUpload
              onUploadComplete={handleUpdateComplete}
              onClose={() => setShowUpdate(false)}
              creditStatus={creditStatus}
              initialSource={form.source || ""}
              title={t("updateCard")}
              submitLabel={t("update")}
            />
          </div>
        </div>
      )}

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

"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { toast } from "sonner";
import { Plus, Loader2 } from "lucide-react";
import { CardList } from "@/components/cards/card-list";
import { CardSearch } from "@/components/cards/card-search";
import { CardUpload } from "@/components/cards/card-upload";

interface CardImage {
  id: string;
  storageUrl: string;
  side: string;
}

interface CardData {
  id: string;
  fullName: string | null;
  company: string | null;
  title: string | null;
  email: string | null;
  phone: string | null;
  recognitionStatus: string;
  images: CardImage[];
  createdAt: string;
}

export default function CardsPage() {
  const t = useTranslations("cards");
  const router = useRouter();
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchCards = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "12" });
      if (search) params.set("q", search);
      const res = await fetch(`/api/cards?${params}`);
      if (!res.ok) throw new Error("Failed to fetch cards");
      const data = await res.json();
      setCards(data.data);
      setTotalPages(data.pagination.totalPages);
    } catch {
      toast.error("Failed to load cards");
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchCards();
  }, [fetchCards]);

  async function handleUploadComplete(frontId?: string, backId?: string) {
    setCreating(true);
    try {
      // Create card with uploaded images
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontImageId: frontId, backImageId: backId }),
      });

      if (!res.ok) throw new Error("Failed to create card");
      const card = await res.json();

      // Navigate to detail page and auto-trigger recognition
      setShowUpload(false);
      router.push(`/cards/${card.id}?autoRecognize=1`);
    } catch {
      toast.error("Failed to create card");
    } finally {
      setCreating(false);
    }
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <button
          onClick={() => setShowUpload(true)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors flex items-center gap-2 shrink-0"
        >
          {creating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
          {t("upload")}
        </button>
      </div>

      {/* Search */}
      <CardSearch value={search} onChange={handleSearchChange} />

      {/* Card list */}
      <CardList cards={cards} loading={loading} hasSearch={!!search} />

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            &lt;
          </button>
          <span className="text-sm text-gray-600 px-3">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            &gt;
          </button>
        </div>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-md my-8">
            <CardUpload
              onUploadComplete={handleUploadComplete}
              onClose={() => setShowUpload(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

"use client";

import { useState, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Loader2, Plus, X, Trash2, Upload } from "lucide-react";
import { CardList } from "@/components/cards/card-list";
import { CardSearch } from "@/components/cards/card-search";
import { CardUpload } from "@/components/cards/card-upload";

interface CardImage {
  id: string;
  storageUrl: string;
  imageUrl?: string;
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
  viewedAt: string | null;
  images: CardImage[];
  createdAt: string;
}

export default function CardsPage() {
  const t = useTranslations("cards");
  const tc = useTranslations("common");
  const [cards, setCards] = useState<CardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [showUpload, setShowUpload] = useState(false);
  const [creating, setCreating] = useState(false);
  const [fabOpen, setFabOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

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

  async function handleUploadComplete(frontId?: string, backId?: string, source?: string) {
    setCreating(true);
    try {
      // Create card with uploaded images (recognition is triggered automatically in background)
      const res = await fetch("/api/cards", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontImageId: frontId, backImageId: backId, source }),
      });

      if (!res.ok) throw new Error("Failed to create card");

      // Close upload modal and refresh card list
      setShowUpload(false);
      setFabOpen(false);
      toast.success(t("uploadSuccess"));
      await fetchCards();
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

  function handleFabToggle() {
    if (fabOpen) {
      setFabOpen(false);
      if (selectMode) {
        setSelectMode(false);
        setSelectedIds(new Set());
      }
    } else {
      setFabOpen(true);
    }
  }

  function handleDeleteSubClick() {
    if (selectMode) {
      if (selectedIds.size > 0) setDeleteConfirmOpen(true);
    } else {
      setSelectMode(true);
    }
  }

  function handleToggleCard(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBatchDelete() {
    setDeleting(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) => fetch(`/api/cards/${id}`, { method: "DELETE" }))
      );
      toast.success(t("deleteSuccess"));
      setDeleteConfirmOpen(false);
      setSelectMode(false);
      setSelectedIds(new Set());
      setFabOpen(false);
      await fetchCards();
    } catch {
      toast.error(t("deleteFailed"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Search — sticky below header */}
      <div className="sticky top-14 z-30 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 py-3 bg-white border-b border-gray-100">
        <CardSearch value={search} onChange={handleSearchChange} />
      </div>

      {/* Card list */}
      <CardList
        cards={cards}
        loading={loading}
        hasSearch={!!search}
        selectMode={selectMode}
        selectedIds={selectedIds}
        onToggle={handleToggleCard}
      />

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

      {/* Delete confirmation modal */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm space-y-4">
            <h3 className="text-base font-semibold text-gray-900">{t("deleteConfirm")}</h3>
            <p className="text-sm text-gray-600">
              {t("deleteBatchConfirm", { count: selectedIds.size })}
            </p>
            <div className="flex gap-3 pt-1">
              <button
                onClick={handleBatchDelete}
                disabled={deleting}
                className="flex-1 py-2 px-4 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 className="w-4 h-4 animate-spin" />}
                {tc("delete")}
              </button>
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 py-2 px-4 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {tc("cancel")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-3">
        {/* Sub-buttons — always mounted, visibility controlled by CSS transition */}
        <div
          className={`flex flex-col items-center gap-3 transition-all duration-200 ${
            fabOpen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3 pointer-events-none"
          }`}
        >
          {/* Delete sub-button (top, furthest from FAB = safer position) */}
          <button
            onClick={handleDeleteSubClick}
            className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition-colors ${
              selectMode ? "bg-red-500 hover:bg-red-600" : "bg-gray-700 hover:bg-gray-800"
            }`}
          >
            <Trash2 className="w-5 h-5 text-white" />
          </button>
          {/* Upload sub-button (bottom, closest to FAB = most accessible) */}
          <button
            onClick={() => { setFabOpen(false); setShowUpload(true); }}
            className="w-12 h-12 rounded-full bg-gray-700 hover:bg-gray-800 shadow-lg flex items-center justify-center transition-colors"
          >
            <Upload className="w-5 h-5 text-white" />
          </button>
        </div>
        {/* Main FAB */}
        <button
          onClick={handleFabToggle}
          className="w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 shadow-xl flex items-center justify-center transition-all"
        >
          {fabOpen ? <X className="w-6 h-6 text-white" /> : <Plus className="w-6 h-6 text-white" />}
        </button>
      </div>
    </div>
  );
}

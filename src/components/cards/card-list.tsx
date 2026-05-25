"use client";

import { useTranslations } from "next-intl";
import { CardItem } from "./card-item";
import { CreditCard } from "lucide-react";

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

interface CardListProps {
  cards: CardData[];
  loading: boolean;
  hasSearch: boolean;
}

export function CardList({ cards, loading, hasSearch }: CardListProps) {
  const t = useTranslations("cards");

  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white border border-gray-200 rounded-xl overflow-hidden animate-pulse">
            <div className="aspect-[3/2] bg-gray-200" />
            <div className="p-3 space-y-2">
              <div className="h-4 bg-gray-200 rounded w-3/4" />
              <div className="h-3 bg-gray-200 rounded w-1/2" />
              <div className="h-3 bg-gray-200 rounded w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <div className="text-center py-16">
        <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="text-gray-500 text-lg">
          {hasSearch ? t("noResults") : t("noCards")}
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {cards.map((card) => (
        <CardItem key={card.id} card={card} />
      ))}
    </div>
  );
}

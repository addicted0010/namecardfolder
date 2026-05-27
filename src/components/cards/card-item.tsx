"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { User, Building2, Mail, Phone, Check } from "lucide-react";

interface CardImage {
  id: string;
  storageUrl: string;
  side: string;
}

interface CardItemData {
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

export function CardItem({
  card,
  selectMode = false,
  selected = false,
  onToggle,
}: {
  card: CardItemData;
  selectMode?: boolean;
  selected?: boolean;
  onToggle?: (id: string) => void;
}) {
  const t = useTranslations("cards");
  const frontImage = card.images.find((img) => img.side === "FRONT");

  const thumbnail = (
    <div className="aspect-[3/2] bg-gray-100 relative overflow-hidden">
      {frontImage ? (
        <img
          src={`/api/images/${frontImage.id}`}
          alt={card.fullName || "Business card"}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <User className="w-12 h-12 text-gray-300" />
        </div>
      )}
      {/* Status badge */}
      {card.recognitionStatus === "PROCESSING" && (
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full">
          {t("statusProcessing")}
        </div>
      )}
      {card.recognitionStatus === "FAILED" && (
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-red-100 text-red-800 text-xs rounded-full">
          {t("statusFailed")}
        </div>
      )}
      {/* Selection checkbox */}
      {selectMode && (
        <div className="absolute top-2 left-2">
          <div
            className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${
              selected ? "bg-blue-600 border-blue-600" : "bg-white/70 border-white"
            }`}
          >
            {selected && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
          </div>
        </div>
      )}
    </div>
  );

  const info = (
    <div className="p-3 space-y-1.5">
      <h3 className="font-medium text-gray-900 truncate">
        {card.fullName || <span className="text-gray-400">{t("fullName")}</span>}
      </h3>
      {card.company && (
        <div className="flex items-center gap-1.5 text-sm text-gray-600">
          <Building2 className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{card.company}</span>
        </div>
      )}
      {card.title && (
        <p className="text-sm text-gray-500 truncate">{card.title}</p>
      )}
      <div className="flex items-center gap-3 pt-1">
        {card.email && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Mail className="w-3 h-3" />
            <span className="truncate max-w-[120px]">{card.email}</span>
          </div>
        )}
        {card.phone && (
          <div className="flex items-center gap-1 text-xs text-gray-500">
            <Phone className="w-3 h-3" />
            <span className="truncate max-w-[100px]">{card.phone}</span>
          </div>
        )}
      </div>
    </div>
  );

  if (selectMode) {
    return (
      <div
        onClick={() => onToggle?.(card.id)}
        className={`bg-white border rounded-xl overflow-hidden cursor-pointer transition-all ${
          selected
            ? "border-blue-500 ring-2 ring-blue-200"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {thumbnail}
        {info}
      </div>
    );
  }

  return (
    <Link
      href={`/cards/${card.id}`}
      className="block bg-white border border-gray-200 rounded-xl overflow-hidden hover:shadow-md hover:border-gray-300 transition-all group"
    >
      {thumbnail}
      {info}
    </Link>
  );
}

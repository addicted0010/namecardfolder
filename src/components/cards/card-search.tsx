"use client";

import { useTranslations } from "next-intl";
import { Search, X } from "lucide-react";
import { useState, useEffect, useRef } from "react";

interface CardSearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function CardSearch({ value, onChange }: CardSearchProps) {
  const t = useTranslations("cards");
  const [localValue, setLocalValue] = useState(value);

  // Keep the latest onChange in a ref so the debounce timer below only
  // resets when the input text actually changes, not whenever the parent
  // re-renders and passes a new (but equivalent) onChange function.
  // Otherwise unrelated parent state updates (e.g. pagination) would
  // reschedule this timer and eventually re-fire onChange, resetting page.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    const timer = setTimeout(() => {
      onChangeRef.current(localValue);
    }, 300);
    return () => clearTimeout(timer);
  }, [localValue]);

  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <input
        type="text"
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        placeholder={t("searchPlaceholder")}
        className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      {localValue && (
        <button
          onClick={() => {
            setLocalValue("");
            onChange("");
          }}
          className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded"
        >
          <X className="w-3.5 h-3.5 text-gray-400" />
        </button>
      )}
    </div>
  );
}

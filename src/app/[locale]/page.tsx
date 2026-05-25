import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { CreditCard, Upload, Search } from "lucide-react";

export default function HomePage() {
  const t = useTranslations("cards");
  const tc = useTranslations("common");

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className="text-center py-8">
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center">
            <CreditCard className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <h1 className="text-3xl font-bold text-gray-900 mb-2">CardVault</h1>
        <p className="text-gray-500 text-lg">
          {t("title")}
        </p>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto">
        <Link
          href="/cards?action=upload"
          className="flex items-center gap-4 p-6 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center shrink-0">
            <Upload className="w-6 h-6 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{t("upload")}</h3>
            <p className="text-sm text-gray-500">{t("uploadHint")}</p>
          </div>
        </Link>

        <Link
          href="/cards"
          className="flex items-center gap-4 p-6 bg-white border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all"
        >
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center shrink-0">
            <Search className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{tc("search")}</h3>
            <p className="text-sm text-gray-500">{t("searchPlaceholder")}</p>
          </div>
        </Link>
      </div>
    </div>
  );
}

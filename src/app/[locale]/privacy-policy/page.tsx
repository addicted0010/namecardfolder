import { useTranslations } from "next-intl";

export default function PrivacyPolicyPage() {
  const t = useTranslations("privacy");

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-sm text-gray-500 mb-8">
        {t("lastUpdated", { date: "2026/05/31" })}
      </p>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("intro.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300">{t("intro.content")}</p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("collect.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-2">
          {t("collect.content")}
        </p>
        <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-1">
          <li>{t("collect.item1")}</li>
          <li>{t("collect.item2")}</li>
          <li>{t("collect.item3")}</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("usage.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300 mb-2">
          {t("usage.content")}
        </p>
        <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-1">
          <li>{t("usage.item1")}</li>
          <li>{t("usage.item2")}</li>
          <li>{t("usage.item3")}</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("sharing.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("sharing.content")}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("security.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("security.content")}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("rights.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("rights.content")}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("cookies.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("cookies.content")}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("changes.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("changes.content")}
        </p>
      </section>
    </div>
  );
}

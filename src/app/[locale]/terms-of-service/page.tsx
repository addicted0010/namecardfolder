import { useTranslations } from "next-intl";

export default function TermsOfServicePage() {
  const t = useTranslations("terms");

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-2">{t("title")}</h1>
      <p className="text-sm text-gray-500 mb-8">
        {t("lastUpdated", { date: "2026/05/31" })}
      </p>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("acceptance.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("acceptance.content")}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">
          {t("description.title")}
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("description.content")}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">
          {t("responsibilities.title")}
        </h2>
        <p className="text-gray-700 dark:text-gray-300 mb-2">
          {t("responsibilities.content")}
        </p>
        <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-1">
          <li>{t("responsibilities.item1")}</li>
          <li>{t("responsibilities.item2")}</li>
          <li>{t("responsibilities.item3")}</li>
          <li>{t("responsibilities.item4")}</li>
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("ip.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300">{t("ip.content")}</p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">
          {t("disclaimer.title")}
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("disclaimer.content")}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">{t("liability.title")}</h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("liability.content")}
        </p>
      </section>

      <section className="mb-6">
        <h2 className="text-xl font-semibold mb-2">
          {t("termination.title")}
        </h2>
        <p className="text-gray-700 dark:text-gray-300">
          {t("termination.content")}
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

import { useTranslations } from "next-intl";
import { OwnResultFallback } from "@/components/result/own-result-fallback";
import { Link } from "@/i18n/navigation";

/** Resultado inexistente o no público. Si es la partida del propio jugador sancionado, se la enseña (spec 5d §5). */
export default function ResultNotFound() {
  const t = useTranslations("Share");
  return (
    <OwnResultFallback>
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{t("notFoundTitle")}</h1>
        <p className="text-zinc-600 dark:text-zinc-400">{t("notFoundText")}</p>
        <Link href="/" className="self-start font-medium underline">
          {t("notFoundHome")}
        </Link>
      </div>
    </OwnResultFallback>
  );
}

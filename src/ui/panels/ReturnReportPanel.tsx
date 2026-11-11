import type { ResourceId } from "../../game/content/defs";
import type { ReturnReport } from "../../game/simulation/offline";
import { RESOURCE_LABEL, formatDuration, formatNumber } from "../text";
import { t } from "../../game/content/strings";
import { Row } from "./shared";

export function ReturnReportPanel(props: {
  report: ReturnReport;
  onClose: () => void;
}) {
  const report = props.report;
  const gains = Object.entries(report.gains) as [ResourceId, number][];
  const summary = [
    t("report.away", { duration: formatDuration(report.awayTicks) }),
    report.capped
      ? t("report.workedCapped", { duration: formatDuration(report.creditedTicks) })
      : t("report.worked", { duration: formatDuration(report.creditedTicks) }),
  ];
  return (
    <div className="panel panel--report" role="group" aria-label={t("aria.returnReport")}>
      <div className="panel__head">
        <h2 className="panel__title">{t("title.report")}</h2>
        <button className="icon-btn" onClick={props.onClose}>
          {t("btn.backToYard")}
        </button>
      </div>
      <div className="panel__body">
      <dl>
        {summary.map((line) => (
          <Row key={line} label={t("row.time")} value={line} />
        ))}
        {gains.slice(0, 4).map(([key, value]) => (
          <Row key={key} label={RESOURCE_LABEL[key] ?? key} value={`+${formatNumber(value)}`} />
        ))}
        <Row label={t("row.deliveries")} value={report.deliveries} />
        <Row label={t("row.batches")} value={report.batchesDone} />
        {report.bottleneck ? (
          <Row label={t("row.bottleneck")} value={t(`bottleneck.${report.bottleneck}`)} />
        ) : null}
      </dl>
      </div>
    </div>
  );
}
const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;

export function formatJapanTime(timestamp) {
  return new Date(timestamp + 9 * 60 * 60 * 1000).toISOString().slice(0, 16).replace("T", " ");
}

export function reportWindow(now = Date.now()) {
  // Report times have minute precision. Round the lower bound up to keep the
  // window exactly 24 hours, including its boundary only when seconds are zero.
  return {
    start: formatJapanTime(Math.ceil((now - DAY_MS) / MINUTE_MS) * MINUTE_MS),
    end: formatJapanTime(now),
  };
}

export function reportStatus(reports, now = Date.now()) {
  const { start, end } = reportWindow(now);
  const isRecent = (value) => typeof value === "string" && value >= start && value <= end;
  const latestTime = reports[0]?.report_time;
  if (typeof latestTime !== "string" || latestTime > end) {
    return { tone: "red", label: "时间异常", description: "最近报告时间无效或晚于当前日本时间" };
  }
  if (!isRecent(latestTime)) {
    return { tone: "red", label: "超过24小时", description: "最近一份报告距离当前日本时间已超过24小时" };
  }
  if (reports.length === 1) {
    return { tone: "green", label: "新账号", description: "只有一份报告，且报告时间在最近24小时内" };
  }
  const increased = reports.some((report, index) =>
    index + 1 < reports.length && isRecent(report.report_time) &&
    report.total_points > reports[index + 1].total_points,
  );
  return increased
    ? { tone: "green", label: "24h 内有增长", description: "最近报告在24小时内，且24小时内曾有积分提升" }
    : { tone: "yellow", label: "24h 内无增长", description: "最近报告在24小时内，但24小时内未发现积分提升" };
}

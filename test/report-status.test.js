import assert from "node:assert/strict";
import { test } from "node:test";
import { formatJapanTime, reportStatus, reportWindow } from "../src/report-status.js";
import { renderPage } from "../src/page.js";

const NOW = Date.parse("2026-11-13T12:00:00+09:00");
const reports = (entries) => entries.map(([report_time, total_points]) => ({ report_time, total_points }));

const cases = [
  ["a first recent report is green, including zero points", [["2026-11-13 11:00", 0]], "green"],
  ["an increase against the immediately previous report is green", [["2026-11-13 11:00", 120], ["2026-11-13 10:00", 100]], "green"],
  ["flat latest points stay green after an earlier increase in the window", [["2026-11-13 11:00", 120], ["2026-11-13 09:00", 120], ["2026-11-13 08:00", 100]], "green"],
  ["a later decrease does not erase an increase within the window", [["2026-11-13 11:00", 110], ["2026-11-13 09:00", 120], ["2026-11-13 08:00", 100]], "green"],
  ["an increase may use a baseline from before the window", [["2026-11-13 11:00", 120], ["2026-11-12 10:00", 100]], "green"],
  ["equal points in recent reports are yellow", [["2026-11-13 11:00", 100], ["2026-11-13 10:00", 100]], "yellow"],
  ["decreasing points without another increase are yellow", [["2026-11-13 11:00", 90], ["2026-11-13 10:00", 100]], "yellow"],
  ["an increase older than 24 hours cannot make fresh flat reports green", [["2026-11-13 11:00", 120], ["2026-11-12 11:59", 120], ["2026-11-12 10:00", 100]], "yellow"],
  ["an old first report is red", [["2026-11-12 11:59", 100]], "red"],
  ["an old latest report stays red even if it increased", [["2026-11-12 11:59", 120], ["2026-11-12 10:00", 100]], "red"],
  ["a future latest report is red", [["2026-11-13 12:01", 120]], "red"],
  ["future historical increases are outside the window", [["2026-11-13 11:00", 120], ["2026-11-13 12:01", 120], ["2026-11-13 10:00", 100]], "yellow"],
  ["exactly 24 hours is included for a first report", [["2026-11-12 12:00", 100]], "green"],
  ["exactly 24 hours is included for a growth event", [["2026-11-13 11:00", 120], ["2026-11-12 12:00", 120], ["2026-11-12 11:00", 100]], "green"],
  ["a backfilled old latest report remains red despite newer history", [["2026-11-12 10:00", 150], ["2026-11-13 11:00", 120], ["2026-11-13 10:00", 100]], "red"],
  ["missing reports have a red status", [], "red"],
];

for (const [name, entries, tone] of cases) {
  test(name, () => assert.equal(reportStatus(reports(entries), NOW).tone, tone));
}

test("Japan time is independent of the server timezone and crosses the UTC date boundary", () => {
  const now = Date.parse("2026-11-12T16:00:00Z");
  assert.equal(formatJapanTime(now), "2026-11-13 01:00");
  assert.deepEqual(reportWindow(now), { start: "2026-11-12 01:00", end: "2026-11-13 01:00" });
  assert.equal(reportStatus(reports([["2026-11-13 00:30", 100]]), now).tone, "green");
});

test("the 24-hour boundary expires immediately rather than gaining an extra minute", () => {
  const firstReport = reports([["2026-11-12 12:00", 100]]);
  assert.equal(reportStatus(firstReport, NOW).tone, "green");
  assert.equal(reportStatus(firstReport, NOW + 1).tone, "red");
  const earlierGrowth = reports([["2026-11-13 11:00", 120], ["2026-11-12 12:00", 120], ["2026-11-12 11:00", 100]]);
  assert.equal(reportStatus(earlierGrowth, NOW + 1).tone, "yellow");
});

test("five retained flat reports are yellow without inferring growth from discarded records", () => {
  const flat = reports(Array.from({ length: 5 }, () => ["2026-11-13 11:00", 120]));
  assert.equal(reportStatus(flat, NOW).tone, "yellow");
});

test("desktop and mobile show the same statuses, keep all columns, and display Japan time", () => {
  const accounts = [
    { email: "new@example.com", reports: reports([["2026-11-13 11:00", 100]]) },
    { email: "flat@example.com", reports: reports([["2026-11-13 10:00", 100], ["2026-11-13 09:00", 100]]) },
    { email: "old@example.com", reports: reports([["2026-11-12 11:59", 100]]) },
  ];
  const html = renderPage(accounts, "", { now: NOW });
  for (const tone of ["green", "yellow", "red"]) {
    assert.ok(html.includes(`class="report-row status-${tone}"`));
    assert.ok(html.includes(`class="account-card status-${tone}"`));
  }
  for (const label of ["新账号", "24h 内无增长", "超过24小时"]) {
    assert.equal((html.match(new RegExp(`</span>${label}</span>`, "g")) ?? []).length, 2);
  }
  assert.equal((html.match(/scope="col"/g) ?? []).length, 11);
  assert.ok(html.includes('datetime="2026-11-13T03:00:00.000Z">2026-11-13 12:00</time>'));
  assert.ok(html.includes('datetime="2026-11-13T11:00:00+09:00"'));
  assert.ok(!html.includes('class="delete-link"'));
});

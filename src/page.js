import { formatJapanTime, reportStatus } from "./report-status.js";

const STYLES = `
  :root { color-scheme: light; --ink:#253b33; --muted:#697b70; --line:#e2eae5; --accent:#326e58; --paper:#f4f7f5; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--paper); color:var(--ink); font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif; font-size:14px; -webkit-font-smoothing:antialiased; }
  a { color:inherit; text-decoration:none; }
  a:focus-visible, button:focus-visible, input:focus-visible, .table-scroll:focus-visible { outline:3px solid #70a994; outline-offset:4px; }
  .topbar { height:76px; padding:0 40px; background:#fff; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap:20px; }
  .brand { display:flex; align-items:center; gap:11px; font-weight:700; font-size:19px; letter-spacing:-.6px; }
  .brandmark { width:31px; height:31px; background:var(--accent); border-radius:9px; display:flex; align-items:flex-end; justify-content:center; gap:3px; padding:8px; }
  .brandmark i { display:block; width:3px; background:#fff; border-radius:2px; height:7px; }
  .brandmark i:nth-child(2) { height:11px; opacity:.75; }
  .brandmark i:nth-child(3) { height:15px; opacity:.5; }
  .top-note { color:var(--muted); font-size:12px; letter-spacing:.2px; }
  .top-note b { display:inline-block; width:6px; height:6px; border-radius:50%; background:#409379; margin-right:8px; vertical-align:middle; }
  .top-actions { display:flex; align-items:center; gap:22px; }
  .top-actions .logout-form { width:auto; }
  .logout-button { background:#fff; color:var(--muted); }
  main { max-width:1800px; margin:0 auto; padding:48px 40px 28px; }
  .eyebrow { color:var(--accent); font-size:11px; letter-spacing:2px; font-weight:700; margin:0 0 12px; }
  .heading { display:flex; justify-content:space-between; align-items:center; gap:24px; margin-bottom:32px; }
  h1 { font-size:30px; font-weight:650; letter-spacing:-1px; margin:0 0 12px; }
  .description { margin:0; color:var(--muted); font-size:13px; line-height:1.8; }
  .report-clock { display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:14px 0 0; color:var(--muted); font-size:11px; line-height:1.7; }
  .timezone { padding:2px 7px; border:1px solid #dce7df; border-radius:5px; background:#eaf1ed; color:var(--accent); font-weight:600; }
  .report-clock time { font-variant-numeric:tabular-nums; }
  .refresh { display:inline-flex; align-items:center; justify-content:center; gap:9px; padding:11px 16px; border:1px solid #d6dfda; background:#fff; border-radius:7px; font-size:13px; white-space:nowrap; }
  .refresh:hover { background:#edf3ef; border-color:#a9bfb3; }
  .refresh svg { width:15px; height:15px; }
  .heading-actions { display:flex; align-items:center; gap:10px; flex-shrink:0; }
  .heading-actions .manage-form { width:auto; }
  .manage-button { padding:11px 16px; background:#fff; border-color:#d6dfda; font-size:13px; white-space:nowrap; }
  .manage-button[aria-pressed="true"] { background:var(--accent); border-color:var(--accent); color:#fff; }
  .manage-button[aria-pressed="true"]:hover { background:#205746; }
  .stats { display:flex; gap:0; margin:0 0 28px; padding:22px 24px; background:#fff; border:1px solid var(--line); border-radius:12px; box-shadow:0 2px 8px #253b3303; }
  .stat { padding:0 38px; border-right:1px solid var(--line); }
  .stat:first-child { padding-left:0; }
  .stat:last-child { border:0; }
  .stat dt { color:var(--muted); font-size:12px; margin:0 0 9px; }
  .stat dd { margin:0; font-size:26px; line-height:1.2; font-weight:600; letter-spacing:-.7px; font-variant-numeric:tabular-nums; }
  .stat dd small { margin-left:6px; font-size:12px; font-weight:400; color:var(--muted); letter-spacing:0; }
  .stat dd.date { font-size:17px; padding-top:6px; letter-spacing:0; }
  .report { background:#fff; border:1px solid var(--line); border-radius:12px; overflow:hidden; box-shadow:0 4px 20px #253b3304; }
  .toolbar { display:flex; align-items:center; justify-content:space-between; gap:16px; padding:20px 22px; }
  h2 { font-size:15px; font-weight:600; margin:0; display:flex; align-items:center; gap:10px; }
  .count { color:var(--accent); background:#edf4ef; border:1px solid #e3eee6; border-radius:5px; padding:2px 7px; font-size:11px; font-weight:500; }
  form { display:flex; align-items:center; gap:8px; }
  .search { display:flex; align-items:center; gap:9px; border:1px solid var(--line); border-radius:6px; padding:8px 11px; background:#fbfcfb; }
  .search svg { width:15px; height:15px; color:#89958d; flex-shrink:0; }
  input { width:210px; border:0; background:transparent; font:inherit; font-size:12px; color:var(--ink); outline:none; }
  input::placeholder { color:#929c97; }
  button { border:1px solid #dbe4de; border-radius:6px; background:#f2f6f3; font:inherit; font-size:12px; color:var(--accent); padding:8px 12px; cursor:pointer; }
  button:hover { background:#e5eee8; }
  .clear { font-size:12px; color:var(--muted); padding:8px 0 8px 4px; }
  .status-green { --status-color:#326e53; --status-dot:#529675; --status-bg:#f1f8f3; --status-hover:#e8f3ec; --status-border:#dcebe1; --status-badge:#e2efe6; }
  .status-yellow { --status-color:#8b681f; --status-dot:#bf9743; --status-bg:#fffbf1; --status-hover:#fcf4df; --status-border:#eee4c8; --status-badge:#f6edcf; }
  .status-red { --status-color:#9a5d56; --status-dot:#bd8178; --status-bg:#fff5f3; --status-hover:#fbece8; --status-border:#efded9; --status-badge:#f5e5e1; }
  .status-legend { display:flex; align-items:center; flex-wrap:wrap; gap:14px; padding:13px 22px; border-top:1px solid var(--line); background:#fbfcfb; }
  .legend-caption { color:var(--muted); font-size:11px; }
  .legend-items { display:flex; flex-wrap:wrap; gap:8px; }
  .legend-item { display:inline-flex; align-items:center; gap:7px; padding:6px 10px; border:1px solid var(--status-border); border-radius:7px; background:var(--status-bg); color:var(--status-color); font-size:11px; line-height:1.4; }
  .legend-item b { margin-left:4px; font-weight:650; font-variant-numeric:tabular-nums; }
  .legend-note { margin-left:auto; color:var(--muted); font-size:11px; }
  .status-dot { display:inline-block; width:5px; height:5px; border-radius:50%; background:var(--status-dot); flex-shrink:0; }
  .status-badge { display:inline-flex; align-items:center; justify-self:start; gap:5px; padding:3px 7px; border-radius:5px; background:var(--status-badge); color:var(--status-color); font-size:10px; font-weight:500; line-height:1.5; white-space:nowrap; }
  .account-meta { display:flex; align-items:center; flex-wrap:wrap; gap:7px; }
  .table-scroll { overflow-x:auto; scrollbar-color:#c8d6ce #f8faf8; }
  table { border-collapse:separate; border-spacing:0; width:100%; min-width:1560px; font-size:12px; white-space:nowrap; }
  thead th { background:#f8faf8; color:#748079; font-size:11px; font-weight:500; border-top:1px solid var(--line); border-bottom:1px solid var(--line); height:46px; text-align:left; padding:0 20px; }
  th:first-child { padding-left:22px; min-width:235px; position:sticky; left:0; z-index:1; }
  thead th.latest { color:var(--accent); background:#f0f5f1; }
  .sort { margin-left:5px; font-size:13px; }
  tbody td, tbody th { height:72px; border-bottom:1px solid #edf0ed; padding:14px 20px; background:#fff; text-align:left; font-weight:400; font-variant-numeric:tabular-nums; }
  tbody tr:last-child td, tbody tr:last-child th { border-bottom:0; }
  tbody tr:hover td, tbody tr:hover th { background:#f9fbf9; }
  tbody tr.report-row td, tbody tr.report-row th { background:var(--status-bg); border-bottom-color:var(--status-border); }
  tbody tr.report-row:hover td, tbody tr.report-row:hover th { background:var(--status-hover); }
  tbody tr.report-row th { box-shadow:inset 3px 0 var(--status-dot); }
  tbody td.latest-points { font-weight:650; color:var(--accent); font-size:15px; }
  tbody tr.report-row td.latest-points { color:var(--status-color); }
  .points-value { display:inline-flex; align-items:baseline; gap:5px; max-width:100%; }
  .points-number { min-width:0; }
  .points-increase { display:inline-flex; align-items:baseline; gap:3px; flex-shrink:0; max-width:100%; color:#2c865e; font-size:.8em; font-weight:700; line-height:1.3; }
  .points-delta { min-width:0; font-size:max(11px,.8em); font-weight:600; overflow-wrap:anywhere; }
  tbody td.date { color:#7b8580; font-size:11px; }
  tbody td.missing { color:#b5beb8; }
  .account { display:flex; gap:10px; align-items:center; }
  .avatar { background:#f0f3ed; color:#718268; width:30px; height:30px; border:1px solid #e7ece3; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; flex-shrink:0; }
  .report-row .avatar, .account-card .avatar { color:var(--status-color); background:var(--status-badge); border-color:var(--status-border); }
  .email { max-width:240px; overflow:hidden; text-overflow:ellipsis; color:#35463d; font-weight:500; }
  .account-details { display:grid; gap:6px; min-width:0; }
  .delete-link { display:inline-flex; align-items:center; justify-self:start; min-height:30px; padding:5px 8px; border:1px solid #eddad6; border-radius:5px; background:#fff7f5; font-size:11px; color:#a15c50; }
  .delete-link:hover { color:#843d33; text-decoration:underline; }
  .mobile-reports, .mobile-hint { display:none; }
  .account-card { min-width:0; padding:17px; border:1px solid var(--status-border); border-left:3px solid var(--status-dot); border-radius:10px; background:var(--status-bg); box-shadow:0 2px 6px #253b3303; }
  .card-account { display:flex; align-items:center; gap:10px; min-width:0; }
  .card-heading { min-width:0; display:grid; gap:5px; }
  .card-account .avatar { align-self:flex-start; margin-top:2px; width:34px; height:34px; border-radius:9px; }
  .card-email { min-width:0; margin:0; font-size:13px; font-weight:600; line-height:1.6; overflow-wrap:anywhere; }
  .card-latest, .history-row { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,1.35fr); gap:12px; font-variant-numeric:tabular-nums; }
  .card-latest { margin:18px 0 16px; }
  .card-latest-wide, .history-row-wide { grid-template-columns:minmax(0,1fr); }
  .card-latest div, .history-row div { min-width:0; }
  .card-latest dt, .history-row dt { color:var(--muted); font-size:11px; line-height:1.6; margin:0 0 7px; }
  .card-latest dd, .history-row dd { margin:0; overflow-wrap:anywhere; }
  .card-points { color:var(--status-color); font-size:22px; font-weight:650; line-height:1.3; }
  .card-points .points-value { flex-wrap:wrap; row-gap:3px; }
  .card-latest-wide .card-points { font-size:20px; }
  .card-time { font-size:12px; line-height:1.8; }
  .card-history { border-top:1px solid var(--status-border); }
  .card-history summary { display:flex; align-items:center; gap:8px; min-height:44px; color:var(--accent); font-size:12px; cursor:pointer; list-style:none; -webkit-tap-highlight-color:rgba(39,103,86,.08); }
  .card-history summary::-webkit-details-marker { display:none; }
  .card-history summary::after { content:""; width:6px; height:6px; margin-left:auto; margin-right:3px; border-right:1.5px solid currentColor; border-bottom:1.5px solid currentColor; transform:rotate(45deg); }
  .card-history[open] > summary::after { transform:rotate(225deg); }
  .card-history summary:focus-visible { outline:3px solid #70a994; outline-offset:2px; }
  .history-count { color:var(--muted); font-size:11px; }
  .history-row { margin:0; padding:13px 0; border-top:1px solid var(--status-border); }
  .history-row dd { font-size:13px; line-height:1.6; }
  .history-row time { font-size:12px; }
  .card-note { margin:0; padding-top:12px; border-top:1px solid var(--status-border); font-size:11px; color:var(--muted); }
  .card-actions { padding-top:12px; border-top:1px solid var(--status-border); }
  .card-actions .delete-link { min-height:40px; padding:8px 12px; }
  .notice { margin:0 0 24px; padding:13px 16px; border:1px solid #d5e5da; border-radius:7px; background:#edf5ef; color:var(--accent); line-height:1.8; }
  .empty { text-align:center; padding:75px 20px 82px; color:var(--muted); white-space:normal; }
  .empty .empty-icon { font-size:25px; color:#a2b5a8; margin-bottom:14px; }
  .empty h3 { font-size:15px; color:#44534a; margin:0 0 10px; font-weight:500; }
  .empty p { margin:0; font-size:12px; line-height:1.8; }
  .table-footer { border-top:1px solid var(--line); display:flex; justify-content:space-between; gap:16px; padding:15px 22px; color:#8c9690; font-size:11px; line-height:1.8; }
  footer { padding:24px 1px 0; display:flex; justify-content:space-between; gap:16px; color:#9aa49d; font-size:11px; line-height:1.7; }
  code { font-family:ui-monospace,SFMono-Regular,Consolas,monospace; color:#576b5f; font-size:11px; background:#f0f4f0; padding:2px 5px; border-radius:4px; }
  .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  .unavailable { padding:65px 24px; text-align:center; }
  .unavailable p { color:var(--muted); line-height:1.8; margin-bottom:24px; }
  .login-card { max-width:420px; margin:56px auto 0; padding:34px; background:#fff; border:1px solid var(--line); border-radius:10px; }
  .login-card h1 { font-size:27px; margin-top:16px; }
  .login-form { display:grid; gap:20px; margin-top:28px; }
  .login-form label { display:grid; gap:9px; font-size:13px; font-weight:500; }
  .login-form input { width:100%; min-width:0; padding:12px; border:1px solid #dbe4de; border-radius:6px; background:#fbfcfb; font-size:14px; }
  .login-form .login-submit { width:100%; padding:12px; background:var(--accent); color:#fff; font-size:14px; font-weight:600; border-color:var(--accent); }
  .login-form .login-submit:hover { background:#205746; }
  .login-error { margin:22px 0 0; padding:11px 13px; border:1px solid #f0d6d2; border-radius:6px; background:#fff7f5; color:#9b4d40; font-size:12px; line-height:1.8; overflow-wrap:anywhere; }
  .login-note { margin:22px 0 0; color:var(--muted); text-align:center; font-size:11px; line-height:1.8; }
  .confirmation-card { max-width:500px; }
  .confirmation-card h1 { font-size:24px; }
  .delete-target { margin:24px 0 16px; padding:14px; border:1px solid var(--line); border-radius:6px; background:#f8faf8; font-weight:600; overflow-wrap:anywhere; }
  .confirmation-actions { display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-top:26px; }
  .confirmation-actions form { width:auto; }
  .confirmation-actions .refresh { margin:0; }
  .delete-button { padding:11px 16px; background:#a64d40; color:#fff; border:1px solid #a64d40; font-size:13px; }
  .delete-button:hover { background:#8d3e33; border-color:#8d3e33; }
  @media (min-width:1900px) { table { min-width:100%; } }
  @media (max-width:700px) {
    .topbar { height:64px; padding:0 20px; }
    .top-note { font-size:10px; }
    .top-actions .top-note { display:none; }
    .login-card { margin-top:20px; padding:26px 22px; }
    main { padding:30px 14px 20px; }
    .heading { flex-direction:column; gap:18px; margin-bottom:26px; align-items:stretch; }
    .heading-actions { flex-wrap:wrap; }
    .heading-actions .refresh, .manage-button { margin:0; min-height:42px; padding:10px 14px; }
    h1 { font-size:26px; }
    .description { font-size:12px; }
    .refresh { padding:9px 11px; font-size:12px; }
    .stats { flex-wrap:wrap; row-gap:24px; padding:20px 18px; }
    .stat { padding:0 22px; }
    .stat dd { font-size:23px; }
    .stat:last-child { width:100%; padding:0; }
    .stat:nth-child(2) { border:0; }
    .toolbar { align-items:flex-start; flex-direction:column; padding:18px 16px; }
    .status-legend { align-items:stretch; flex-direction:column; gap:9px; padding:13px 16px; }
    .legend-items { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:6px; }
    .legend-item { gap:5px; padding:7px; font-size:10px; }
    .legend-item b { margin-left:auto; }
    .legend-extra, .legend-note { display:none; }
    form { width:100%; }
    .search { flex:1; min-width:0; }
    input { width:100%; min-width:0; }
    .search input { font-size:16px; }
    .toolbar button { min-height:40px; }
    .desktop-reports, .desktop-hint { display:none; }
    .mobile-reports { display:grid; gap:12px; padding:10px; background:var(--paper); border-top:1px solid var(--line); }
    .mobile-hint { display:inline; }
    .table-footer, footer { flex-direction:column; gap:5px; }
    .table-footer { padding:13px 16px; }
  }
`;

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
}

const refreshIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 7a7 7 0 0 1 11.6-1L20 9M4 15l2.3 3A7 7 0 0 0 18 17"/></svg>`;
const searchIcon = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>`;

function shell(content, { authenticated = false, title = "账户积分报告 · MyReport" } = {}) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="账户积分报告，每个账号最近五次上报一目了然。">
  <meta name="robots" content="noindex, noarchive">
  <link rel="icon" href="/favicon.ico" sizes="16x16 32x32" type="image/x-icon">
  <link rel="icon" href="/favicon.svg" sizes="any" type="image/svg+xml">
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180">
  <title>${escapeHtml(title)}</title>
  <style>${STYLES}</style>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/" aria-label="MyReport 首页"><span class="brandmark" aria-hidden="true"><i></i><i></i><i></i></span>MyReport</a>
    <div class="top-actions"><span class="top-note">账户数据 · 轻松掌握</span>${authenticated ? '<form class="logout-form" action="/logout" method="post"><button class="logout-button" type="submit">退出登录</button></form>' : ""}</div>
  </header>
  <main>${content}</main>
</body>
</html>`;
}

function pointsIncrease(reports) {
  if (reports.length < 2 || reports[0].total_points <= reports[1].total_points) return null;

  // Subtract decimal values without introducing floating-point tails in the UI.
  const values = reports.slice(0, 2).map(({ total_points }) => {
    const [coefficient, exponent = "0"] = String(total_points).split("e");
    const [integer, fraction = ""] = coefficient.split(".");
    return { digits: BigInt(integer + fraction), scale: fraction.length - Number(exponent) };
  });
  const scale = Math.max(0, ...values.map((value) => value.scale));
  const [latest, previous] = values.map((value) => value.digits * 10n ** BigInt(scale - value.scale));
  const digits = (latest - previous).toString().padStart(scale + 1, "0");
  return scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}`.replace(/\.?0+$/, "") : digits;
}

function latestPoints(reports) {
  const increase = pointsIncrease(reports);
  const label = increase === null ? "" : escapeHtml(`较前一次积分增加 ${increase}`);
  return `<span class="points-value"><span class="points-number">${escapeHtml(reports[0].total_points)}</span>${increase === null ? "" : `<span class="points-increase" role="img" aria-label="${label}" title="${label}"><span aria-hidden="true">↑</span><span class="points-delta" aria-hidden="true">+${escapeHtml(increase)}</span></span>`}</span>`;
}

function reportCells(reports) {
  return Array.from({ length: 5 }, (_, index) => {
    const report = reports[index];
    if (!report) return `<td class="missing">—</td><td class="missing">—</td>`;
    return `<td${index === 0 ? ' class="latest-points"' : ""}>${index === 0 ? latestPoints(reports) : escapeHtml(report.total_points)}</td><td class="date">${escapeHtml(report.report_time)}</td>`;
  }).join("");
}

function reportUrl(query, manage) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (manage) params.set("manage", "1");
  return params.size ? `/?${params}` : "/";
}

function deleteLink(email, returnTo) {
  return `<a class="delete-link" href="/accounts/delete?email=${encodeURIComponent(email)}&amp;next=${encodeURIComponent(returnTo)}" aria-label="删除 ${escapeHtml(email)} 的全部记录">删除全部记录</a>`;
}

function reportTime(value) {
  return `<time datetime="${escapeHtml(String(value).replace(" ", "T"))}:00+09:00">${escapeHtml(value)}</time>`;
}

function statusBadge(status) {
  return `<span class="status-badge" title="${escapeHtml(status.description)}"><span class="status-dot" aria-hidden="true"></span>${escapeHtml(status.label)}</span>`;
}

function mobileAccount(account, status, returnTo, manage) {
  const [latest, ...history] = account.reports;
  const increase = pointsIncrease(account.reports);
  const pointsLength = String(latest.total_points).length;
  const widePoints = pointsLength > 10 || (increase !== null && pointsLength + increase.length > 5);
  return `<article class="account-card status-${status.tone}" role="listitem">
    <header class="card-account"><span class="avatar" aria-hidden="true">${escapeHtml(account.email.slice(0, 2).toUpperCase())}</span><div class="card-heading"><h3 class="card-email">${escapeHtml(account.email)}</h3>${statusBadge(status)}</div></header>
    <dl class="card-latest${widePoints ? " card-latest-wide" : ""}" aria-label="最近报告">
      <div><dt>最近总积分</dt><dd class="card-points">${latestPoints(account.reports)}</dd></div>
      <div><dt>最近报告时间</dt><dd class="card-time">${reportTime(latest.report_time)}</dd></div>
    </dl>
    ${history.length ? `<details class="card-history"><summary>历史记录<span class="history-count">${history.length} 份</span></summary>
      ${history.map((report, index) => `<dl class="history-row${String(report.total_points).length > 10 ? " history-row-wide" : ""}" aria-label="历史报告${index + 2}">
        <div><dt>历史总积分${index + 2}</dt><dd>${escapeHtml(report.total_points)}</dd></div>
        <div><dt>历史报告时间${index + 2}</dt><dd>${reportTime(report.report_time)}</dd></div>
      </dl>`).join("")}
    </details>` : '<p class="card-note">暂无历史记录</p>'}
    ${manage ? `<div class="card-actions">${deleteLink(account.email, returnTo)}</div>` : ""}
  </article>`;
}

export function renderPage(accounts, query = "", { deleted = false, manage = false, now = Date.now() } = {}) {
  const filtered = accounts.filter((account) => account.email.includes(query.toLowerCase()));
  const statuses = new Map(accounts.map((account) => [account.email, reportStatus(account.reports, now)]));
  const statusCounts = { green: 0, yellow: 0, red: 0 };
  for (const account of filtered) statusCounts[statuses.get(account.email).tone]++;
  const japanNow = formatJapanTime(now);
  const retained = accounts.reduce((total, account) => total + account.reports.length, 0);
  const latest = accounts[0]?.reports[0]?.report_time ?? "暂无报告";
  const refreshUrl = reportUrl(query, manage);
  const clearUrl = reportUrl("", manage);
  const headers = ["账号名称", "最近总积分", "最近报告时间", ...Array.from({ length: 4 }, (_, i) => [
    `历史总积分${i + 2}`, `历史报告时间${i + 2}`,
  ]).flat()];
  const rows = filtered.map((account) => `<tr class="report-row status-${statuses.get(account.email).tone}">
    <th scope="row"><span class="account"><span class="avatar" aria-hidden="true">${escapeHtml(account.email.slice(0, 2).toUpperCase())}</span><span class="account-details"><span class="email" title="${escapeHtml(account.email)}">${escapeHtml(account.email)}</span><span class="account-meta">${statusBadge(statuses.get(account.email))}${manage ? deleteLink(account.email, refreshUrl) : ""}</span></span></span></th>
    ${reportCells(account.reports)}
  </tr>`).join("");
  const emptyContent = `<div class="empty-icon" aria-hidden="true">▤</div><h3>${query ? "没有找到匹配的账号" : "等待第一份报告"}</h3><p>${query ? "试试其他邮箱关键词，或清除搜索查看全部账号。" : "收到上报后，账号积分与历史记录会显示在这里。"}</p>`;
  const empty = `<tr><td colspan="11" class="empty">${emptyContent}</td></tr>`;

  return shell(`
    <div class="heading">
      <div><p class="eyebrow">ACCOUNT OVERVIEW</p><h1>账户积分报告</h1><p class="description">每一次上报，都有迹可循。查看最新积分、历史记录与近24小时状态。</p><p class="report-clock"><span class="timezone">日本时间 JST</span><time datetime="${new Date(now).toISOString()}">${japanNow}</time><span>· 本次更新</span></p></div>
      <div class="heading-actions">
        <a class="refresh" href="${escapeHtml(refreshUrl)}">${refreshIcon}刷新报告</a>
        <form class="manage-form" action="/" method="get">
          ${query ? `<input type="hidden" name="q" value="${escapeHtml(query)}">` : ""}
          <button class="manage-button" type="submit" name="manage" value="${manage ? "0" : "1"}" aria-pressed="${manage}">${manage ? "完成管理" : "管理账号"}</button>
        </form>
      </div>
    </div>
    ${deleted ? '<p class="notice" role="status">账号及全部报告已删除。</p>' : ""}
    <dl class="stats" aria-label="报告概览">
      <div class="stat"><dt>已收录账号</dt><dd>${accounts.length}<small>个</small></dd></div>
      <div class="stat"><dt>已保留报告</dt><dd>${retained}<small>份</small></dd></div>
      <div class="stat"><dt>最近报告时间</dt><dd class="date">${escapeHtml(latest)}</dd></div>
    </dl>
    <section class="report" aria-labelledby="reports-title">
      <div class="toolbar">
        <h2 id="reports-title">全部账号<span class="count">${filtered.length}</span></h2>
        <form action="/" method="get" role="search">
          ${manage ? '<input type="hidden" name="manage" value="1">' : ""}
          <div class="search">${searchIcon}<label class="sr-only" for="email-search">搜索账户邮箱</label><input id="email-search" name="q" type="search" maxlength="254" placeholder="搜索账户邮箱…" value="${escapeHtml(query)}"></div>
          <button type="submit">搜索</button>${query ? `<a class="clear" href="${escapeHtml(clearUrl)}">清除</a>` : ""}
        </form>
      </div>
      <div class="status-legend" role="group" aria-label="按日本时间判断最近24小时的账号状态">
        <span class="legend-caption">近24小时状态</span>
        <div class="legend-items">
          <span class="legend-item status-green" title="24小时内有积分增长，或只有一份近期报告的新账号"><span class="status-dot" aria-hidden="true"></span><span>有增长<span class="legend-extra"> / 新账号</span></span><b>${statusCounts.green}</b></span>
          <span class="legend-item status-yellow" title="24小时内有报告，但未发现积分提升"><span class="status-dot" aria-hidden="true"></span><span>无增长</span><b>${statusCounts.yellow}</b></span>
          <span class="legend-item status-red" title="超过24小时未上报，或最近报告时间异常"><span class="status-dot" aria-hidden="true"></span><span>需关注</span><b>${statusCounts.red}</b></span>
        </div>
        <span class="legend-note">新账号首份报告在24小时内也标绿</span>
      </div>
      <div class="table-scroll desktop-reports" role="region" aria-label="账户积分与五次报告记录，可左右滚动" tabindex="0">
        <table>
          <caption class="sr-only">各账号最近收到的五份报告，按最新一份报告的报告时间降序排列。</caption>
          <thead><tr>${headers.map((title, index) => `<th scope="col"${index === 2 ? ' class="latest" aria-sort="descending"' : ""}>${title}${index === 2 ? '<span class="sort" aria-hidden="true">↓</span>' : ""}</th>`).join("")}</tr></thead>
          <tbody>${rows || empty}</tbody>
        </table>
      </div>
      <div class="mobile-reports"${filtered.length ? ' role="list"' : ""} aria-label="账户报告卡片">${filtered.map((account) => mobileAccount(account, statuses.get(account.email), refreshUrl, manage)).join("") || `<div class="empty">${emptyContent}</div>`}</div>
      <div class="table-footer"><span>${query ? `匹配 ${filtered.length} / ${accounts.length} 个账号` : `共 ${accounts.length} 个账号`} · 按最近报告时间降序</span><span class="desktop-hint">每个邮箱保留最近收到的 5 份报告 · 左右滑动查看历史</span><span class="mobile-hint">每个账号保留最近 5 份报告 · 历史记录可展开查看</span></div>
    </section>
    <footer><span>MyReport · 账户积分记录</span><span>报告时间按日本时间解读 · 刷新页面更新数据与状态</span></footer>
  `, { authenticated: true });
}

export function renderUnavailablePage() {
  return shell(`<section class="report unavailable"><p class="eyebrow">MYREPORT</p><h1>报告暂时无法加载</h1><p>请稍后重试。管理员可检查 D1 数据库绑定与数据库迁移是否已完成。</p><a class="refresh" href="/">${refreshIcon}重新加载</a></section>`);
}

export function renderDeletePage({ email = "", reportCount = 0, returnTo = "/", error = "" } = {}) {
  return shell(`<section class="login-card confirmation-card" aria-labelledby="delete-title">
    <p class="eyebrow">ACCOUNT MANAGEMENT</p>
    <h1 id="delete-title">${error ? "无法删除账号记录" : "删除账号及全部记录？"}</h1>
    ${email ? `<p class="delete-target">${escapeHtml(email)}</p>` : ""}
    ${error
      ? `<p class="login-error" role="alert">${escapeHtml(error)}</p>`
      : `<p class="description">该邮箱当前保存了 <strong>${escapeHtml(reportCount)}</strong> 份报告。确认后，将从数据库删除该账号及其全部报告，操作无法撤销。</p>`}
    <div class="confirmation-actions">
      <a class="refresh" href="${escapeHtml(returnTo)}">${error ? "返回报告" : "取消"}</a>
      ${error ? "" : `<form action="/accounts/delete" method="post">
        <input type="hidden" name="email" value="${escapeHtml(email)}">
        <input type="hidden" name="next" value="${escapeHtml(returnTo)}">
        <input type="hidden" name="confirm" value="delete">
        <button class="delete-button" type="submit">确认删除全部记录</button>
      </form>`}
    </div>
  </section>`, { authenticated: true, title: "删除账号记录 · MyReport" });
}

export function renderLoginPage({ error = "", username = "", returnTo = "/", configured = true } = {}) {
  const message = configured ? error : "登录服务尚未配置，请联系管理员设置登录账号和密码。";
  return shell(`<section class="login-card" aria-labelledby="login-title">
    <p class="eyebrow">WELCOME BACK</p>
    <h1 id="login-title">登录查看报告</h1>
    <p class="description">登录后查看各账号的积分与最近 5 次报告。</p>
    ${message ? `<p class="login-error" role="alert">${escapeHtml(message)}</p>` : ""}
    ${configured ? `<form class="login-form" action="/login" method="post">
      <input type="hidden" name="next" value="${escapeHtml(returnTo)}">
      <label for="login-username">账号<input id="login-username" name="username" type="text" autocomplete="username" maxlength="254" value="${escapeHtml(username.slice(0, 254))}" required></label>
      <label for="login-password">密码<input id="login-password" name="password" type="password" autocomplete="current-password" maxlength="4096" required></label>
      <button class="login-submit" type="submit">登录</button>
    </form><p class="login-note">登录状态保留 12 小时，可随时退出登录。</p>` : ""}
  </section>`, { title: "登录 · MyReport" });
}

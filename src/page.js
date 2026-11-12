const STYLES = `
  :root { color-scheme: light; --ink:#202c31; --muted:#738087; --line:#e5eae8; --accent:#276756; --paper:#f6f8f6; }
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
  main { max-width:1800px; margin:0 auto; padding:48px 40px 28px; }
  .eyebrow { color:var(--accent); font-size:11px; letter-spacing:2px; font-weight:700; margin:0 0 12px; }
  .heading { display:flex; justify-content:space-between; align-items:center; gap:24px; margin-bottom:32px; }
  h1 { font-size:30px; font-weight:650; letter-spacing:-1px; margin:0 0 12px; }
  .description { margin:0; color:var(--muted); font-size:13px; line-height:1.8; }
  .refresh { display:inline-flex; align-items:center; justify-content:center; gap:9px; padding:11px 16px; border:1px solid #d6dfda; background:#fff; border-radius:7px; font-size:13px; white-space:nowrap; }
  .refresh:hover { background:#edf3ef; border-color:#a9bfb3; }
  .refresh svg { width:15px; height:15px; }
  .stats { display:flex; gap:0; margin:0 0 32px; padding:22px 0; border-top:1px solid var(--line); border-bottom:1px solid var(--line); }
  .stat { padding:0 38px; border-right:1px solid var(--line); }
  .stat:first-child { padding-left:0; }
  .stat:last-child { border:0; }
  .stat dt { color:var(--muted); font-size:12px; margin:0 0 9px; }
  .stat dd { margin:0; font-size:26px; line-height:1.2; font-weight:600; letter-spacing:-.7px; font-variant-numeric:tabular-nums; }
  .stat dd small { margin-left:6px; font-size:12px; font-weight:400; color:var(--muted); letter-spacing:0; }
  .stat dd.date { font-size:17px; padding-top:6px; letter-spacing:0; }
  .report { background:#fff; border:1px solid var(--line); border-radius:10px; overflow:hidden; }
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
  .table-scroll { overflow-x:auto; scrollbar-color:#c8d6ce #f8faf8; }
  table { border-collapse:separate; border-spacing:0; width:100%; min-width:1560px; font-size:12px; white-space:nowrap; }
  thead th { background:#f8faf8; color:#748079; font-size:11px; font-weight:500; border-top:1px solid var(--line); border-bottom:1px solid var(--line); height:46px; text-align:left; padding:0 20px; }
  th:first-child { padding-left:22px; min-width:235px; position:sticky; left:0; z-index:1; }
  thead th.latest { color:var(--accent); background:#f0f5f1; }
  .sort { margin-left:5px; font-size:13px; }
  tbody td, tbody th { height:72px; border-bottom:1px solid #edf0ed; padding:14px 20px; background:#fff; text-align:left; font-weight:400; font-variant-numeric:tabular-nums; }
  tbody tr:last-child td, tbody tr:last-child th { border-bottom:0; }
  tbody tr:hover td, tbody tr:hover th { background:#f9fbf9; }
  tbody td.latest-points { font-weight:650; color:var(--accent); font-size:15px; }
  tbody td.date { color:#7b8580; font-size:11px; }
  tbody td.missing { color:#b5beb8; }
  .account { display:flex; gap:10px; align-items:center; }
  .avatar { background:#f0f3ed; color:#718268; width:30px; height:30px; border:1px solid #e7ece3; border-radius:7px; display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; flex-shrink:0; }
  .email { max-width:240px; overflow:hidden; text-overflow:ellipsis; color:#35463d; font-weight:500; }
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
  @media (min-width:1900px) { table { min-width:100%; } }
  @media (max-width:700px) {
    .topbar { height:64px; padding:0 20px; }
    .top-note { font-size:10px; }
    main { padding:30px 18px 20px; }
    .heading { gap:12px; margin-bottom:26px; align-items:flex-start; }
    h1 { font-size:26px; }
    .description { font-size:12px; }
    .refresh { padding:9px 11px; margin-top:30px; font-size:12px; }
    .stats { flex-wrap:wrap; row-gap:24px; padding:20px 0; }
    .stat { padding:0 22px; }
    .stat dd { font-size:23px; }
    .stat:last-child { width:100%; padding:0; }
    .stat:nth-child(2) { border:0; }
    .toolbar { align-items:flex-start; flex-direction:column; padding:18px 16px; }
    form { width:100%; }
    .search { flex:1; min-width:0; }
    input { width:100%; min-width:0; }
    th:first-child { min-width:200px; }
    .email { max-width:190px; }
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

function shell(content) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta name="description" content="账户积分报告，每个账号最近五次上报一目了然。">
  <meta name="robots" content="noindex, noarchive">
  <title>账户积分报告 · MyReport</title>
  <style>${STYLES}</style>
</head>
<body>
  <header class="topbar">
    <a class="brand" href="/" aria-label="MyReport 首页"><span class="brandmark" aria-hidden="true"><i></i><i></i><i></i></span>MyReport</a>
    <span class="top-note">账户数据 · 轻松掌握</span>
  </header>
  <main>${content}</main>
</body>
</html>`;
}

function reportCells(reports) {
  return Array.from({ length: 5 }, (_, index) => {
    const report = reports[index];
    if (!report) return `<td class="missing">—</td><td class="missing">—</td>`;
    return `<td${index === 0 ? ' class="latest-points"' : ""}>${escapeHtml(report.total_points)}</td><td class="date">${escapeHtml(report.report_time)}</td>`;
  }).join("");
}

export function renderPage(accounts, query = "") {
  const filtered = accounts.filter((account) => account.email.includes(query.toLowerCase()));
  const retained = accounts.reduce((total, account) => total + account.reports.length, 0);
  const latest = accounts[0]?.reports[0]?.report_time ?? "暂无报告";
  const refreshUrl = query ? `/?q=${encodeURIComponent(query)}` : "/";
  const headers = ["账号名称", "最近总积分", "最近报告时间", ...Array.from({ length: 4 }, (_, i) => [
    `历史总积分${i + 2}`, `历史报告时间${i + 2}`,
  ]).flat()];
  const rows = filtered.map((account) => `<tr>
    <th scope="row"><span class="account"><span class="avatar" aria-hidden="true">${escapeHtml(account.email.slice(0, 2).toUpperCase())}</span><span class="email" title="${escapeHtml(account.email)}">${escapeHtml(account.email)}</span></span></th>
    ${reportCells(account.reports)}
  </tr>`).join("");
  const empty = `<tr><td colspan="11" class="empty"><div class="empty-icon" aria-hidden="true">▤</div><h3>${query ? "没有找到匹配的账号" : "等待第一份报告"}</h3><p>${query ? "试试其他邮箱关键词，或清除搜索查看全部账号。" : "收到上报后，账号积分与历史记录会显示在这里。"}</p></td></tr>`;

  return shell(`
    <div class="heading">
      <div><p class="eyebrow">ACCOUNT OVERVIEW</p><h1>账户积分报告</h1><p class="description">每一次上报，都有迹可循。查看各账号的最新积分与最近 5 次记录。</p></div>
      <a class="refresh" href="${escapeHtml(refreshUrl)}">${refreshIcon}刷新报告</a>
    </div>
    <dl class="stats" aria-label="报告概览">
      <div class="stat"><dt>已收录账号</dt><dd>${accounts.length}<small>个</small></dd></div>
      <div class="stat"><dt>已保留报告</dt><dd>${retained}<small>份</small></dd></div>
      <div class="stat"><dt>最近报告时间</dt><dd class="date">${escapeHtml(latest)}</dd></div>
    </dl>
    <section class="report" aria-labelledby="reports-title">
      <div class="toolbar">
        <h2 id="reports-title">全部账号<span class="count">${filtered.length}</span></h2>
        <form action="/" method="get" role="search">
          <div class="search">${searchIcon}<label class="sr-only" for="email-search">搜索账户邮箱</label><input id="email-search" name="q" type="search" maxlength="254" placeholder="搜索账户邮箱…" value="${escapeHtml(query)}"></div>
          <button type="submit">搜索</button>${query ? '<a class="clear" href="/">清除</a>' : ""}
        </form>
      </div>
      <div class="table-scroll" role="region" aria-label="账户积分与五次报告记录，可左右滚动" tabindex="0">
        <table>
          <caption class="sr-only">各账号最近收到的五份报告，按最新一份报告的报告时间降序排列。</caption>
          <thead><tr>${headers.map((title, index) => `<th scope="col"${index === 2 ? ' class="latest" aria-sort="descending"' : ""}>${title}${index === 2 ? '<span class="sort" aria-hidden="true">↓</span>' : ""}</th>`).join("")}</tr></thead>
          <tbody>${rows || empty}</tbody>
        </table>
      </div>
      <div class="table-footer"><span>${query ? `匹配 ${filtered.length} / ${accounts.length} 个账号` : `共 ${accounts.length} 个账号`} · 按最近报告时间降序</span><span>每个邮箱保留最近收到的 5 份报告 · 左右滑动查看历史</span></div>
    </section>
    <footer><span>MyReport · 账户积分记录</span><span>时间按上报原值显示 · 刷新页面获取最新数据</span></footer>
  `);
}

export function renderUnavailablePage() {
  return shell(`<section class="report unavailable"><p class="eyebrow">MYREPORT</p><h1>报告暂时无法加载</h1><p>请稍后重试。管理员可检查 D1 数据库绑定与数据库迁移是否已完成。</p><a class="refresh" href="/">${refreshIcon}重新加载</a></section>`);
}

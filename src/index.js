import { renderDeletePage, renderLoginPage, renderPage, renderUnavailablePage } from "./page.js";
import {
  clearSessionCookie, createSessionCookie, credentialsMatch,
  isAuthenticated, loginConfigured, safeReturnTo, secretMatches,
} from "./auth.js";

const MAX_BODY_BYTES = 16 * 1024;
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  // no-referrer 会把浏览器表单 POST 的 Origin 置为 null，影响同源校验。
  "Referrer-Policy": "same-origin",
  "X-Robots-Tag": "noindex, noarchive",
};
const HTML_HEADERS = {
  ...RESPONSE_HEADERS,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: { ...RESPONSE_HEADERS, ...headers },
  });
}

function html(content, status = 200) {
  return new Response(content, { status, headers: HTML_HEADERS });
}

function redirect(location, status = 302, headers = {}) {
  return new Response(null, {
    status,
    headers: { ...RESPONSE_HEADERS, Location: location, ...headers },
  });
}

async function readBodyText(request) {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new HttpError(413, "请求体不能超过 16 KiB。");
  }

  const reader = request.body?.getReader();
  const chunks = [];
  let size = 0;
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_BODY_BYTES) {
          await reader.cancel();
          throw new HttpError(413, "请求体不能超过 16 KiB。");
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new HttpError(400, "请求体必须使用有效的 UTF-8 编码。");
  }
}

async function readJson(request) {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    throw new HttpError(415, "Content-Type 必须是 application/json。");
  }
  const text = await readBodyText(request);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    throw new HttpError(400, "请求体必须是有效的 UTF-8 JSON。");
  }
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new HttpError(400, "请求体必须是 JSON 对象。");
  }
  return body;
}

function validReportTime(value) {
  if (typeof value !== "string" || value.length !== 16) return false;
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || hour > 23 || minute > 59) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day >= 1 && day <= days[month - 1];
}

function normalizeEmail(value) {
  if (typeof value !== "string") {
    throw new HttpError(400, "email 必须是有效的账户邮箱。");
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/u.test(email)) {
    throw new HttpError(400, "email 必须是有效的账户邮箱，长度不能超过 254 个字符。");
  }
  return email;
}

function validateReport(body) {
  const email = normalizeEmail(body.email);
  if (
    typeof body.total_points !== "number" ||
    !Number.isFinite(body.total_points) ||
    Math.abs(body.total_points) > Number.MAX_SAFE_INTEGER
  ) {
    throw new HttpError(400, "total_points 必须是有限数字，绝对值不能超过 9007199254740991。");
  }
  if (!validReportTime(body.report_time)) {
    throw new HttpError(400, "report_time 必须是有效日期，格式为 YYYY-MM-DD HH:mm。");
  }
  return { email, total_points: body.total_points, report_time: body.report_time };
}

function requireDatabase(env) {
  if (!env.DB) throw new HttpError(503, "数据库未配置，请检查 D1 绑定 DB。");
  return env.DB;
}

async function receiveReport(request, env) {
  if (typeof env.API_KEY !== "string" || env.API_KEY.trim().length === 0) {
    throw new HttpError(503, "服务尚未配置 API_KEY。");
  }
  const headerKey = request.headers.get("api-key");
  // 提供请求头时优先使用它，错误的请求头不能被请求体中的正确密钥覆盖。
  if (headerKey !== null && !(await secretMatches(headerKey, env.API_KEY))) {
    throw new HttpError(401, "api-key 缺失或不正确。");
  }
  const body = await readJson(request);
  if (headerKey === null && !(await secretMatches(body["api-key"] ?? body.api_key, env.API_KEY))) {
    throw new HttpError(401, "api-key 缺失或不正确。");
  }
  const report = validateReport(body);
  const db = requireDatabase(env);

  // D1 batch 是事务：建账号、写报告、清理旧报告共同成功或共同回滚。
  // 清理和历史顺序以自增 ID 为准，不能使用客户端的报告时间。
  await db.batch([
    db.prepare("INSERT INTO accounts (email) VALUES (?) ON CONFLICT(email) DO NOTHING")
      .bind(report.email),
    db.prepare("INSERT INTO reports (account_email, total_points, report_time) VALUES (?, ?, ?)")
      .bind(report.email, report.total_points, report.report_time),
    db.prepare(`
      DELETE FROM reports
      WHERE account_email = ? AND id NOT IN (
        SELECT id FROM reports WHERE account_email = ? ORDER BY id DESC LIMIT 5
      )
    `).bind(report.email, report.email),
  ]);

  return json({ success: true, message: "报告已接收。", data: report }, 201);
}

async function listReports(env) {
  const db = requireDatabase(env);
  const { results } = await db.prepare(`
    SELECT account_email AS email, total_points, report_time
    FROM reports ORDER BY id DESC
  `).all();
  const accounts = new Map();
  for (const row of results) {
    if (!accounts.has(row.email)) accounts.set(row.email, { email: row.email, reports: [] });
    accounts.get(row.email).reports.push({
      total_points: row.total_points,
      report_time: row.report_time,
    });
  }
  return [...accounts.values()].sort((left, right) =>
    right.reports[0].report_time.localeCompare(left.reports[0].report_time) ||
    left.email.localeCompare(right.email),
  );
}

function checkFormOrigin(request, requireOrigin = false) {
  const origin = request.headers.get("origin");
  if ((requireOrigin && origin === null) ||
      (origin !== null && origin !== new URL(request.url).origin) ||
      request.headers.get("sec-fetch-site") === "cross-site") {
    throw new HttpError(403, "请在本站页面提交此操作。");
  }
}

async function readForm(request) {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/x-www-form-urlencoded") {
    throw new HttpError(415, "请求必须使用表单编码。");
  }
  return new URLSearchParams(await readBodyText(request));
}

async function handleLogin(request, env, url) {
  if (!loginConfigured(env)) return html(renderLoginPage({ configured: false }), 503);
  if (request.method !== "POST") {
    const returnTo = safeReturnTo(url.searchParams.get("next"));
    if (await isAuthenticated(request, env)) return redirect(returnTo);
    return html(renderLoginPage({ returnTo }));
  }

  checkFormOrigin(request);
  const form = await readForm(request);
  const returnTo = safeReturnTo(form.get("next"));
  const username = form.get("username") ?? "";
  if (!(await credentialsMatch(username, form.get("password"), env))) {
    return html(renderLoginPage({ error: "账号或密码不正确。", username, returnTo }), 401);
  }
  return redirect(returnTo, 303, { "Set-Cookie": await createSessionCookie(request, env) });
}

async function handleAccountDelete(request, env, url) {
  if (request.method === "POST") {
    // 删除仅接受登录后的同源表单；必须经过确认操作。
    checkFormOrigin(request, true);
    const form = await readForm(request);
    if (form.get("confirm") !== "delete" || form.getAll("email").length !== 1) {
      throw new HttpError(400, "请在确认页面选择要删除的邮箱账号。");
    }
    const email = normalizeEmail(form.get("email"));
    const returnTo = safeReturnTo(form.get("next"));
    // 外键 ON DELETE CASCADE 在同一条 SQL 中原子删除账号及其全部报告。
    const result = await requireDatabase(env).prepare("DELETE FROM accounts WHERE email = ?")
      .bind(email).run();
    if (!result.meta.changes) {
      throw new HttpError(404, "账号不存在或已被删除，请刷新报告后重试。");
    }
    const destination = new URL(returnTo, url.origin);
    destination.searchParams.set("deleted", "1");
    return redirect(destination.pathname + destination.search, 303);
  }

  const email = normalizeEmail(url.searchParams.get("email"));
  const returnTo = safeReturnTo(url.searchParams.get("next"));
  const account = await requireDatabase(env).prepare(`
    SELECT email, (SELECT COUNT(*) FROM reports WHERE account_email = accounts.email) AS report_count
    FROM accounts WHERE email = ?
  `).bind(email).first();
  if (!account) throw new HttpError(404, "账号不存在或已被删除，请刷新报告后重试。");
  return html(renderDeletePage({ email: account.email, reportCount: account.report_count, returnTo }));
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const isPage = url.pathname === "/";
  const isApi = url.pathname === "/api/reports";
  const isLogin = url.pathname === "/login";
  const isLogout = url.pathname === "/logout";
  const isDelete = url.pathname === "/accounts/delete";
  if (!isPage && !isApi && !isLogin && !isLogout && !isDelete) {
    return json({ success: false, error: "接口不存在。" }, 404);
  }
  const allowed = isLogout ? ["POST"] : ["GET", "HEAD", "POST"];
  if (!allowed.includes(request.method)) {
    return json({ success: false, error: "请求方法不支持。" }, 405, { Allow: allowed.join(", ") });
  }

  try {
    if (isLogin) return await handleLogin(request, env, url);
    if (isLogout) {
      checkFormOrigin(request);
      return redirect("/login", 303, { "Set-Cookie": clearSessionCookie(request) });
    }
    // 自动上报只验证 API_KEY，不依赖网页登录状态或登录环境变量。
    if (request.method === "POST" && (isPage || isApi)) return await receiveReport(request, env);
    if (!loginConfigured(env)) {
      if (isPage || isDelete) return html(renderLoginPage({ configured: false }), 503);
      throw new HttpError(503, "请管理员配置 LOGIN_USERNAME 和 LOGIN_PASSWORD。");
    }
    if (!(await isAuthenticated(request, env))) {
      if (isApi) throw new HttpError(401, "请先登录后再查看报告。");
      const returnTo = safeReturnTo(isDelete ? url.searchParams.get("next") : url.pathname + url.search);
      return redirect(
        returnTo === "/" ? "/login" : `/login?next=${encodeURIComponent(returnTo)}`,
        request.method === "POST" ? 303 : 302,
      );
    }
    if (isDelete) return await handleAccountDelete(request, env, url);
    const accounts = await listReports(env);
    if (isApi) return json({ success: true, data: accounts });
    const query = (url.searchParams.get("q") ?? "").trim().slice(0, 254);
    return html(renderPage(accounts, query, { deleted: url.searchParams.get("deleted") === "1" }));
  } catch (error) {
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError
      ? error.message
      : "服务暂时不可用，请检查 D1 绑定和数据库迁移后重试。";
    if (!(error instanceof HttpError)) {
      console.error("Worker request failed:", error instanceof Error ? error.message : "Unknown error");
    }
    if (isLogin) return html(renderLoginPage({ error: message, configured: loginConfigured(env) }), status);
    if (isDelete) {
      return html(renderDeletePage({ error: message, returnTo: safeReturnTo(url.searchParams.get("next")) }), status);
    }
    if (isPage && ["GET", "HEAD"].includes(request.method)) {
      return html(renderUnavailablePage(), status);
    }
    return json({ success: false, error: message }, status);
  }
}

export default {
  async fetch(request, env) {
    const response = await handleRequest(request, env);
    return request.method === "HEAD" ? new Response(null, response) : response;
  },
};

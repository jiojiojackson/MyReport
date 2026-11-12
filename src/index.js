import { renderPage, renderUnavailablePage } from "./page.js";

const MAX_BODY_BYTES = 16 * 1024;
const encoder = new TextEncoder();
const RESPONSE_HEADERS = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, noarchive",
};
const HTML_HEADERS = {
  ...RESPONSE_HEADERS,
  "Content-Type": "text/html; charset=utf-8",
  "Content-Security-Policy":
    "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
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

async function keyMatches(provided, expected) {
  if (typeof provided !== "string" || provided.length === 0) return false;
  const digests = await Promise.all(
    [provided, expected].map((key) =>
      crypto.subtle.digest("SHA-256", encoder.encode(key)),
    ),
  );
  const left = new Uint8Array(digests[0]);
  const right = new Uint8Array(digests[1]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

async function readJson(request) {
  const type = request.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
  if (type !== "application/json") {
    throw new HttpError(415, "Content-Type 必须是 application/json。");
  }
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
  let body;
  try {
    body = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
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

function validateReport(body) {
  if (typeof body.email !== "string") {
    throw new HttpError(400, "email 必须是有效的账户邮箱。");
  }
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@\u0000-\u001f\u007f]+@[^\s@\u0000-\u001f\u007f]+\.[^\s@\u0000-\u001f\u007f]+$/u.test(email)) {
    throw new HttpError(400, "email 必须是有效的账户邮箱，长度不能超过 254 个字符。");
  }
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
  if (headerKey !== null && !(await keyMatches(headerKey, env.API_KEY))) {
    throw new HttpError(401, "api-key 缺失或不正确。");
  }
  const body = await readJson(request);
  if (headerKey === null && !(await keyMatches(body["api-key"] ?? body.api_key, env.API_KEY))) {
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const isPage = url.pathname === "/";
    const isApi = url.pathname === "/api/reports";
    if (!isPage && !isApi) return json({ success: false, error: "接口不存在。" }, 404);
    if (!["GET", "HEAD", "POST"].includes(request.method)) {
      return json({ success: false, error: "请求方法不支持。" }, 405, { Allow: "GET, HEAD, POST" });
    }

    try {
      if (request.method === "POST") return await receiveReport(request, env);
      const accounts = await listReports(env);
      if (isApi) {
        const response = json({ success: true, data: accounts });
        return request.method === "HEAD" ? new Response(null, response) : response;
      }
      const query = (url.searchParams.get("q") ?? "").trim().slice(0, 254);
      return new Response(request.method === "HEAD" ? null : renderPage(accounts, query), {
        headers: HTML_HEADERS,
      });
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 500;
      const message = error instanceof HttpError
        ? error.message
        : "服务暂时不可用，请检查 D1 绑定和数据库迁移后重试。";
      if (!(error instanceof HttpError)) {
        console.error("D1 request failed:", error instanceof Error ? error.message : "Unknown error");
      }
      if (isPage && ["GET", "HEAD"].includes(request.method)) {
        return new Response(request.method === "HEAD" ? null : renderUnavailablePage(), {
          status,
          headers: HTML_HEADERS,
        });
      }
      return json({ success: false, error: message }, status);
    }
  },
};

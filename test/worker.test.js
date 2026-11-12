import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from "miniflare";
import worker from "../src/index.js";
import { createSessionCookie } from "../src/auth.js";

const API_KEY = "test-key-never-use-in-production";
const ORIGIN = "https://myreport.example";
const LOGIN_USERNAME = "test-viewer";
const LOGIN_PASSWORD = "test-password-for-reports-only";
const LOGIN_ENV = { LOGIN_USERNAME, LOGIN_PASSWORD };
const example = { email: "alice@example.com", total_points: 1250.5, report_time: "2026-11-12 08:30" };
let mf;
let db;
let sessionCookie;

before(async () => {
  mf = new Miniflare(convertV4MiniflareOptions({
    modules: ["index.js", "page.js", "auth.js"].map((filename) => ({
      type: "ESModule",
      path: fileURLToPath(new URL(`../src/${filename}`, import.meta.url)),
    })),
    compatibilityDate: "2026-07-01",
    d1Databases: ["DB"],
    bindings: { API_KEY, ...LOGIN_ENV },
    log: new Log(LogLevel.ERROR),
  }));
  db = await mf.getD1Database("DB");
  const migration = await readFile(new URL("../migrations/0001_create_reports.sql", import.meta.url), "utf8");
  await db.batch(migration.split(";").map((sql) => sql.trim()).filter(Boolean).map((sql) => db.prepare(sql)));
  const response = await login();
  assert.equal(response.status, 303);
  sessionCookie = response.headers.get("set-cookie").split(";")[0];
});

beforeEach(async () => {
  await db.batch([db.prepare("DELETE FROM reports"), db.prepare("DELETE FROM accounts")]);
});

after(async () => {
  await mf?.dispose();
});

function post(body = example, { path = "/api/reports", key = API_KEY, headers = {} } = {}) {
  return mf.dispatchFetch(ORIGIN + path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(key === null ? {} : { "api-key": key }),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function visit(path = "/", options = {}) {
  return mf.dispatchFetch(ORIGIN + path, { redirect: "manual", ...options });
}

function read(path = "/", options = {}) {
  return visit(path, { ...options, headers: { Cookie: sessionCookie, ...options.headers } });
}

function login(values = {}, headers = {}) {
  return visit("/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, ...headers },
    body: new URLSearchParams({ username: LOGIN_USERNAME, password: LOGIN_PASSWORD, next: "/", ...values }).toString(),
  });
}

function deleteAccount(values = {}, headers = {}) {
  return read("/accounts/delete", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, ...headers },
    body: new URLSearchParams({ email: example.email, confirm: "delete", next: "/", ...values }).toString(),
  });
}

async function data() {
  const response = await read("/api/reports");
  assert.equal(response.status, 200);
  return (await response.json()).data;
}

async function assertNoWrites() {
  assert.equal((await db.prepare("SELECT count(*) AS total FROM accounts").first()).total, 0);
  assert.equal((await db.prepare("SELECT count(*) AS total FROM reports").first()).total, 0);
}

test("valid header-authenticated report is persisted in D1 and returned", async () => {
  const response = await post();
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { success: true, message: "报告已接收。", data: example });
  assert.deepEqual(await data(), [{ email: example.email, reports: [{ total_points: 1250.5, report_time: example.report_time }] }]);
});

test("JSON api-key and api_key are accepted when header is absent", async () => {
  for (const name of ["api-key", "api_key"]) {
    assert.equal((await post({ ...example, [name]: API_KEY }, { key: null })).status, 201);
  }
  assert.equal((await data())[0].reports.length, 2);
});

test("root URL also accepts POST reports", async () => {
  assert.equal((await post(example, { path: "/" })).status, 201);
  assert.equal((await data()).length, 1);
});

test("missing, empty, wrong and non-string keys never write to D1", async () => {
  for (const key of [null, "", "incorrect"]) {
    assert.equal((await post(example, { key })).status, 401);
  }
  for (const key of [123, {}, [], null]) {
    assert.equal((await post({ ...example, "api-key": key }, { key: null })).status, 401);
  }
  await assertNoWrites();
});

test("an incorrect header cannot be overridden by a correct JSON key", async () => {
  assert.equal((await post({ ...example, "api-key": API_KEY }, { key: "wrong" })).status, 401);
  await assertNoWrites();
});

test("unconfigured API_KEY rejects reports even with an empty key", async () => {
  for (const apiKey of [undefined, "", "   "]) {
    const request = new Request(ORIGIN + "/api/reports", {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": "" },
      body: JSON.stringify(example),
    });
    const response = await worker.fetch(request, { DB: db, API_KEY: apiKey });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).success, false);
  }
  await assertNoWrites();
});

test("valid reports normalize mailbox case and surrounding whitespace", async () => {
  await post({ ...example, email: " ALICE@Example.COM " });
  await post(example);
  assert.equal((await data()).length, 1);
  assert.equal((await data())[0].email, example.email);
  assert.equal((await data())[0].reports.length, 2);
  assert.equal((await db.prepare("SELECT count(*) AS total FROM accounts").first()).total, 1);
});

test("invalid mailboxes are rejected without writes", async () => {
  for (const email of [undefined, null, 1, "", "alice", "a@@example.com", "a b@example.com", "a@example", "a\u0000b@example.com", "a".repeat(250) + "@example.com"]) {
    assert.equal((await post({ ...example, email })).status, 400, String(email));
  }
  await assertNoWrites();
});

test("points must be numeric, finite and within the documented safe magnitude", async () => {
  for (const total_points of [undefined, null, "123", true, {}, [], Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal((await post({ ...example, total_points })).status, 400, String(total_points));
  }
  assert.equal((await post('{"email":"a@example.com","total_points":1e400,"report_time":"2026-11-12 08:30"}')).status, 400);
  await assertNoWrites();
});

test("zero, negative points, decimals and safe integers are preserved", async () => {
  for (const total_points of [0, -5, 12.25, Number.MAX_SAFE_INTEGER]) {
    assert.equal((await post({ ...example, total_points })).status, 201);
    assert.equal((await data())[0].reports[0].total_points, total_points);
  }
});

test("date validation checks exact format, real dates and leap years", async () => {
  const invalid = [undefined, null, 123, "2026-11-12T08:30", "2026-11-12 08:30:00", "2026-11-12 08:30\n", "2026-1-12 08:30", "2026-02-29 08:30", "2100-02-29 08:30", "2026-04-31 08:30", "2026-00-12 08:30", "2026-13-12 08:30", "2026-11-00 08:30", "2026-11-12 24:00", "2026-11-12 08:60", "0000-01-01 00:00"];
  for (const report_time of invalid) {
    assert.equal((await post({ ...example, report_time })).status, 400, String(report_time));
  }
  await assertNoWrites();
  for (const report_time of ["2024-02-29 23:59", "2000-02-29 00:00", "0001-01-01 00:00", "9999-12-31 23:59"]) {
    assert.equal((await post({ ...example, report_time })).status, 201, report_time);
  }
});

test("invalid JSON, root values and content types are rejected", async () => {
  for (const body of ["{", "", "null", "[]", "123", '"text"']) {
    assert.equal((await post(body)).status, 400, body);
  }
  assert.equal((await post(example, { headers: { "content-type": "text/plain" } })).status, 415);
  await assertNoWrites();
  assert.equal((await post(example, { headers: { "content-type": "application/json; charset=utf-8" } })).status, 201);
});

test("oversized bodies are rejected including chunked streams", async () => {
  assert.equal((await post({ ...example, padding: "x".repeat(16384) })).status, 413);
  const request = new Request(ORIGIN + "/api/reports", {
    method: "POST",
    headers: { "content-type": "application/json", "api-key": API_KEY },
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(9000)));
        controller.enqueue(new TextEncoder().encode("x".repeat(9000)));
        controller.close();
      },
    }),
    duplex: "half",
  });
  assert.equal((await worker.fetch(request, { DB: db, API_KEY })).status, 413);
  await assertNoWrites();
});

test("only the five last received reports remain, independent of client report time", async () => {
  for (let i = 1; i <= 7; i++) {
    const report_time = i === 7 ? "2020-01-01 00:00" : example.report_time;
    assert.equal((await post({ ...example, total_points: i, report_time })).status, 201);
  }
  const [account] = await data();
  assert.deepEqual(account.reports.map((report) => report.total_points), [7, 6, 5, 4, 3]);
  assert.equal(account.reports[0].report_time, "2020-01-01 00:00");
  assert.equal((await db.prepare("SELECT count(*) AS total FROM reports").first()).total, 5);
});

test("retention and histories are independent for each email", async () => {
  for (let i = 0; i < 8; i++) await post({ ...example, total_points: i });
  await post({ ...example, email: "bob@example.com", total_points: 500 });
  const accounts = await data();
  assert.equal(accounts.length, 2);
  assert.equal(accounts.find((account) => account.email === example.email).reports.length, 5);
  assert.equal(accounts.find((account) => account.email === "bob@example.com").reports.length, 1);
});

test("accounts sort by the report time of the last receipt, with deterministic email ties", async () => {
  await post({ ...example, email: "b@example.com", report_time: "2026-11-11 23:59" });
  await post({ ...example, email: "c@example.com", report_time: "2026-11-12 08:31" });
  await post({ ...example, email: "a@example.com", report_time: "2026-11-12 08:31" });
  await post({ ...example, email: "d@example.com", report_time: "2026-11-12 08:30" });
  // 这个账号曾收到更晚的报告，但最新收到的是一份旧报告，应按旧报告时间排序。
  await post({ ...example, email: "c@example.com", report_time: "2020-01-01 00:00" });
  assert.deepEqual((await data()).map((account) => account.email), ["a@example.com", "d@example.com", "b@example.com", "c@example.com"]);
  const html = await (await read()).text();
  assert.ok(html.indexOf('title="a@example.com"') < html.indexOf('title="d@example.com"'));
  assert.ok(html.indexOf('title="d@example.com"') < html.indexOf('title="b@example.com"'));
  assert.ok(html.indexOf('title="b@example.com"') < html.indexOf('title="c@example.com"'));
});

test("concurrent receipts still leave one account and five reports", async () => {
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => post({ ...example, total_points: i })));
  assert.ok(responses.every((response) => response.status === 201));
  await post({ ...example, total_points: 1000 });
  const [account] = await data();
  assert.equal(account.reports.length, 5);
  assert.equal(account.reports[0].total_points, 1000);
  assert.equal((await db.prepare("SELECT count(*) AS total FROM accounts").first()).total, 1);
  assert.equal((await db.prepare("SELECT count(*) AS total FROM reports").first()).total, 5);
});

test("a failed cleanup rolls back the insert and preserves all prior reports", async () => {
  for (let i = 1; i <= 5; i++) await post({ ...example, total_points: i });
  await db.prepare(`CREATE TRIGGER test_fail_cleanup BEFORE DELETE ON reports
    BEGIN SELECT RAISE(ABORT, 'forced cleanup failure'); END`).run();
  try {
    assert.equal((await post({ ...example, total_points: 6 })).status, 500);
    assert.deepEqual((await data())[0].reports.map((report) => report.total_points), [5, 4, 3, 2, 1]);
  } finally {
    await db.prepare("DROP TRIGGER test_fail_cleanup").run();
  }
});

test("a failed report insert also rolls back account creation", async () => {
  await db.prepare(`CREATE TRIGGER test_fail_insert BEFORE INSERT ON reports
    BEGIN SELECT RAISE(ABORT, 'forced insert failure'); END`).run();
  try {
    const response = await post();
    assert.equal(response.status, 500);
    const body = await response.text();
    assert.ok(!body.includes("forced insert failure"));
    assert.ok(!body.includes(API_KEY));
    await assertNoWrites();
  } finally {
    await db.prepare("DROP TRIGGER test_fail_insert").run();
  }
});

test("the page has exactly the eleven required columns and missing history placeholders", async () => {
  await post();
  const response = await read();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /text\/html/);
  const html = await response.text();
  assert.equal((html.match(/scope="col"/g) ?? []).length, 11);
  for (const label of ["账号名称", "最近总积分", "最近报告时间", ...[2, 3, 4, 5].flatMap((i) => [`历史总积分${i}`, `历史报告时间${i}`])]) {
    assert.ok(html.includes(label), label);
  }
  assert.equal((html.match(/class="missing"/g) ?? []).length, 8);
  assert.ok(html.includes("1250.5"));
  assert.ok(html.includes(example.report_time));
  assert.ok(!html.includes(API_KEY));
});

test("an empty database displays the waiting state and an empty JSON array", async () => {
  assert.deepEqual(await data(), []);
  const html = await (await read()).text();
  assert.ok(html.includes("等待第一份报告"));
  assert.ok(html.includes('colspan="11"'));
});

test("email search filters the page while preserving table order", async () => {
  await post();
  await post({ ...example, email: "bob@example.com" });
  const html = await (await read("/?q=ALICE")).text();
  assert.ok(html.includes('title="alice@example.com"'));
  assert.ok(!html.includes('title="bob@example.com"'));
  const emptyHtml = await (await read("/?q=nobody")).text();
  assert.ok(emptyHtml.includes("没有找到匹配的账号"));
});

test("mailbox and search markup is escaped and SQL values are bound", async () => {
  const email = "<svg/onload=alert(1)>@example.com";
  assert.equal((await post({ ...example, email })).status, 201);
  assert.equal((await post({ ...example, email: "o'hara@example.com" })).status, 201);
  const html = await (await read()).text();
  assert.ok(!html.includes("<svg/onload=alert(1)>"));
  assert.ok(html.includes("&lt;svg/onload=alert(1)&gt;@example.com"));
  assert.ok(html.includes("o&#39;hara@example.com"));
  const query = '\"><script>alert(1)</script>';
  const searchHtml = await (await read("/?q=" + encodeURIComponent(query))).text();
  assert.ok(!searchHtml.includes("<script>"));
  assert.ok(searchHtml.includes("&quot;&gt;&lt;script&gt;"));
  assert.equal((await data()).length, 2);
});

test("page and API responses are not cached; the page disallows scripts", async () => {
  for (const path of ["/", "/api/reports"]) {
    const response = await read(path);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  }
  const page = await read();
  assert.match(page.headers.get("content-security-policy"), /script-src 'none'/);
});

test("HEAD, unsupported methods and unknown paths return appropriate responses", async () => {
  for (const path of ["/", "/api/reports"]) {
    const response = await read(path, { method: "HEAD" });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "");
  }
  const unsupported = await mf.dispatchFetch(ORIGIN + "/api/reports", { method: "DELETE" });
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "GET, HEAD, POST");
  assert.equal((await mf.dispatchFetch(ORIGIN + "/missing")).status, 404);
});

test("missing database bindings return useful errors without exposing internals", async () => {
  const page = await worker.fetch(new Request(ORIGIN, { headers: { Cookie: sessionCookie } }), LOGIN_ENV);
  assert.equal(page.status, 503);
  assert.ok((await page.text()).includes("报告暂时无法加载"));
  const api = await worker.fetch(new Request(ORIGIN + "/api/reports", { headers: { Cookie: sessionCookie } }), LOGIN_ENV);
  assert.equal(api.status, 503);
  assert.equal((await api.json()).success, false);
});

test("unauthenticated page requests redirect to login without exposing report data", async () => {
  await post();
  const response = await visit();
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("location"), "/login");
  assert.ok(!(await response.text()).includes(example.email));
  const search = await visit("/?q=alice");
  assert.equal(search.status, 302);
  assert.equal(search.headers.get("location"), "/login?next=%2F%3Fq%3Dalice");
});

test("GET API cannot be bypassed with an API key or login credentials in a query", async () => {
  await post();
  const response = await visit("/api/reports", { headers: { "api-key": API_KEY } });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { success: false, error: "请先登录后再查看报告。" });
  assert.equal((await visit("/api/reports?username=" + LOGIN_USERNAME + "&password=" + LOGIN_PASSWORD)).status, 401);
});

test("login page has a POST form and never reveals the configured credentials", async () => {
  const response = await visit("/login");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const html = await response.text();
  assert.ok(html.includes("登录查看报告"));
  assert.ok(html.includes('action="/login" method="post"'));
  assert.ok(html.includes('type="password" autocomplete="current-password"'));
  assert.ok(!html.includes(LOGIN_USERNAME));
  assert.ok(!html.includes(LOGIN_PASSWORD));
  assert.ok(!html.includes(API_KEY));
});

test("successful login issues a secure signed cookie that unlocks the page and API", async () => {
  await post();
  const response = await login();
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/");
  const setCookie = response.headers.get("set-cookie");
  assert.match(setCookie, /^__Host-myreport_session=/);
  for (const flag of ["Max-Age=43200", "Path=/", "HttpOnly", "SameSite=Strict", "Secure"]) {
    assert.ok(setCookie.includes(flag), flag);
  }
  assert.ok(!setCookie.includes("Domain="));
  assert.ok(!setCookie.includes(LOGIN_PASSWORD));
  const cookie = setCookie.split(";")[0];
  assert.equal((await visit("/", { headers: { Cookie: cookie } })).status, 200);
  const api = await visit("/api/reports", { headers: { Cookie: cookie } });
  assert.equal(api.status, 200);
  assert.equal((await api.json()).data[0].email, example.email);
  const html = await (await read()).text();
  assert.ok(html.includes('action="/logout" method="post"'));
  assert.ok(html.includes("退出登录"));
});

test("incorrect and missing login credentials return the same error without setting cookies", async () => {
  for (const values of [
    { username: "wrong" }, { password: "wrong" }, { username: "", password: "" },
    { username: LOGIN_USERNAME.toUpperCase() }, { password: " " + LOGIN_PASSWORD },
  ]) {
    const response = await login(values);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    const html = await response.text();
    assert.ok(html.includes("账号或密码不正确。"));
    assert.ok(!html.includes(LOGIN_PASSWORD));
  }
  await assertNoWrites();
});

test("empty or missing login settings keep page and JSON reports closed", async () => {
  await post();
  for (const settings of [
    {}, { LOGIN_USERNAME }, { LOGIN_PASSWORD },
    { ...LOGIN_ENV, LOGIN_USERNAME: "" }, { ...LOGIN_ENV, LOGIN_PASSWORD: "   " },
  ]) {
    const env = { DB: db, API_KEY, ...settings };
    for (const path of ["/", "/login", "/api/reports"]) {
      const response = await worker.fetch(new Request(ORIGIN + path, { headers: { Cookie: sessionCookie } }), env);
      assert.equal(response.status, 503);
      assert.ok(!(await response.text()).includes(example.email));
    }
  }
});

test("POST reporting still works when webpage login settings are absent", async () => {
  for (const path of ["/", "/api/reports"]) {
    const response = await worker.fetch(new Request(ORIGIN + path, {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": API_KEY },
      body: JSON.stringify(example),
    }), { DB: db, API_KEY });
    assert.equal(response.status, 201);
  }
  assert.equal((await data())[0].reports.length, 2);
});

test("a website session alone does not authorize a report write", async () => {
  const response = await post(example, { key: null, headers: { Cookie: sessionCookie } });
  assert.equal(response.status, 401);
  await assertNoWrites();
});

test("modified, malformed, duplicate and expired session cookies are rejected", async () => {
  const [name, token] = sessionCookie.split("=");
  const [payload, signature] = token.split(".");
  const alteredPayload = (payload[0] === "A" ? "B" : "A") + payload.slice(1);
  const alteredSignature = (signature[0] === "A" ? "B" : "A") + signature.slice(1);
  const expired = (await createSessionCookie(new Request(ORIGIN), LOGIN_ENV, Date.now() - 13 * 60 * 60 * 1000)).split(";")[0];
  for (const cookie of [
    `${name}=${alteredPayload}.${signature}`, `${name}=${payload}.${alteredSignature}`,
    `${name}=malformed`, `${name}=a.b`, `${name}=`, `${name}=${"a".repeat(1200)}.b`,
    `${sessionCookie}; ${sessionCookie}`, expired,
  ]) {
    assert.equal((await visit("/api/reports", { headers: { Cookie: cookie } })).status, 401);
    assert.equal((await visit("/", { headers: { Cookie: cookie } })).status, 302);
  }
});

test("changing either login variable immediately invalidates existing cookies", async () => {
  for (const changes of [{ LOGIN_USERNAME: "new-viewer" }, { LOGIN_PASSWORD: "new-password" }]) {
    const response = await worker.fetch(new Request(ORIGIN + "/api/reports", {
      headers: { Cookie: sessionCookie },
    }), { DB: db, ...LOGIN_ENV, ...changes });
    assert.equal(response.status, 401);
  }
});

test("session signatures are bound to the origin", async () => {
  const response = await worker.fetch(new Request("https://another.example/api/reports", {
    headers: { Cookie: sessionCookie },
  }), { DB: db, ...LOGIN_ENV });
  assert.equal(response.status, 401);
});

test("logout clears the browser cookie and redirects to the login page", async () => {
  const response = await read("/logout", { method: "POST", headers: { Origin: ORIGIN } });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/login");
  assert.match(response.headers.get("set-cookie"), /^__Host-myreport_session=; Max-Age=0;/);
  assert.equal((await visit("/api/reports")).status, 401);
  const getLogout = await read("/logout");
  assert.equal(getLogout.status, 405);
  assert.equal(getLogout.headers.get("allow"), "POST");
});

test("login and logout reject cross-origin form submissions", async () => {
  for (const headers of [{ Origin: "https://evil.example" }, { Origin: "null" }, { "Sec-Fetch-Site": "cross-site" }]) {
    assert.equal((await login({}, headers)).status, 403);
    const response = await read("/logout", { method: "POST", headers: { Origin: ORIGIN, ...headers } });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("login returns only to the report page and preserves email searches", async () => {
  const filtered = await login({ next: "/?q=alice%40example.com" });
  assert.equal(filtered.headers.get("location"), "/?q=alice%40example.com");
  for (const next of ["https://evil.example", "//evil.example", "/\\evil.example", "/api/reports", "javascript:alert(1)"]) {
    const response = await login({ next });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/");
  }
  const existing = await read("/login?next=%2F%3Fq%3Dalice");
  assert.equal(existing.status, 302);
  assert.equal(existing.headers.get("location"), "/?q=alice");
});

test("login form escapes reflected fields and never echoes the password", async () => {
  const response = await login({ username: '\"><script>alert(1)</script>', password: "do-not-echo-this", next: '/?q=\"><script>alert(2)</script>' });
  assert.equal(response.status, 401);
  const html = await response.text();
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&quot;&gt;&lt;script&gt;"));
  assert.ok(!html.includes("do-not-echo-this"));
});

test("login form requests enforce the body limit and form content type", async () => {
  assert.equal((await login({}, { "Content-Type": "application/json" })).status, 415);
  assert.equal((await login({ password: "x".repeat(17000) })).status, 413);
  const empty = await visit("/login", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN }, body: "",
  });
  assert.equal(empty.status, 401);
  await assertNoWrites();
});

test("unauthenticated HEAD requests never return an HTML or JSON body", async () => {
  for (const [path, status] of [["/", 302], ["/login", 200], ["/api/reports", 401], ["/logout", 405]]) {
    const response = await visit(path, { method: "HEAD" });
    assert.equal(response.status, status);
    assert.equal(await response.text(), "");
  }
});

test("local HTTP development uses a host-only HttpOnly cookie", async () => {
  const request = new Request("http://127.0.0.1:8787/login", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: "http://127.0.0.1:8787" },
    body: new URLSearchParams({ username: LOGIN_USERNAME, password: LOGIN_PASSWORD }),
  });
  const response = await worker.fetch(request, LOGIN_ENV);
  assert.equal(response.status, 303);
  const cookie = response.headers.get("set-cookie");
  assert.match(cookie, /^myreport_session=/);
  assert.ok(cookie.includes("HttpOnly"));
  assert.ok(!cookie.includes("Secure"));
  assert.ok(!cookie.includes("Domain="));
});

test("management mode reveals delete entries while retaining all eleven report columns", async () => {
  await post();
  const html = await (await read("/?q=alice&manage=1")).text();
  assert.equal((html.match(/scope="col"/g) ?? []).length, 11);
  assert.ok(html.includes("删除全部记录"));
  assert.ok(html.includes("/accounts/delete?email=alice%40example.com&amp;next=%2F%3Fq%3Dalice%26manage%3D1"));
});

test("GET and HEAD deletion confirmation never change database records", async () => {
  for (let i = 0; i < 7; i++) await post({ ...example, total_points: i });
  const before = await data();
  const response = await read("/accounts/delete?email=alice%40example.com&next=%2F%3Fq%3Dalice");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(html.includes("删除账号及全部记录？"));
  assert.ok(html.includes(example.email));
  assert.ok(html.includes("<strong>5</strong> 份报告"));
  assert.ok(html.includes('action="/accounts/delete" method="post"'));
  assert.ok(html.includes('href="/?q=alice"'));
  assert.ok(html.includes('name="next" value="/?q=alice"'));
  const head = await read("/accounts/delete?email=alice%40example.com", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  await read("/?q=alice");
  assert.deepEqual(await data(), before);
});

test("confirmed deletion removes the account and all its D1 records, preserving other emails", async () => {
  for (let i = 0; i < 7; i++) await post({ ...example, total_points: i });
  await post({ ...example, email: "bob@example.com", total_points: 50 });
  await post({ ...example, email: "bob@example.com", total_points: 60 });
  const before = (await data()).find((account) => account.email === "bob@example.com");
  const response = await deleteAccount({ next: "/?q=alice" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/?q=alice&deleted=1");
  assert.equal(await db.prepare("SELECT email FROM accounts WHERE email = ?").bind(example.email).first(), null);
  assert.equal((await db.prepare("SELECT COUNT(*) AS total FROM reports WHERE account_email = ?").bind(example.email).first()).total, 0);
  assert.deepEqual(await data(), [before]);
  const html = await (await read(response.headers.get("location"))).text();
  assert.ok(html.includes("账号及全部报告已删除。"));
  assert.ok(!html.includes('title="alice@example.com"'));
});

test("deleting the final account updates empty state and aggregate counts", async () => {
  await post();
  const response = await deleteAccount();
  assert.equal(response.status, 303);
  await assertNoWrites();
  assert.deepEqual(await data(), []);
  const html = await (await read(response.headers.get("location"))).text();
  assert.ok(html.includes("等待第一份报告"));
  assert.ok(html.includes("账号及全部报告已删除。"));
  assert.ok(html.includes('<dd>0<small>个</small>'));
  assert.ok(html.includes('<dd>0<small>份</small>'));
});

test("deletion requires a valid webpage session even when a correct API key is supplied", async () => {
  await post();
  const confirmation = await visit("/accounts/delete?email=alice%40example.com");
  assert.equal(confirmation.status, 302);
  assert.ok(!(await confirmation.text()).includes(example.email));
  const expired = (await createSessionCookie(new Request(ORIGIN), LOGIN_ENV, Date.now() - 13 * 3600 * 1000)).split(";")[0];
  for (const cookie of ["", "__Host-myreport_session=invalid", expired]) {
    const response = await visit("/accounts/delete", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN, "api-key": API_KEY, Cookie: cookie },
      body: new URLSearchParams({ email: example.email, confirm: "delete" }),
    });
    assert.equal(response.status, 303);
    assert.equal(response.headers.get("location"), "/login");
  }
  assert.equal((await data())[0].reports.length, 1);
});

test("missing login configuration cannot expose confirmation or authorize deletion", async () => {
  await post();
  for (const method of ["GET", "POST"]) {
    const request = new Request(ORIGIN + "/accounts/delete?email=alice%40example.com", {
      method,
      headers: { Cookie: sessionCookie, Origin: ORIGIN, "Content-Type": "application/x-www-form-urlencoded" },
      ...(method === "POST" ? { body: new URLSearchParams({ email: example.email, confirm: "delete" }) } : {}),
    });
    const response = await worker.fetch(request, { DB: db, API_KEY });
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes(example.email));
  }
  assert.equal((await data()).length, 1);
});

test("deletion rejects missing or cross-site origins without changing D1", async () => {
  await post();
  for (const headers of [{}, { Origin: "https://evil.example" }, { Origin: "null" }, { Origin: ORIGIN, "Sec-Fetch-Site": "cross-site" }]) {
    const response = await read("/accounts/delete", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", ...headers },
      body: new URLSearchParams({ email: example.email, confirm: "delete" }),
    });
    assert.equal(response.status, 403);
  }
  assert.equal((await data()).length, 1);
});

test("deletion requires explicit confirmation and one valid email", async () => {
  await post();
  for (const body of [
    "email=alice%40example.com", "email=alice%40example.com&confirm=cancel", "confirm=delete",
    "email=alice%40example.com&email=bob%40example.com&confirm=delete", "email=invalid&confirm=delete",
  ]) {
    const response = await read("/accounts/delete", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: ORIGIN }, body,
    });
    assert.equal(response.status, 400);
  }
  assert.equal((await data()).length, 1);
});

test("missing or already deleted accounts return 404 and preserve remaining data", async () => {
  await post();
  assert.equal((await read("/accounts/delete?email=missing%40example.com")).status, 404);
  assert.equal((await deleteAccount({ email: "missing@example.com" })).status, 404);
  assert.equal((await data()).length, 1);
  assert.equal((await deleteAccount()).status, 303);
  assert.equal((await deleteAccount()).status, 404);
  await assertNoWrites();
});

test("a cascade failure rolls back both the account deletion and all report deletions", async () => {
  for (let i = 1; i <= 3; i++) await post({ ...example, total_points: i });
  await post({ ...example, email: "bob@example.com" });
  const before = await data();
  await db.prepare(`CREATE TRIGGER test_fail_account_delete BEFORE DELETE ON reports
    WHEN OLD.account_email = 'alice@example.com'
    BEGIN SELECT RAISE(ABORT, 'forced account deletion failure'); END`).run();
  try {
    const response = await deleteAccount();
    assert.equal(response.status, 500);
    const html = await response.text();
    assert.ok(html.includes("无法删除账号记录"));
    assert.ok(!html.includes("forced account deletion failure"));
    assert.deepEqual(await data(), before);
    assert.equal((await db.prepare("SELECT COUNT(*) AS total FROM accounts").first()).total, 2);
    assert.equal((await db.prepare("SELECT COUNT(*) AS total FROM reports").first()).total, 4);
  } finally {
    await db.prepare("DROP TRIGGER test_fail_account_delete").run();
  }
});

test("deletion binds quoted email values and escapes confirmation page content", async () => {
  const email = "o'hara@example.com";
  await post({ ...example, email });
  await post({ ...example, email: "bob@example.com" });
  const confirmation = await read("/accounts/delete?email=" + encodeURIComponent(email));
  assert.equal(confirmation.status, 200);
  assert.ok((await confirmation.text()).includes("o&#39;hara@example.com"));
  assert.equal((await deleteAccount({ email: " O'HARA@EXAMPLE.COM " })).status, 303);
  assert.equal((await data())[0].email, "bob@example.com");
  const markup = "<svg/onload=alert(1)>@example.com";
  await post({ ...example, email: markup });
  const html = await (await read("/accounts/delete?email=" + encodeURIComponent(markup))).text();
  assert.ok(!html.includes("<svg/onload=alert(1)>"));
  assert.ok(html.includes("&lt;svg/onload=alert(1)&gt;@example.com"));
});

test("deletion form validation and body limits do not remove data", async () => {
  await post();
  assert.equal((await deleteAccount({}, { "Content-Type": "application/json" })).status, 415);
  assert.equal((await deleteAccount({ padding: "x".repeat(17000) })).status, 413);
  const unsupported = await read("/accounts/delete", { method: "DELETE" });
  assert.equal(unsupported.status, 405);
  assert.equal(unsupported.headers.get("allow"), "GET, HEAD, POST");
  assert.equal((await data()).length, 1);
});

test("deletion and cancellation return URLs cannot redirect away from the report page", async () => {
  await post();
  const html = await (await read("/accounts/delete?email=alice%40example.com&next=" + encodeURIComponent("https://evil.example"))).text();
  assert.ok(!html.includes('href="https://evil.example"'));
  assert.ok(html.includes('name="next" value="/"'));
  const response = await deleteAccount({ next: "//evil.example" });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get("location"), "/?deleted=1");
});

test("deletion includes reports received after the confirmation page was opened", async () => {
  await post();
  assert.equal((await read("/accounts/delete?email=alice%40example.com")).status, 200);
  await post({ ...example, total_points: 2000 });
  assert.equal((await data())[0].reports.length, 2);
  assert.equal((await deleteAccount()).status, 303);
  await assertNoWrites();
});

test("a later upload recreates the deleted email with a fresh history", async () => {
  await post();
  await post({ ...example, total_points: 2000 });
  assert.equal((await deleteAccount()).status, 303);
  await assertNoWrites();
  await post({ ...example, total_points: 9999 });
  const [account] = await data();
  assert.deepEqual(account.reports, [{ total_points: 9999, report_time: example.report_time }]);
});

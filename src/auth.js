export const SESSION_MAX_AGE = 12 * 60 * 60;
const encoder = new TextEncoder();

export function loginConfigured(env) {
  return [env.LOGIN_USERNAME, env.LOGIN_PASSWORD].every(
    (value) => typeof value === "string" && value.trim().length > 0,
  );
}

export async function secretMatches(provided, expected) {
  if (typeof provided !== "string" || provided.length === 0) return false;
  const digests = await Promise.all(
    [provided, expected].map((value) => crypto.subtle.digest("SHA-256", encoder.encode(value))),
  );
  const left = new Uint8Array(digests[0]);
  const right = new Uint8Array(digests[1]);
  let difference = 0;
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i];
  return difference === 0;
}

export async function credentialsMatch(username, password, env) {
  const matches = await Promise.all([
    secretMatches(username, env.LOGIN_USERNAME),
    secretMatches(password, env.LOGIN_PASSWORD),
  ]);
  return matches.every(Boolean);
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/u, "");
}

function decodeBase64url(value) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

async function sessionKey(request, env) {
  // 把会话限定在当前站点；修改任一登录凭据后，旧签名立即失效。
  const material = JSON.stringify([
    "myreport-session-v1", new URL(request.url).origin, env.LOGIN_USERNAME, env.LOGIN_PASSWORD,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(material));
  return crypto.subtle.importKey("raw", digest, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function cookieSettings(request) {
  const url = new URL(request.url);
  const isLocal = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const secure = url.protocol === "https:" || !isLocal;
  return {
    name: secure ? "__Host-myreport_session" : "myreport_session",
    attributes: `Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}`,
  };
}

export async function createSessionCookie(request, env, now = Date.now()) {
  const payload = base64url(encoder.encode(JSON.stringify({
    exp: Math.floor(now / 1000) + SESSION_MAX_AGE,
    nonce: crypto.randomUUID(),
  })));
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(request, env), encoder.encode(payload));
  const cookie = cookieSettings(request);
  return `${cookie.name}=${payload}.${base64url(new Uint8Array(signature))}; Max-Age=${SESSION_MAX_AGE}; ${cookie.attributes}`;
}

export function clearSessionCookie(request) {
  const cookie = cookieSettings(request);
  return `${cookie.name}=; Max-Age=0; ${cookie.attributes}`;
}

export async function isAuthenticated(request, env) {
  if (!loginConfigured(env)) return false;
  const name = cookieSettings(request).name;
  const cookies = (request.headers.get("cookie") ?? "").split(";")
    .map((part) => part.trim()).filter((part) => part.startsWith(`${name}=`));
  if (cookies.length !== 1) return false;
  const token = cookies[0].slice(name.length + 1);
  if (token.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) return false;

  try {
    const [payload, signature] = token.split(".");
    const verified = await crypto.subtle.verify(
      "HMAC", await sessionKey(request, env), decodeBase64url(signature), encoder.encode(payload),
    );
    if (!verified) return false;
    const session = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(decodeBase64url(payload)));
    return Number.isSafeInteger(session.exp) && session.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export function safeReturnTo(value) {
  if (typeof value !== "string" || value.length > 2048) return "/";
  try {
    const target = new URL(value, "https://myreport.invalid");
    return target.origin === "https://myreport.invalid" && target.pathname === "/"
      ? target.pathname + target.search
      : "/";
  } catch {
    return "/";
  }
}

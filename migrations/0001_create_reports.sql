-- 邮箱是账号主键；同一账号的五份历史报告保存在 reports 子表中。
CREATE TABLE IF NOT EXISTS accounts (
  email TEXT PRIMARY KEY NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_email TEXT NOT NULL REFERENCES accounts(email) ON DELETE CASCADE,
  total_points REAL NOT NULL,
  report_time TEXT NOT NULL,
  received_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- 自增 ID 表示数据库实际接收顺序，同一分钟内的报告也能准确排序。
CREATE INDEX IF NOT EXISTS idx_reports_account_id
  ON reports(account_email, id DESC);

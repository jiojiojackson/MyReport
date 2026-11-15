-- 标签属于邮箱账号，独立于只保留五份的报告历史。
CREATE TABLE account_tags (
  account_email TEXT NOT NULL REFERENCES accounts(email) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  tag TEXT NOT NULL,
  PRIMARY KEY (account_email, position),
  UNIQUE (account_email, tag)
);

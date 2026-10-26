#!/usr/bin/env node
/**
 * gh_push.js —— 通过 GitHub REST API 把本地仓库推上去（不需要 git push）
 *
 * 为什么不用 git push：这台机器连不上 github.com（网络策略拦截 502），
 * 但 api.github.com 通。所以用 Git Data API 直接传对象：
 *   blobs → tree → commit → ref，行为和一次强制推送等价。
 *
 * 用法：
 *   GITHUB_TOKEN=ghp_xxx node scripts/gh_push.js
 *   node scripts/gh_push.js --token=ghp_xxx --repo=xundao --private
 *
 * 权限：classic token 勾 repo（或 fine-grained 给 Contents: RW + Pages: RW + Administration: R/W）
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const API = "https://api.github.com";

/* ---------- 参数 ---------- */
const argv = process.argv.slice(2);
const opt = k => {
  const hit = argv.find(a => a.startsWith(`--${k}=`));
  return hit ? hit.slice(k.length + 3) : null;
};
const TOKEN = process.env.GITHUB_TOKEN || opt("token");
const REPO = opt("repo") || "xundao";
const PRIVATE = argv.includes("--private");
const DRY = argv.includes("--dry-run");

if (!TOKEN && !DRY) {
  console.error("缺少 token：GITHUB_TOKEN=xxx node scripts/gh_push.js");
  process.exit(1);
}

const HEADERS = {
  "User-Agent": "xundao-deploy",
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  Authorization: "Bearer " + TOKEN,
  "Content-Type": "application/json",
};

async function api(method, url, body) {
  const res = await fetch(url.startsWith("http") ? url : API + url, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`${method} ${url} → ${res.status} ${json && json.message ? json.message : text.slice(0, 200)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

/* ---------- 1. 文件清单（只取已提交、已被 git 追踪的） ---------- */
function listFiles() {
  const out = execFileSync("git", ["-C", ROOT, "ls-files", "-z"], { maxBuffer: 64 * 1024 * 1024 });
  return out.toString("utf8").split("\0").filter(Boolean);
}

async function main() {
  const files = listFiles();
  const totalBytes = files.reduce((n, f) => n + fs.statSync(path.join(ROOT, f)).size, 0);
  console.log(`本地已追踪 ${files.length} 个文件 / ${(totalBytes / 1048576).toFixed(1)} MB`);
  if (DRY) { console.log("（dry-run：只列清单，不联网）"); files.slice(0, 8).forEach(f => console.log("  " + f)); return; }

  /* 2. 身份 */
  const me = await api("GET", "/user");
  const owner = me.login;
  console.log(`账号：${owner}　目标仓库：${owner}/${REPO}${PRIVATE ? "（私有）" : "（公开）"}`);

  /* 3. 建仓（已存在就复用） */
  let repo = null;
  try {
    repo = await api("GET", `/repos/${owner}/${REPO}`);
    console.log("仓库已存在，继续更新内容");
  } catch (e) {
    if (e.status !== 404) throw e;
    repo = await api("POST", "/user/repos", {
      name: REPO,
      description: "《驯刀》现代都市双线双视角文字游戏（18+）",
      homepage: `https://${owner}.github.io/${REPO}/`,
      private: PRIVATE,
      has_issues: true,
      has_wiki: false,
      has_projects: false,
      auto_init: false,
    });
    console.log("仓库已创建");
  }

  /* 4. 空仓库需要先有一个提交，否则写 blob 会被拒（409 Git Repository is empty） */
  let hasRef = false;
  try { await api("GET", `/repos/${owner}/${REPO}/git/ref/heads/main`); hasRef = true; }
  catch (e) { if (e.status !== 404 && e.status !== 409) throw e; }
  if (!hasRef) {
    await api("PUT", `/repos/${owner}/${REPO}/contents/.init`, {
      message: "初始化仓库",
      content: Buffer.from("xundao init\n", "utf8").toString("base64"),
      branch: "main",
    });
    console.log("空仓库已初始化（占位提交，稍后被完整内容覆盖）");
  }

  /* 5. 上传 blob（同内容只传一次） */
  const shaCache = new Map();      // 内容哈希 → blob sha
  const entries = [];
  let uploaded = 0, reused = 0, sent = 0;

  const queue = files.slice();
  const CONCURRENCY = 8;

  async function worker() {
    while (queue.length) {
      const f = queue.shift();
      const abs = path.join(ROOT, f);
      const buf = fs.readFileSync(abs);
      const h = crypto.createHash("sha1").update(buf).digest("hex");
      let sha = shaCache.get(h);
      if (!sha) {
        const blob = await api("POST", `/repos/${owner}/${REPO}/git/blobs`, {
          content: buf.toString("base64"),
          encoding: "base64",
        });
        sha = blob.sha;
        shaCache.set(h, sha);
        uploaded++; sent += buf.length;
      } else {
        reused++;
      }
      entries.push({ path: f, mode: "100644", type: "blob", sha });
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  entries.sort((a, b) => (a.path < b.path ? -1 : 1));
  console.log(`上传完成：新传 ${uploaded} 个（${(sent / 1048576).toFixed(1)} MB），复用同内容 ${reused} 个`);

  /* 5. tree → commit → ref */
  const tree = await api("POST", `/repos/${owner}/${REPO}/git/trees`, { tree: entries });

  let parents = [];
  try {
    const ref = await api("GET", `/repos/${owner}/${REPO}/git/ref/heads/main`);
    parents = [ref.object.sha];
  } catch (e) {
    if (e.status !== 404 && e.status !== 409) throw e;
  }

  const msg = execFileSync("git", ["-C", ROOT, "log", "-1", "--pretty=%B"], { maxBuffer: 8 * 1024 * 1024 }).toString("utf8").trim()
    || `部署《驯刀》网页（${new Date().toISOString().slice(0, 10)}）`;

  const commit = await api("POST", `/repos/${owner}/${REPO}/git/commits`, {
    message: msg,
    tree: tree.sha,
    parents,
  });

  if (parents.length) {
    await api("PATCH", `/repos/${owner}/${REPO}/git/refs/heads/main`, { sha: commit.sha, force: true });
  } else {
    await api("POST", `/repos/${owner}/${REPO}/git/refs`, { ref: "refs/heads/main", sha: commit.sha });
  }
  console.log(`已推送提交 ${commit.sha.slice(0, 7)} → main`);

  /* 6. 开启 GitHub Pages（直接发布仓库根目录，根 index.html 跳转到 game/） */
  const pagesBody = { source: { branch: "main", path: "/" } };
  try {
    const p = await api("POST", `/repos/${owner}/${REPO}/pages`, pagesBody);
    console.log("Pages 已开启：" + p.html_url);
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      const p = await api("PUT", `/repos/${owner}/${REPO}/pages`, pagesBody);
      console.log("Pages 已更新：" + p.html_url);
    } else {
      console.warn("Pages 开启失败（可稍后在仓库 Settings → Pages 手动选 main / (root)）：" + e.message);
    }
  }

  /* 7. 等首次构建 */
  const htmlUrl = `https://${owner}.github.io/${REPO}/`;   // 根目录跳转到 game/
  console.log("等待构建…");
  for (let i = 0; i < 40; i++) {
    await new Promise(r => setTimeout(r, 6000));
    let b = null;
    try { b = await api("GET", `/repos/${owner}/${REPO}/pages/builds/latest`); } catch (e) { continue; }
    if (!b) continue;
    if (b.status === "built") { console.log(`构建完成：${htmlUrl}`); break; }
    if (b.status === "errored") { console.log("构建失败：" + (b.error && b.error.message)); break; }
    process.stdout.write(`  ${b.status}… `);
  }

  console.log("\n完成");
  console.log("  仓库：" + repo.html_url);
  console.log("  网页：" + htmlUrl);
}

main().catch(e => {
  console.error("失败：" + e.message);
  if (e.body && e.body.errors) console.error(JSON.stringify(e.body.errors, null, 2));
  process.exit(1);
});

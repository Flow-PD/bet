// jsdom E2E: 验证从 Excel 导出的中文日期（如「2026年7月10日」）能被正确解析、导入后记录带有日期
// 思路：用 Node 端 xlsx（与页面 CDN 同款 SheetJS）把真实 Excel 转成 sheet_to_csv 文本，
// 再走页面的「CSV 导入路径」（parseDelimited + normImportDate）验证日期不再丢失。
const fs = require("fs");
const path = require("path");
const { JSDOM, VirtualConsole } = require("C:/Users/31219/.workbuddy/binaries/node/workspace/node_modules/jsdom");
const XLSX = require("C:/Users/31219/.workbuddy/binaries/node/workspace/node_modules/xlsx");

const HTML = fs.readFileSync("C:/Users/31219/WorkBuddy/2026-07-28-09-46-08/bet-tracker/index.html", "utf8");
const XLSX_PATH = "C:/Users/31219/Desktop/投注记录-20240618.xlsx";

function makeChain() {
  const result = Promise.resolve({ data: [], error: null });
  ["select", "eq", "order", "upsert", "insert", "update", "delete", "single", "limit", "neq", "range"].forEach((m) => { result[m] = () => result; });
  return result;
}
function makeSupabase(opts) {
  return {
    auth: {
      getSession: () => Promise.resolve({ data: { session: opts.session || null } }),
      getUser: () => Promise.resolve({ data: { user: opts.user || null } }),
      signInWithPassword: () => Promise.resolve({ data: { user: opts.user, session: opts.session }, error: null }),
      signUp: () => Promise.resolve({ data: { user: opts.user, session: opts.session }, error: null }),
      signOut: () => Promise.resolve({ error: null }),
      updateUser: () => Promise.resolve({ data: { user: opts.user }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
    from: () => makeChain(),
  };
}

(async () => {
  // 1) 用 Node 端 xlsx 复刻浏览器 sheet_to_csv 输出（这就是页面 xlsx 分支喂给 import 的文本）
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const csvText = XLSX.utils.sheet_to_csv(ws);

  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => errors.push(e.message));
  const mock = makeSupabase({ session: null });
  const dom = new JSDOM(HTML, {
    url: "http://localhost/",
    runScripts: "dangerously",
    virtualConsole: vc,
    beforeParse(window) { window.supabase = { createClient: () => mock }; },
  });
  await new Promise((r) => setTimeout(r, 400));
  const win = dom.window, doc = win.document;

  // 游客登录，确保 profiles 已初始化
  doc.getElementById("auth-guest-btn").click();
  await new Promise((r) => setTimeout(r, 80));

  // 2) 用 mock FileReader 把上面的 csvText 作为「.csv 文件」注入导入流程
  win.FileReader = class {
    readAsText() { this.onload({ target: { result: csvText } }); }
    readAsArrayBuffer() {}
  };
  const input = doc.getElementById("import-file");
  Object.defineProperty(input, "files", { value: [{ name: "投注记录-20240618.csv", size: csvText.length }], configurable: true });

  let ok = true; const log = [];
  const check = (label, cond) => { log.push((cond ? "PASS" : "FAIL") + " - " + label); if (!cond) ok = false; };

  try {
    input.dispatchEvent(new win.Event("change"));
    await new Promise((r) => setTimeout(r, 60));

    const raw = win.localStorage.getItem("bet_guest_records_v2") || win.localStorage.getItem("bet_records_v2");
    check("导入后 localStorage 有记录", !!raw);
    const recs = raw ? JSON.parse(raw) : [];
    check("解析到 45 条记录", recs.length === 45);
    const withDate = recs.filter((r) => r.date && /^\d{4}-\d{2}-\d{2}$/.test(r.date));
    check("全部记录都带 YYYY-MM-DD 日期", withDate.length === recs.length && recs.length > 0);
    check("首条日期为 2026-07-10", recs[0] && recs[0].date === "2026-07-10");
    check("日期非「未注明」占位", !recs.some((r) => (r.date || "") === ""));
    // 顺带确认金额/赔率也解析正确
    check("首条投注金额为 2000", recs[0] && recs[0].amount === 2000);
  } catch (e) {
    log.push("ERROR - " + e.message); ok = false;
  }
  if (errors.length) { log.push("jsdomError: " + errors.join(" | ")); ok = false; }

  console.log("\n=== 导入 Excel 中文日期回归 ===");
  log.forEach((l) => console.log("  " + l));
  console.log("  RESULT: " + (ok ? "PASS" : "FAILED"));
  process.exit(ok ? 0 : 1);
})();

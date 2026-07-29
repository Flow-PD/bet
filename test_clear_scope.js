// jsdom E2E: 验证「清空」现在只清当前计划 + 可勾选具体记录（不再一刀切清空全部计划）
const fs = require("fs");
const { JSDOM, VirtualConsole } = require("C:/Users/31219/.workbuddy/binaries/node/workspace/node_modules/jsdom");
const HTML = fs.readFileSync("C:/Users/31219/WorkBuddy/2026-07-28-09-46-08/bet-tracker/index.html", "utf8");

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
  const vc = new VirtualConsole();
  const errors = [];
  vc.on("jsdomError", (e) => errors.push(e.message));
  const mock = makeSupabase({ session: null });

  // 预置两个计划的本地数据（游客命名空间）
  const PA = "pa_id", PB = "pb_id";
  const profiles = [{ id: PA, name: "Plan A", color: "#4f7cff" }, { id: PB, name: "Plan B", color: "#22c55e" }];
  const recs = [
    { id: "r1", profile: PA, date: "2026-07-10", event: "A-赛事1", amount: 2000, odds: 2.5, result: "红", bonus: 5000 },
    { id: "r2", profile: PA, date: "2026-07-11", event: "A-赛事2", amount: 1500, odds: 2.3, result: "黑", bonus: 0 },
    { id: "r3", profile: PB, date: "2026-07-12", event: "B-赛事1", amount: 3000, odds: 2.1, result: "红", bonus: 6300 },
    { id: "r4", profile: PB, date: "2026-07-13", event: "B-赛事2", amount: 1000, odds: 2.0, result: "黑", bonus: 0 },
  ];

  const dom = new JSDOM(HTML, {
    url: "http://localhost/",
    runScripts: "dangerously",
    virtualConsole: vc,
    beforeParse(window) {
      window.supabase = { createClient: () => mock };
      window.localStorage.setItem("bet_guest_profiles_v2", JSON.stringify(profiles));
      window.localStorage.setItem("bet_guest_records_v2", JSON.stringify(recs));
      window.localStorage.setItem("bet_guest_view_v1", PA); // 当前选中 Plan A
    },
  });
  await new Promise((r) => setTimeout(r, 400));
  const win = dom.window, doc = win.document;

  // 游客登录，加载预置数据
  doc.getElementById("auth-guest-btn").click();
  await new Promise((r) => setTimeout(r, 100));

  let ok = true; const log = [];
  const check = (label, cond) => { log.push((cond ? "PASS" : "FAIL") + " - " + label); if (!cond) ok = false; };

  try {
    // 打开清空弹窗
    doc.getElementById("clear-btn").click();
    await new Promise((r) => setTimeout(r, 30));

    const overlay = doc.querySelector(".modal-overlay");
    check("清空弹窗已打开", overlay && overlay.style.display === "flex");

    const cbs = Array.prototype.slice.call(doc.querySelectorAll("#modal-msg .clr-cb"));
    check("弹窗只列出当前计划(Plan A)的记录（2 条，而非全部 4 条）", cbs.length === 2);
    check("弹窗不含 Plan B 的记录 r3/r4", !cbs.some((c) => c.value === "r3") && !cbs.some((c) => c.value === "r4"));
    check("弹窗含 Plan A 的记录 r1/r2", cbs.some((c) => c.value === "r1") && cbs.some((c) => c.value === "r2"));

    // 全选联动
    const allCb = doc.getElementById("clr-all");
    allCb.checked = true; allCb.dispatchEvent(new win.Event("change"));
    check("勾选『全选』后子项全部选中", cbs.every((c) => c.checked));

    // 只保留 r1 选中，取消 r2
    const r1 = cbs.find((c) => c.value === "r1");
    const r2 = cbs.find((c) => c.value === "r2");
    r2.checked = false; r2.dispatchEvent(new win.Event("change"));
    check("取消 r2 后『全选』取消勾选", allCb.checked === false);

    // 确认按钮默认禁用（3s 等待），手动放行后点击
    const okBtn = doc.querySelector("#modal-actions .modal-ok.danger");
    check("确认按钮初始禁用", okBtn.disabled === true);
    okBtn.disabled = false; okBtn.textContent = "确认清空";
    okBtn.click();
    await new Promise((r) => setTimeout(r, 50));

    const after = JSON.parse(win.localStorage.getItem("bet_guest_records_v2") || "[]");
    check("Plan A 的 r1 被清除", !after.some((r) => r.id === "r1"));
    check("Plan A 的 r2 保留（未勾选）", after.some((r) => r.id === "r2"));
    check("Plan B 的 r3 不受影响", after.some((r) => r.id === "r3"));
    check("Plan B 的 r4 不受影响", after.some((r) => r.id === "r4"));
    check("仅删除 1 条（r1）", after.length === 3);
  } catch (e) {
    log.push("ERROR - " + e.message); ok = false;
  }
  if (errors.length) { log.push("jsdomError: " + errors.join(" | ")); ok = false; }

  console.log("\n=== 清空：仅清当前计划 + 勾选指定记录 ===");
  log.forEach((l) => console.log("  " + l));
  console.log("  RESULT: " + (ok ? "PASS" : "FAILED"));
  process.exit(ok ? 0 : 1);
})();

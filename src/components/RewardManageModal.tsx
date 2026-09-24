"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { FamilyMember, RewardAccount, RewardItem, Redemption } from "@/types";

interface RewardManageModalProps {
  scope: "family" | "school";
  familyId?: string; // scope=family 时必传
  currentUserId: string;
  childrenList: (FamilyMember & { account: RewardAccount | null })[]; // 可被兑换的孩子
  onClose: () => void;
  onDone: () => void; // 操作成功后让父组件 router.refresh()
}

// 兑换记录行（嵌套带出物品名）
type RedemptionRow = Redemption & { reward_items?: { name: string } | null };

// 兑换状态样式
const REDEEM_STATUS: Record<Redemption["status"], { text: string; className: string }> = {
  fulfilled: { text: "已兑换", className: "bg-green-100 text-green-600" },
  cancelled: { text: "已取消", className: "bg-gray-100 text-gray-400" },
  pending: { text: "待处理", className: "bg-amber-100 text-amber-600" },
};

export default function RewardManageModal({
  scope,
  familyId,
  currentUserId,
  childrenList,
  onClose,
  onDone,
}: RewardManageModalProps) {
  const supabase = createClient();
  const [tab, setTab] = useState<"items" | "records">("items");
  const [items, setItems] = useState<RewardItem[]>([]);
  const [records, setRecords] = useState<RedemptionRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // created_by 外键指向 auth.users；家长端传入的 currentUserId 是 family_members 行 id，
  // 所以这里统一解析登录 auth uid（老师端两者相同，不受影响）
  const [authUid, setAuthUid] = useState(currentUserId);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const uid = data.session?.user?.id;
      if (uid) setAuthUid(uid);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 新增奖品表单
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPoints, setNewPoints] = useState(10);
  const [newCategory, setNewCategory] = useState<"material" | "non-material">("material");
  const [newDesc, setNewDesc] = useState("");

  // 行内兑换面板：展开的奖品 id + 选中的孩子
  const [redeemItemId, setRedeemItemId] = useState<string | null>(null);
  const [redeemChildId, setRedeemChildId] = useState<string | null>(null);

  // 孩子 id 串（作为查询依赖，避免数组引用变化导致重复拉取）
  const childIdsKey = childrenList.map((c) => c.id).join(",");

  // 拉奖池列表：家庭按 family_id，学校按创建老师
  const fetchItems = useCallback(async () => {
    let query = supabase
      .from("reward_items")
      .select("*")
      .eq("scope", scope)
      .order("created_at", { ascending: false });
    if (scope === "family") {
      if (!familyId) {
        setItems([]);
        return;
      }
      query = query.eq("family_id", familyId);
    } else {
      query = query.eq("created_by", authUid);
    }
    const { data } = await query;
    setItems((data || []) as RewardItem[]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, familyId, authUid]);

  // 拉兑换记录：家庭按孩子范围，学校按结算老师
  const fetchRecords = useCallback(async () => {
    const ids = childrenList.map((c) => c.id);
    // withEmbed=false 用于嵌套查询报错时的兜底
    const build = (withEmbed: boolean) => {
      let b = supabase
        .from("redemptions")
        .select(withEmbed ? "*, reward_items(name)" : "*")
        .eq("scope", scope)
        .order("created_at", { ascending: false })
        .limit(50);
      if (scope === "family") {
        return ids.length > 0 ? b.in("child_member_id", ids) : null;
      }
      return b.eq("created_by", authUid);
    };

    const primary = build(true);
    if (!primary) {
      setRecords([]);
      return;
    }
    const { data, error } = await primary;
    if (!error) {
      setRecords((data || []) as RedemptionRow[]);
      return;
    }
    // 兜底：嵌套查询失败时分两次查再拼
    const fallback = build(false);
    if (!fallback) {
      setRecords([]);
      return;
    }
    const { data: rows } = await fallback;
    const list = (rows || []) as Redemption[];
    const itemIds = [...new Set(list.map((r) => r.item_id))];
    const nameMap = new Map<string, string>();
    if (itemIds.length > 0) {
      const { data: itemRows } = await supabase
        .from("reward_items")
        .select("id, name")
        .in("id", itemIds);
      (itemRows || []).forEach((it: any) => nameMap.set(it.id, it.name));
    }
    setRecords(
      list.map((r) => ({
        ...r,
        reward_items: { name: nameMap.get(r.item_id) || "未知奖品" },
      }))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, authUid, childIdsKey]);

  useEffect(() => {
    fetchItems();
    fetchRecords();
  }, [fetchItems, fetchRecords]);

  // 新增奖品
  const addItem = async () => {
    const name = newName.trim();
    const points = Math.floor(Number(newPoints));
    if (!name) return;
    if (!Number.isFinite(points) || points <= 0) {
      alert("所需积分需为正整数");
      return;
    }
    setBusy("add");
    const { error } = await supabase.from("reward_items").insert({
      scope,
      ...(scope === "family" ? { family_id: familyId } : {}),
      created_by: authUid,
      name,
      points_required: points,
      category: newCategory,
      description: newDesc.trim() || null,
    });
    setBusy(null);
    if (error) {
      alert(`新增失败：${error.message}`);
      return;
    }
    setNewName("");
    setNewPoints(10);
    setNewCategory("material");
    setNewDesc("");
    setShowAddForm(false);
    fetchItems();
    onDone();
  };

  // 上架 / 下架
  const toggleActive = async (item: RewardItem) => {
    setBusy(item.id);
    const { error } = await supabase
      .from("reward_items")
      .update({ is_active: !item.is_active })
      .eq("id", item.id);
    setBusy(null);
    if (error) {
      alert(`操作失败：${error.message}`);
      return;
    }
    fetchItems();
    onDone();
  };

  // 删除奖品（级联删除兑换记录，confirm 里必须提示）
  const removeItem = async (item: RewardItem) => {
    if (
      !confirm(
        `确定删除「${item.name}」？会同时删除该奖品的兑换记录，且不可恢复。`
      )
    )
      return;
    setBusy(item.id);
    const { error } = await supabase.from("reward_items").delete().eq("id", item.id);
    setBusy(null);
    if (error) {
      alert(`删除失败：${error.message}`);
      return;
    }
    if (redeemItemId === item.id) {
      setRedeemItemId(null);
      setRedeemChildId(null);
    }
    fetchItems();
    fetchRecords();
    onDone();
  };

  // 结算兑换（RPC 原子操作：校验余额 → 记 redemption → 扣总分）
  const handleRedeem = async (item: RewardItem) => {
    if (!redeemChildId) {
      alert("请先选择要兑换的孩子");
      return;
    }
    setBusy(`redeem-${item.id}`);
    const { error } = await supabase.rpc("redeem_reward", {
      p_item_id: item.id,
      p_child_member_id: redeemChildId,
      p_note: null,
    });
    setBusy(null);
    if (error) {
      // RPC 抛出的中文异常（如余额不足）会出现在 message 里，直接展示
      alert(error.message);
      return;
    }
    alert(`兑换成功，已扣 ${item.points_required} 分`);
    setRedeemItemId(null);
    setRedeemChildId(null);
    fetchItems();
    fetchRecords();
    onDone();
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4 z-50"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-bold text-lg text-gray-800">🎁 兑换管理</h3>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 text-xl px-1">
            ✕
          </button>
        </div>
        <p className="text-[11px] text-gray-400 mb-3">
          {scope === "family"
            ? "🏠 家庭奖池 · 家长结算扣家庭分"
            : "🏫 学校奖池 · 老师结算扣学校分"}
        </p>

        {/* Tab 切换 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5 mb-3 text-xs">
          <button
            onClick={() => setTab("items")}
            className={`flex-1 py-1.5 rounded-md font-medium transition ${
              tab === "items" ? "bg-white shadow text-pink-600" : "text-gray-500"
            }`}
          >
            🎁 奖池 ({items.length})
          </button>
          <button
            onClick={() => setTab("records")}
            className={`flex-1 py-1.5 rounded-md font-medium transition ${
              tab === "records" ? "bg-white shadow text-pink-600" : "text-gray-500"
            }`}
          >
            🧾 兑换记录 ({records.length})
          </button>
        </div>

        {/* ===== 奖池 Tab ===== */}
        {tab === "items" && (
          <>
            {/* 新增奖品 */}
            {showAddForm ? (
              <div className="bg-pink-50 rounded-xl p-3 mb-3 space-y-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="名称，如：和爸爸露营一次"
                  className="w-full px-3 py-1.5 rounded-lg border border-pink-200 text-sm bg-white"
                  maxLength={20}
                  autoFocus
                />
                <div className="flex gap-2 items-center flex-wrap">
                  <input
                    type="number"
                    min={1}
                    value={newPoints}
                    onChange={(e) => setNewPoints(parseInt(e.target.value, 10) || 0)}
                    className="w-20 px-3 py-1.5 rounded-lg border border-pink-200 text-sm bg-white"
                  />
                  <span className="text-xs text-pink-400">所需积分（正整数）</span>
                  <select
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value as "material" | "non-material")}
                    className="px-2 py-1.5 rounded-lg border border-pink-200 text-sm bg-white"
                  >
                    <option value="material">物质奖励</option>
                    <option value="non-material">非物质奖励</option>
                  </select>
                </div>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="备注（可选）"
                  className="w-full px-3 py-1.5 rounded-lg border border-pink-200 text-sm bg-white"
                  maxLength={50}
                />
                <div className="flex gap-2">
                  <button
                    onClick={addItem}
                    disabled={!newName.trim() || busy === "add"}
                    className="flex-1 py-1.5 rounded-lg bg-pink-500 text-white text-sm disabled:opacity-50"
                  >
                    {busy === "add" ? "添加中..." : "添加"}
                  </button>
                  <button
                    onClick={() => setShowAddForm(false)}
                    className="flex-1 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-sm"
                  >
                    取消
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowAddForm(true)}
                className="w-full py-2 rounded-xl border border-dashed border-pink-300 text-pink-500 text-sm hover:bg-pink-50 mb-3"
              >
                ＋ 新增奖品
              </button>
            )}

            {/* 奖品列表 */}
            {items.length === 0 && (
              <div className="text-xs text-gray-300 text-center py-6 border border-dashed border-gray-200 rounded-xl">
                奖池还是空的，先添加一个奖品吧
              </div>
            )}
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="bg-gray-50 rounded-xl px-3 py-2.5">
                  {/* 第一行：名称 + 积分 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`text-sm font-medium truncate ${
                          item.is_active ? "text-gray-700" : "text-gray-300 line-through"
                        }`}
                      >
                        {item.name}
                      </span>
                      {item.category === "non-material" && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-100 text-purple-500 flex-shrink-0">
                          精神
                        </span>
                      )}
                      {!item.is_active && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 text-gray-400 flex-shrink-0">
                          已下架
                        </span>
                      )}
                    </div>
                    <span className="text-sm font-mono font-semibold text-pink-500 flex-shrink-0">
                      {item.points_required}🌸
                    </span>
                  </div>

                  {/* 备注 */}
                  {item.description && (
                    <p className="text-[11px] text-gray-400 mt-0.5 truncate">{item.description}</p>
                  )}

                  {/* 操作行 */}
                  <div className="flex items-center gap-2 mt-2">
                    {item.is_active && (
                      <button
                        onClick={() => {
                          setRedeemItemId(redeemItemId === item.id ? null : item.id);
                          setRedeemChildId(null);
                        }}
                        className="px-2.5 py-1 rounded-lg bg-pink-500 text-white text-xs font-medium hover:bg-pink-600"
                      >
                        兑换
                      </button>
                    )}
                    <button
                      onClick={() => toggleActive(item)}
                      disabled={busy === item.id}
                      className="px-2.5 py-1 rounded-lg bg-gray-100 text-gray-500 text-xs hover:bg-gray-200 disabled:opacity-50"
                    >
                      {item.is_active ? "下架" : "上架"}
                    </button>
                    <button
                      onClick={() => removeItem(item)}
                      disabled={busy === item.id}
                      className="px-2.5 py-1 rounded-lg text-xs text-red-400 hover:text-red-500 disabled:opacity-50"
                    >
                      删除
                    </button>
                  </div>

                  {/* 行内兑换面板：选孩子 → 确认 */}
                  {redeemItemId === item.id && (
                    <div className="mt-2 bg-white rounded-lg border border-pink-100 p-2.5 space-y-1.5">
                      <p className="text-[10px] text-gray-400">选择要兑换的孩子：</p>
                      {childrenList.length === 0 && (
                        <p className="text-xs text-gray-300 py-1">还没有孩子</p>
                      )}
                      {childrenList.map((c) => {
                        const on = redeemChildId === c.id;
                        return (
                          <button
                            key={c.id}
                            onClick={() => setRedeemChildId(c.id)}
                            className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-sm transition ${
                              on
                                ? "bg-pink-50 border border-pink-300 text-pink-600 font-medium"
                                : "bg-gray-50 border border-transparent text-gray-600 hover:bg-gray-100"
                            }`}
                          >
                            <span>{c.nickname || "孩子"}</span>
                            <span className="text-xs">🌸 {c.account?.total_points ?? 0} 分</span>
                          </button>
                        );
                      })}
                      <button
                        onClick={() => handleRedeem(item)}
                        disabled={!redeemChildId || busy === `redeem-${item.id}`}
                        className="w-full py-1.5 rounded-lg bg-pink-500 text-white text-sm font-medium disabled:opacity-50"
                      >
                        {busy === `redeem-${item.id}`
                          ? "兑换中..."
                          : `确认兑换（-${item.points_required}🌸）`}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {/* ===== 兑换记录 Tab ===== */}
        {tab === "records" && (
          <>
            {records.length === 0 && (
              <div className="text-xs text-gray-300 text-center py-6 border border-dashed border-gray-200 rounded-xl">
                还没有兑换记录
              </div>
            )}
            <div className="space-y-2">
              {records.map((r) => {
                const st = REDEEM_STATUS[r.status] || REDEEM_STATUS.pending;
                const child = childrenList.find((c) => c.id === r.child_member_id);
                return (
                  <div
                    key={r.id}
                    className="bg-gray-50 rounded-xl px-3 py-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="text-sm text-gray-700 truncate">
                        {r.reward_items?.name || "未知奖品"}
                      </div>
                      <div className="text-[10px] text-gray-400 mt-0.5">
                        {child?.nickname || "孩子"} ·{" "}
                        {new Date(r.created_at).toLocaleDateString("zh-CN")}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-sm font-mono font-semibold text-red-500">
                        -{r.points_spent}🌸
                      </span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${st.className}`}>
                        {st.text}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

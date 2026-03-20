/**
 * 途正英语AI分级测评 - 测评历史页
 * 对接后端API: GET /api/v1/test/history
 * 蓝绿品牌色 + 透明毛玻璃风格
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, History as HistoryIcon, Award, Clock, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { getTestHistory, type TestHistoryItem } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const LEVEL_COLORS: Record<number, { text: string; bg: string }> = {
  0: { text: "#8a95a5", bg: "rgba(138,149,165,0.08)" },
  1: { text: "#1B3F91", bg: "rgba(27,63,145,0.06)" },
  2: { text: "#83BA12", bg: "rgba(131,186,18,0.08)" },
  3: { text: "#2B5BA0", bg: "rgba(43,91,160,0.06)" },
};

export default function History() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const [records, setRecords] = useState<TestHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }

    const fetchHistory = async () => {
      try {
        const data = await getTestHistory({ page: 1, pageSize: 20 });
        setRecords(data.list);
        setTotal(data.total);
      } catch {
        // 如果API还未实现，显示空状态
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [isAuthenticated, navigate]);

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)" }}
    >
      {/* Header */}
      <div
        className="backdrop-blur-md px-4 py-3 sticky top-0 z-20"
        style={{
          backgroundColor: "rgba(255,255,255,0.70)",
          borderBottom: "1px solid rgba(27,63,145,0.06)",
        }}
      >
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-white/40 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" style={{ color: "#3a4a5a" }} />
          </button>
          <h2 className="font-bold text-sm" style={{ color: "#1a2340" }}>测评记录</h2>
          <div className="w-9" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin" style={{ color: "#1B3F91" }} />
          </div>
        ) : records.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div
              className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
              style={{ backgroundColor: "rgba(27,63,145,0.06)" }}
            >
              <HistoryIcon className="w-8 h-8" style={{ color: "#8a95a5" }} />
            </div>
            <p className="text-sm font-medium mb-1" style={{ color: "#3a4a5a" }}>暂无测评记录</p>
            <p className="text-xs mb-6" style={{ color: "#8a95a5" }}>完成一次测评后，记录将显示在这里</p>
            <button
              onClick={() => navigate("/rules")}
              className="text-sm font-bold hover:underline"
              style={{ color: "#1B3F91" }}
            >
              开始第一次测评 →
            </button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs mb-2" style={{ color: "#8a95a5" }}>共 {total} 条记录</p>
            {records.map((record, idx) => {
              const colors = LEVEL_COLORS[record.finalLevel] || LEVEL_COLORS[1];
              return (
                <motion.div
                  key={record.sessionId}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  onClick={() =>
                    navigate(
                      `/result?sessionId=${record.sessionId}&level=${record.finalLevel}&name=${encodeURIComponent(record.levelLabel)}&label=${encodeURIComponent(record.levelName)}&questions=${record.questionCount}`
                    )
                  }
                  className="backdrop-blur-md rounded-2xl p-4 active:scale-[0.98] transition-transform cursor-pointer"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.60)",
                    boxShadow: "0 2px 12px rgba(27,63,145,0.05)",
                    border: "1px solid rgba(255,255,255,0.4)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
                      style={{ backgroundColor: colors.bg }}
                    >
                      <Award className="w-6 h-6" style={{ color: colors.text }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-sm" style={{ color: "#1a2340" }}>
                          {record.levelName}
                        </span>
                        <span
                          className="text-xs font-medium px-2 py-0.5 rounded-full"
                          style={{ color: colors.text, backgroundColor: colors.bg }}
                        >
                          {record.levelLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs" style={{ color: "#8a95a5" }}>
                        <span>{record.questionCount}题</span>
                        {record.totalDuration > 0 && (
                          <>
                            <span>·</span>
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {Math.round(record.totalDuration / 60)}分钟
                            </span>
                          </>
                        )}
                        <span>·</span>
                        <span>{formatDate(record.completedAt)}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 shrink-0" style={{ color: "#c0c8d5" }} />
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const month = date.getMonth() + 1;
    const day = date.getDate();
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `${month}/${day} ${hours}:${minutes}`;
  } catch {
    return dateStr;
  }
}

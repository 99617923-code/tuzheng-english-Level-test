/**
 * 途正英语AI分级测评 - 测评历史页
 * 对接后端API: GET /api/v1/test/history
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, History as HistoryIcon, Award, Clock, Loader2 } from "lucide-react";
import { useState, useEffect } from "react";
import { getTestHistory, type TestHistoryItem } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

const LEVEL_COLORS: Record<number, { text: string; bg: string }> = {
  0: { text: "text-amber-700", bg: "bg-amber-50" },
  1: { text: "text-blue-700", bg: "bg-blue-50" },
  2: { text: "text-emerald-700", bg: "bg-emerald-50" },
  3: { text: "text-purple-700", bg: "bg-purple-50" },
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
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-border/50 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <h2 className="font-bold text-sm text-foreground">测评记录</h2>
          <div className="w-9" />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 px-4 py-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-coral animate-spin" />
          </div>
        ) : records.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20"
          >
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4">
              <HistoryIcon className="w-8 h-8 text-warm-gray" />
            </div>
            <p className="text-sm font-medium text-gray-700 mb-1">暂无测评记录</p>
            <p className="text-xs text-warm-gray mb-6">完成一次测评后，记录将显示在这里</p>
            <button
              onClick={() => navigate("/rules")}
              className="text-sm text-coral font-bold hover:underline"
            >
              开始第一次测评 →
            </button>
          </motion.div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-warm-gray mb-2">共 {total} 条记录</p>
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
                  className="bg-white rounded-2xl p-4 shadow-sm active:scale-[0.98] transition-transform cursor-pointer"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-12 h-12 rounded-xl ${colors.bg} flex items-center justify-center shrink-0`}>
                      <Award className={`w-6 h-6 ${colors.text}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="font-bold text-sm text-gray-800">
                          {record.levelName}
                        </span>
                        <span className={`text-xs font-medium ${colors.text} ${colors.bg} px-2 py-0.5 rounded-full`}>
                          {record.levelLabel}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-warm-gray">
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
                    <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
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

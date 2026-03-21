/**
 * 途正英语AI分级测评 - 测评说明页（简化版）
 * 去掉顶部大图，精简内容让手机一屏看完
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mic, Volume2, Clock, ChevronLeft, Shield } from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";

export default function Rules() {
  const [, navigate] = useLocation();
  const [micGranted, setMicGranted] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const requestMic = useCallback(async () => {
    setRequesting(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicGranted(true);
      toast.success("麦克风已授权，准备就绪！");
    } catch {
      toast.error("请允许使用麦克风，否则无法进行语音测评");
    } finally {
      setRequesting(false);
    }
  }, []);

  const handleStart = () => {
    if (!micGranted) {
      toast.error("请先授权麦克风权限");
      return;
    }
    navigate("/test");
  };

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)" }}
    >
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center px-4 py-4 shrink-0"
      >
        <button
          onClick={() => navigate("/")}
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/40 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: "#3a4a5a" }} />
        </button>
        <h2 className="flex-1 text-center font-bold text-lg pr-10" style={{ color: "#1a2340" }}>
          测评说明
        </h2>
      </motion.div>

      {/* 内容区 - 紧凑布局一屏显示 */}
      <div className="flex-1 flex flex-col px-6 pb-6">
        {/* 注意事项 - 简洁横排 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="backdrop-blur-md rounded-2xl p-4 mb-4"
          style={{
            backgroundColor: "rgba(255,255,255,0.60)",
            boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        >
          <div className="grid grid-cols-2 gap-3">
            <TipItem icon={<Clock className="w-4 h-4" />} text="约需5分钟" />
            <TipItem icon={<Mic className="w-4 h-4" />} text="安静环境" />
            <TipItem icon={<Volume2 className="w-4 h-4" />} text="打开音量" />
            <TipItem icon={<Shield className="w-4 h-4" />} text="独立完成" />
          </div>
        </motion.div>

        {/* 测评流程 - 简洁三步 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="backdrop-blur-md rounded-2xl p-4 mb-4"
          style={{
            backgroundColor: "rgba(255,255,255,0.60)",
            boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        >
          <h3 className="font-bold text-sm mb-3" style={{ color: "#1a2340" }}>测评流程</h3>
          <div className="flex items-center gap-2">
            <StepBadge num="1" label="听题" color="#1B3F91" />
            <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(27,63,145,0.2), rgba(131,186,18,0.2))" }} />
            <StepBadge num="2" label="回答" color="#2B5BA0" />
            <div className="flex-1 h-px" style={{ background: "linear-gradient(90deg, rgba(131,186,18,0.2), rgba(27,63,145,0.2))" }} />
            <StepBadge num="3" label="定级" color="#83BA12" />
          </div>
          <p className="text-xs mt-3 text-center" style={{ color: "#7a8a9a" }}>
            AI外教用英语提问 → 你用语音回答 → 系统自动评定等级
          </p>
          <p className="text-xs mt-1 text-center" style={{ color: "#adb5bd" }}>
            共10-15道题，难度从低到高自适应调整
          </p>
        </motion.div>

        {/* 麦克风授权 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="rounded-2xl p-4 border-2 transition-colors mb-4"
          style={{
            backgroundColor: micGranted ? "rgba(131,186,18,0.08)" : "rgba(255,255,255,0.60)",
            borderColor: micGranted ? "rgba(131,186,18,0.4)" : "rgba(27,63,145,0.15)",
            boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: micGranted ? "rgba(131,186,18,0.15)" : "rgba(27,63,145,0.08)",
                color: micGranted ? "#6a9a10" : "#1B3F91",
              }}
            >
              <Mic className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm" style={{ color: "#1a2340" }}>
                {micGranted ? "麦克风已就绪" : "需要麦克风权限"}
              </h4>
              <p className="text-xs mt-0.5" style={{ color: "#7a8a9a" }}>
                {micGranted ? "权限已授予，可以开始测评" : "测评需要录制你的语音回答"}
              </p>
            </div>
            {!micGranted && (
              <Button
                onClick={requestMic}
                disabled={requesting}
                size="sm"
                className="rounded-xl text-xs px-4 shrink-0 text-white"
                style={{ background: "linear-gradient(135deg, #1B3F91, #2B5BA0)" }}
              >
                {requesting ? "请求中..." : "授权"}
              </Button>
            )}
          </div>
        </motion.div>

        {/* 弹性空间 */}
        <div className="flex-1 min-h-4" />

        {/* 开始按钮 */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="pb-2"
        >
          <Button
            onClick={handleStart}
            disabled={!micGranted}
            className="w-full h-14 rounded-2xl text-white text-lg font-bold shadow-lg transition-all duration-300 active:scale-[0.98] disabled:opacity-50 disabled:shadow-none"
            style={{
              background: micGranted ? "linear-gradient(135deg, #1B3F91 0%, #2B5BA0 100%)" : "#c0c8d5",
              boxShadow: micGranted ? "0 6px 20px rgba(27,63,145,0.30)" : "none",
            }}
          >
            {micGranted ? "进入测评" : "请先授权麦克风"}
          </Button>
        </motion.div>
      </div>
    </div>
  );
}

function StepBadge({ num, label, color }: { num: string; label: string; color: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold"
        style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}
      >
        {num}
      </div>
      <span className="text-xs font-medium" style={{ color }}>{label}</span>
    </div>
  );
}

function TipItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded-xl" style={{ backgroundColor: "rgba(27,63,145,0.04)" }}>
      <span style={{ color: "#1B3F91" }}>{icon}</span>
      <span className="text-xs font-medium" style={{ color: "#5a6a7a" }}>{text}</span>
    </div>
  );
}

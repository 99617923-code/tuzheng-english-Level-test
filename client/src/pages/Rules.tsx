/**
 * 途正英语AI分级测评 - 规则说明页
 * 蓝绿品牌色 + 透明毛玻璃风格
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mic, Volume2, Brain, Clock, ChevronLeft, Shield, CheckCircle2 } from "lucide-react";
import { useState, useCallback } from "react";
import { toast } from "sonner";

const RULES_IMG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/rules-illustration-S6diYDHWuxzGGRWfMezTkV.webp";

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
        className="flex items-center px-4 py-4"
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

      {/* Illustration */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="px-6 mb-4"
      >
        <div className="rounded-2xl overflow-hidden shadow-sm">
          <img src={RULES_IMG} alt="测评说明" className="w-full h-40 object-cover" />
        </div>
      </motion.div>

      {/* Rules Content */}
      <div className="flex-1 px-6 pb-6 space-y-4">
        {/* How it works - 毛玻璃卡片 */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="backdrop-blur-md rounded-2xl p-5"
          style={{
            backgroundColor: "rgba(255,255,255,0.60)",
            boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        >
          <h3 className="font-bold text-base mb-4" style={{ color: "#1a2340" }}>测评流程</h3>
          <div className="space-y-4">
            <RuleStep icon={<Volume2 className="w-4 h-4" />} step="1" title="听题" desc="AI外教用英语向你提出问题，请仔细听" />
            <RuleStep icon={<Mic className="w-4 h-4" />} step="2" title="回答" desc="点击麦克风按钮，用英语语音回答问题" />
            <RuleStep icon={<Brain className="w-4 h-4" />} step="3" title="AI评估" desc="AI根据你的回答自动调整下一题难度" />
            <RuleStep icon={<CheckCircle2 className="w-4 h-4" />} step="4" title="获取结果" desc="5-8题后系统自动判定你的英语水平级别" />
          </div>
        </motion.div>

        {/* Tips */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35 }}
          className="backdrop-blur-md rounded-2xl p-5"
          style={{
            backgroundColor: "rgba(255,255,255,0.60)",
            boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        >
          <h3 className="font-bold text-base mb-3" style={{ color: "#1a2340" }}>注意事项</h3>
          <div className="space-y-2.5">
            <TipItem icon={<Clock className="w-3.5 h-3.5" />} text="测评约需3-5分钟，请预留充足时间" />
            <TipItem icon={<Mic className="w-3.5 h-3.5" />} text="请在安静环境中进行，确保语音清晰" />
            <TipItem icon={<Volume2 className="w-3.5 h-3.5" />} text="请打开手机音量，以便听清AI提问" />
            <TipItem icon={<Shield className="w-3.5 h-3.5" />} text="请独立完成，测评结果仅用于分级" />
          </div>
        </motion.div>

        {/* Mic Permission */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="rounded-2xl p-5 border-2 transition-colors"
          style={{
            backgroundColor: micGranted ? "rgba(131,186,18,0.08)" : "rgba(255,255,255,0.60)",
            borderColor: micGranted ? "rgba(131,186,18,0.4)" : "rgba(27,63,145,0.15)",
            boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: micGranted ? "rgba(131,186,18,0.15)" : "rgba(27,63,145,0.08)",
                color: micGranted ? "#6a9a10" : "#1B3F91",
              }}
            >
              <Mic className="w-6 h-6" />
            </div>
            <div className="flex-1">
              <h4 className="font-bold text-sm" style={{ color: "#1a2340" }}>
                {micGranted ? "麦克风已就绪" : "需要麦克风权限"}
              </h4>
              <p className="text-xs mt-0.5" style={{ color: "#7a8a9a" }}>
                {micGranted ? "权限已授予，可以开始测评" : "测评需要使用麦克风录制你的回答"}
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

        {/* Start Button */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.65 }}
          className="pt-2 pb-4"
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

function RuleStep({ icon, step, title, desc }: { icon: React.ReactNode; step: string; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 mt-0.5"
        style={{ backgroundColor: "rgba(27,63,145,0.08)", color: "#1B3F91" }}
      >
        <span className="text-xs font-bold">{step}</span>
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-1.5">
          <span style={{ color: "#1B3F91" }}>{icon}</span>
          <h4 className="font-bold text-sm" style={{ color: "#1a2340" }}>{title}</h4>
        </div>
        <p className="text-xs mt-0.5" style={{ color: "#7a8a9a" }}>{desc}</p>
      </div>
    </div>
  );
}

function TipItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span style={{ color: "#7a8a9a" }}>{icon}</span>
      <p className="text-xs" style={{ color: "#7a8a9a" }}>{text}</p>
    </div>
  );
}

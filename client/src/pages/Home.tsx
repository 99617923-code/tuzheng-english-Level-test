/**
 * 途正英语AI分级测评 - 欢迎页
 * 设计风格：教育温暖风，奶油白底+珊瑚橙主色
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mic, MessageCircle, Headphones, LogIn, LogOut, History } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-icon-C98gq5asJFpo7UzBQvohka.webp";
const AI_AVATAR = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp";

// 快速淡入动画 - 减少延迟让内容立即可见
const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" as const },
});

export default function Home() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const handleStart = () => {
    if (!isAuthenticated) {
      navigate("/login");
      return;
    }
    navigate("/rules");
  };

  return (
    <div className="min-h-screen bg-cream relative overflow-hidden">
      {/* 装饰性背景元素 - 纯CSS */}
      <div className="absolute top-[-60px] right-[-40px] w-40 h-40 rounded-full bg-coral/8" />
      <div className="absolute top-[30%] left-[-30px] w-24 h-24 rounded-full bg-mint/10" />
      <div className="absolute bottom-[20%] right-[-20px] w-32 h-32 rounded-full bg-coral/6" />
      <div className="absolute bottom-[-40px] left-[20%] w-28 h-28 rounded-full bg-mint/8" />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col px-6 py-6">
        {/* Header: Logo + Auth */}
        <motion.div {...fadeIn(0)} className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={LOGO} alt="途正英语" className="w-9 h-9 rounded-xl" />
            <span style={{ color: "#1a1a2e" }} className="text-base font-bold">途正英语</span>
          </div>
          {isAuthenticated ? (
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-medium bg-white/70 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm transition-colors"
              style={{ color: "#6c757d" }}
            >
              <LogOut className="w-3.5 h-3.5" />
              退出
            </button>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-1.5 text-xs font-semibold bg-white/70 backdrop-blur-sm rounded-full px-3 py-1.5 shadow-sm hover:bg-white/90 transition-colors"
              style={{ color: "oklch(0.68 0.19 25)" }}
            >
              <LogIn className="w-3.5 h-3.5" />
              登录
            </button>
          )}
        </motion.div>

        {/* Hero Section */}
        <div className="flex-1 flex flex-col items-center justify-center -mt-4">
          {/* AI Teacher Avatar */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.05 }}
            className="mb-5"
          >
            <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white shadow-xl" style={{ boxShadow: "0 8px 30px rgba(232, 93, 74, 0.15)" }}>
              <img src={AI_AVATAR} alt="AI考官" className="w-full h-full object-cover" />
            </div>
          </motion.div>

          {/* Welcome Text */}
          <motion.div {...fadeIn(0.1)} className="text-center mb-6">
            {isAuthenticated && user ? (
              <p className="text-sm font-medium mb-2" style={{ color: "oklch(0.68 0.19 25)" }}>
                Hi, {user.nickname || "同学"} 👋
              </p>
            ) : null}
            <h1 className="text-3xl font-extrabold mb-3 leading-tight" style={{ color: "#1a1a2e" }}>
              英语水平
              <br />
              <span style={{ color: "oklch(0.68 0.19 25)" }}>AI 智能测评</span>
            </h1>
            <p className="text-sm leading-relaxed max-w-[280px] mx-auto" style={{ color: "#868e96" }}>
              和AI外教对话，3分钟精准评定你的英语水平，开启专属学习之旅
            </p>
          </motion.div>

          {/* Feature Cards */}
          <motion.div {...fadeIn(0.15)} className="w-full max-w-[320px] space-y-3 mb-6">
            <FeatureItem
              icon={<Headphones className="w-5 h-5" />}
              title="听力测试"
              desc="AI外教用英语向你提问"
            />
            <FeatureItem
              icon={<Mic className="w-5 h-5" />}
              title="口语回答"
              desc="用语音回答，AI实时评估"
            />
            <FeatureItem
              icon={<MessageCircle className="w-5 h-5" />}
              title="智能定级"
              desc="自适应出题，精准匹配你的水平"
            />
          </motion.div>
        </div>

          {/* History Link (authenticated users) */}
          {isAuthenticated && (
            <motion.div {...fadeIn(0.18)} className="w-full max-w-[320px] mx-auto mb-4">
              <button
                onClick={() => navigate("/history")}
                className="w-full flex items-center justify-between bg-white/80 backdrop-blur-sm rounded-2xl p-4"
                style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(120, 190, 165, 0.1)" }}>
                    <History className="w-4.5 h-4.5 text-mint-dark" />
                  </div>
                  <span className="text-sm font-medium" style={{ color: "#495057" }}>查看测评记录</span>
                </div>
                <span className="text-xs" style={{ color: "#adb5bd" }}>→</span>
              </button>
            </motion.div>
          )}

          {/* CTA Button */}
          <motion.div {...fadeIn(0.2)} className="pb-6">
          <button
            onClick={handleStart}
            className="w-full h-14 rounded-2xl text-lg font-bold shadow-lg transition-all duration-300 active:scale-[0.98]"
            style={{
              backgroundColor: "oklch(0.68 0.19 25)",
              color: "#ffffff",
              boxShadow: "0 6px 20px rgba(232, 93, 74, 0.3)",
            }}
          >
            {isAuthenticated ? "开始测评" : "登录后开始测评"}
          </button>
          <p className="text-center text-xs mt-3" style={{ color: "#adb5bd" }}>
            测评约需3-5分钟，请确保在安静环境中进行
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function FeatureItem({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div
      className="flex items-center gap-4 bg-white/80 backdrop-blur-sm rounded-2xl p-4"
      style={{ boxShadow: "0 2px 12px rgba(0,0,0,0.04)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: "rgba(232, 93, 74, 0.08)", color: "oklch(0.68 0.19 25)" }}
      >
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-sm" style={{ color: "#1a1a2e" }}>{title}</h3>
        <p className="text-xs" style={{ color: "#868e96" }}>{desc}</p>
      </div>
    </div>
  );
}

/**
 * 途正英语AI分级测评 - 欢迎页
 * 设计风格：蓝绿品牌色 + 透明毛玻璃风格
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Mic, MessageCircle, Headphones, LogIn, LogOut, History } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const LOGO_TEXT = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-transparent_4a301562.png";
const AI_AVATAR = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp";

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" as const },
});

export default function Home() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();

  const handleStart = () => {
    navigate("/rules");
  };

  return (
    <div className="min-h-screen relative overflow-hidden" style={{ background: "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)" }}>
      {/* 装饰性背景元素 */}
      <div className="absolute top-[-80px] right-[-50px] w-52 h-52 rounded-full" style={{ background: "radial-gradient(circle, rgba(27,63,145,0.08) 0%, transparent 70%)" }} />
      <div className="absolute top-[35%] left-[-40px] w-32 h-32 rounded-full" style={{ background: "radial-gradient(circle, rgba(131,186,18,0.10) 0%, transparent 70%)" }} />
      <div className="absolute bottom-[15%] right-[-30px] w-40 h-40 rounded-full" style={{ background: "radial-gradient(circle, rgba(27,63,145,0.06) 0%, transparent 70%)" }} />
      <div className="absolute bottom-[-50px] left-[15%] w-36 h-36 rounded-full" style={{ background: "radial-gradient(circle, rgba(131,186,18,0.08) 0%, transparent 70%)" }} />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col px-6 py-6">
        {/* Header: Logo + Auth */}
        <motion.div {...fadeIn(0)} className="flex items-center justify-between">
          <div className="flex items-center">
            <img src={LOGO_TEXT} alt="途正英语" className="h-8 object-contain" />
          </div>
          {isAuthenticated ? (
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs font-medium backdrop-blur-md rounded-full px-3 py-1.5 shadow-sm transition-all hover:shadow-md"
              style={{ backgroundColor: "rgba(255,255,255,0.6)", color: "#5a6a7a" }}
            >
              <LogOut className="w-3.5 h-3.5" />
              退出
            </button>
          ) : (
            <button
              onClick={() => navigate("/login")}
              className="flex items-center gap-1.5 text-xs font-semibold backdrop-blur-md rounded-full px-3 py-1.5 shadow-sm hover:shadow-md transition-all"
              style={{ backgroundColor: "rgba(255,255,255,0.6)", color: "#1B3F91" }}
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
            <div
              className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/60 shadow-xl"
              style={{ boxShadow: "0 8px 30px rgba(27,63,145,0.15)" }}
            >
              <img src={AI_AVATAR} alt="AI考官" className="w-full h-full object-cover" />
            </div>
          </motion.div>

          {/* Welcome Text */}
          <motion.div {...fadeIn(0.1)} className="text-center mb-6">
            {isAuthenticated && user ? (
              <p className="text-sm font-medium mb-2" style={{ color: "#83BA12" }}>
                Hi, {user.nickname || "同学"} 👋
              </p>
            ) : null}
            <h1 className="text-3xl font-extrabold mb-3 leading-tight" style={{ color: "#1a2340" }}>
              英语水平
              <br />
              <span style={{ color: "#1B3F91" }}>AI 智能测评</span>
            </h1>
            <p className="text-sm leading-relaxed max-w-[280px] mx-auto" style={{ color: "#7a8a9a" }}>
              和AI外教对话，3分钟精准评定你的英语水平，开启专属学习之旅
            </p>
          </motion.div>

          {/* Feature Cards - 毛玻璃效果 */}
          <motion.div {...fadeIn(0.15)} className="w-full max-w-[320px] space-y-3 mb-6">
            <FeatureItem
              icon={<Headphones className="w-5 h-5" />}
              title="听力测试"
              desc="AI外教用英语向你提问"
              color="#1B3F91"
            />
            <FeatureItem
              icon={<Mic className="w-5 h-5" />}
              title="口语回答"
              desc="用语音回答，AI实时评估"
              color="#2B5BA0"
            />
            <FeatureItem
              icon={<MessageCircle className="w-5 h-5" />}
              title="智能定级"
              desc="自适应出题，精准匹配你的水平"
              color="#83BA12"
            />
          </motion.div>
        </div>

        {/* History Link (authenticated users) */}
        {isAuthenticated && (
          <motion.div {...fadeIn(0.18)} className="w-full max-w-[320px] mx-auto mb-4">
            <button
              onClick={() => navigate("/history")}
              className="w-full flex items-center justify-between backdrop-blur-md rounded-2xl p-4 transition-all hover:shadow-md"
              style={{ backgroundColor: "rgba(255,255,255,0.55)", boxShadow: "0 2px 12px rgba(27,63,145,0.06)" }}
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ backgroundColor: "rgba(131,186,18,0.12)" }}>
                  <History className="w-4.5 h-4.5" style={{ color: "#6a9a10" }} />
                </div>
                <span className="text-sm font-medium" style={{ color: "#3a4a5a" }}>查看测评记录</span>
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
              background: "linear-gradient(135deg, #1B3F91 0%, #2B5BA0 100%)",
              color: "#ffffff",
              boxShadow: "0 6px 20px rgba(27,63,145,0.30)",
            }}
          >
            开始测评
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
  color,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  color: string;
}) {
  return (
    <div
      className="flex items-center gap-4 backdrop-blur-md rounded-2xl p-4 transition-all hover:shadow-md"
      style={{ backgroundColor: "rgba(255,255,255,0.55)", boxShadow: "0 2px 12px rgba(27,63,145,0.05)" }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${color}12`, color }}
      >
        {icon}
      </div>
      <div>
        <h3 className="font-bold text-sm" style={{ color: "#1a2340" }}>{title}</h3>
        <p className="text-xs" style={{ color: "#7a8a9a" }}>{desc}</p>
      </div>
    </div>
  );
}

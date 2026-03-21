/**
 * 途正英语AI分级测评 - 欢迎页
 * 去掉三个卡片说明，换成测评示例视频
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Play, LogIn, LogOut, History } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useState } from "react";

const LOGO_TEXT = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-transparent_4a301562.png";

// 示例视频URL（后续由客户提供真实视频替换）
const DEMO_VIDEO_URL = "";

const fadeIn = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" as const },
});

export default function Home() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, logout } = useAuth();
  const [showVideo, setShowVideo] = useState(false);

  const handleStart = () => {
    navigate("/rules");
  };

  const handlePlayDemo = () => {
    if (DEMO_VIDEO_URL) {
      setShowVideo(true);
    } else {
      // 暂无视频时提示
      setShowVideo(true);
    }
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
          {/* Welcome Text */}
          <motion.div {...fadeIn(0.1)} className="text-center mb-6">
            {isAuthenticated && user ? (
              <p className="text-sm font-medium mb-2" style={{ color: "#83BA12" }}>
                Hi, {user.nickname || "同学"}
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

          {/* 测评示例视频 - 替换原来的三个卡片 */}
          <motion.div {...fadeIn(0.15)} className="w-full max-w-[320px] mb-6">
            <button
              onClick={handlePlayDemo}
              className="w-full backdrop-blur-md rounded-2xl overflow-hidden transition-all hover:shadow-lg active:scale-[0.98]"
              style={{
                backgroundColor: "rgba(255,255,255,0.60)",
                boxShadow: "0 4px 20px rgba(27,63,145,0.08)",
                border: "1px solid rgba(255,255,255,0.5)",
              }}
            >
              <div className="relative h-44 flex items-center justify-center" style={{ background: "linear-gradient(135deg, rgba(27,63,145,0.06), rgba(131,186,18,0.06))" }}>
                {/* 播放按钮 */}
                <div className="relative">
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: "rgba(27,63,145,0.10)" }}
                    animate={{ scale: [1, 1.8, 1], opacity: [0.4, 0, 0.4] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <div
                    className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-lg"
                    style={{ background: "linear-gradient(135deg, #1B3F91, #2B5BA0)" }}
                  >
                    <Play className="w-7 h-7 text-white ml-1" />
                  </div>
                </div>
                {/* 装饰性波纹 */}
                <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-[3px]">
                  {Array.from({ length: 24 }).map((_, i) => {
                    const heights = [4, 8, 6, 12, 8, 16, 10, 6, 14, 5, 11, 8, 15, 6, 10, 7, 13, 5, 9, 12, 7, 14, 8, 6];
                    return (
                      <motion.div
                        key={i}
                        className="rounded-full"
                        style={{
                          width: 2.5,
                          height: heights[i % heights.length],
                          backgroundColor: "rgba(27,63,145,0.20)",
                        }}
                        animate={{ height: [heights[i % heights.length], heights[i % heights.length] * 0.3 + Math.random() * heights[i % heights.length] * 0.8, heights[i % heights.length]] }}
                        transition={{ duration: 0.8 + Math.random() * 0.5, repeat: Infinity, delay: i * 0.05 }}
                      />
                    );
                  })}
                </div>
              </div>
              <div className="px-4 py-3 text-center">
                <p className="text-sm font-semibold" style={{ color: "#1B3F91" }}>
                  观看测评示例
                </p>
                <p className="text-xs mt-0.5" style={{ color: "#7a8a9a" }}>
                  了解测评流程，轻松上手
                </p>
              </div>
            </button>
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
            测评约需5分钟，请确保在安静环境中进行
          </p>
        </motion.div>
      </div>

      {/* 视频弹窗 */}
      {showVideo && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)" }}
          onClick={() => setShowVideo(false)}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.3 }}
            className="w-[90%] max-w-[400px] rounded-2xl overflow-hidden bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {DEMO_VIDEO_URL ? (
              <video
                src={DEMO_VIDEO_URL}
                controls
                autoPlay
                className="w-full aspect-video"
                playsInline
              />
            ) : (
              <div className="w-full aspect-video flex flex-col items-center justify-center" style={{ background: "linear-gradient(135deg, #e8eef8, #eef6e8)" }}>
                <div
                  className="w-16 h-16 rounded-full flex items-center justify-center mb-4"
                  style={{ background: "linear-gradient(135deg, rgba(27,63,145,0.10), rgba(131,186,18,0.10))" }}
                >
                  <Play className="w-7 h-7 ml-0.5" style={{ color: "#1B3F91" }} />
                </div>
                <p className="text-sm font-medium" style={{ color: "#1B3F91" }}>示例视频即将上线</p>
                <p className="text-xs mt-1" style={{ color: "#7a8a9a" }}>敬请期待</p>
              </div>
            )}
            <div className="p-4 text-center">
              <button
                onClick={() => setShowVideo(false)}
                className="text-sm font-medium px-6 py-2 rounded-full transition-colors"
                style={{ color: "#1B3F91", backgroundColor: "rgba(27,63,145,0.06)" }}
              >
                关闭
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}

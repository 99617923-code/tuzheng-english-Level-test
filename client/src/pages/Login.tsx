/**
 * 途正英语AI分级测评 - 登录页
 * 手机号 + 短信验证码登录（未注册自动创建账号）
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Phone, MessageSquare, ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { sendSmsCode, smsLogin } from "@/lib/api";

const AI_AVATAR = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp";
const LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-icon-C98gq5asJFpo7UzBQvohka.webp";

export default function Login() {
  const [, navigate] = useLocation();
  const { setUser, isAuthenticated } = useAuth();

  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 已登录则跳转首页
  useEffect(() => {
    if (isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  // 倒计时管理
  useEffect(() => {
    if (countdown > 0) {
      countdownRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownRef.current) clearInterval(countdownRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, [countdown]);

  // 发送短信验证码
  const handleSendCode = useCallback(async () => {
    if (!phone.trim()) {
      toast.error("请输入手机号");
      return;
    }
    if (!/^1\d{10}$/.test(phone.trim())) {
      toast.error("请输入正确的11位手机号");
      return;
    }
    if (countdown > 0) return;

    setSendingCode(true);
    try {
      await sendSmsCode({ phone: phone.trim(), purpose: "login" });
      toast.success("验证码已发送，请查看短信");
      setCountdown(60);
    } catch (err: any) {
      toast.error(err.message || "发送验证码失败，请稍后重试");
    } finally {
      setSendingCode(false);
    }
  }, [phone, countdown]);

  // 登录
  const handleLogin = async () => {
    if (!phone.trim()) {
      toast.error("请输入手机号");
      return;
    }
    if (!/^1\d{10}$/.test(phone.trim())) {
      toast.error("请输入正确的11位手机号");
      return;
    }
    if (!smsCode.trim()) {
      toast.error("请输入短信验证码");
      return;
    }
    if (smsCode.trim().length < 4) {
      toast.error("请输入完整的验证码");
      return;
    }

    setLoading(true);
    try {
      const data = await smsLogin({
        phone: phone.trim(),
        code: smsCode.trim(),
      });
      setUser(data.user);
      if (data.is_new_user) {
        toast.success("注册成功，已自动登录！");
      } else {
        toast.success("登录成功！");
      }
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "登录失败，请检查验证码是否正确");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* 顶部渐变装饰区 */}
      <div className="relative h-52 overflow-hidden shrink-0">
        <div className="absolute inset-0 bg-gradient-to-br from-coral via-coral-light to-mint" />
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white/40 shadow-xl mb-3">
              <img src={AI_AVATAR} alt="" className="w-full h-full object-cover" />
            </div>
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            style={{ color: "#ffffff", textShadow: "0 2px 8px rgba(0,0,0,0.3)" }}
            className="text-xl font-extrabold"
          >
            途正英语
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            style={{ color: "rgba(255,255,255,0.9)", textShadow: "0 1px 4px rgba(0,0,0,0.2)" }}
            className="text-sm mt-1 font-medium"
          >
            AI智能英语水平测评
          </motion.p>
        </div>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 60" fill="none">
          <path d="M0,40 C360,80 720,0 1440,40 L1440,60 L0,60 Z" fill="oklch(0.98 0.01 80)" />
        </svg>
      </div>

      {/* 登录表单 */}
      <div className="flex-1 px-6 -mt-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white rounded-3xl p-6 shadow-xl"
          style={{ boxShadow: "0 8px 30px rgba(0,0,0,0.08)" }}
        >
          <h2 style={{ color: "#1a1a2e" }} className="text-lg font-extrabold mb-2 text-center">
            手机号快捷登录
          </h2>
          <p style={{ color: "#adb5bd" }} className="text-xs text-center mb-6">
            未注册的手机号将自动创建账号
          </p>

          {/* 手机号 */}
          <div className="mb-4">
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all focus-within:ring-2 focus-within:ring-coral/30 focus-within:border-coral/30"
              style={{ backgroundColor: "#f8f9fa", borderColor: "#e9ecef" }}
            >
              <Phone className="w-5 h-5 shrink-0" style={{ color: "#adb5bd" }} />
              <input
                type="tel"
                placeholder="请输入手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                maxLength={11}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "#1a1a2e" }}
              />
            </div>
          </div>

          {/* 短信验证码 */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <div
                className="flex-1 flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all focus-within:ring-2 focus-within:ring-coral/30 focus-within:border-coral/30"
                style={{ backgroundColor: "#f8f9fa", borderColor: "#e9ecef" }}
              >
                <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: "#adb5bd" }} />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="请输入验证码"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: "#1a1a2e" }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <button
                onClick={handleSendCode}
                disabled={sendingCode || countdown > 0}
                className="h-[50px] min-w-[110px] rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-60 shrink-0"
                style={{
                  backgroundColor: countdown > 0 ? "#f1f3f5" : "oklch(0.68 0.19 25)",
                  color: countdown > 0 ? "#868e96" : "#ffffff",
                  boxShadow: countdown > 0 ? "none" : "0 2px 8px rgba(232, 93, 74, 0.2)",
                }}
              >
                {sendingCode ? (
                  <RefreshCw className="w-4 h-4 animate-spin mx-auto" />
                ) : countdown > 0 ? (
                  `${countdown}s 后重发`
                ) : (
                  "获取验证码"
                )}
              </button>
            </div>
          </div>

          {/* 登录按钮 */}
          <button
            onClick={handleLogin}
            disabled={loading}
            className="w-full h-13 rounded-2xl text-base font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2"
            style={{
              backgroundColor: "oklch(0.68 0.19 25)",
              color: "#ffffff",
              boxShadow: "0 4px 15px rgba(232, 93, 74, 0.3)",
            }}
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin" />
            ) : (
              <ArrowRight className="w-5 h-5" />
            )}
            {loading ? "登录中..." : "登录"}
          </button>

          {/* 协议提示 */}
          <p className="mt-4 text-center text-xs" style={{ color: "#ced4da" }}>
            登录即表示同意《用户服务协议》和《隐私政策》
          </p>
        </motion.div>

        {/* 底部品牌 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="flex items-center justify-center gap-2 mt-8 mb-6"
        >
          <img src={LOGO} alt="" className="w-5 h-5 rounded-md opacity-50" />
          <span className="text-xs" style={{ color: "#adb5bd" }}>途正英语</span>
        </motion.div>
      </div>
    </div>
  );
}

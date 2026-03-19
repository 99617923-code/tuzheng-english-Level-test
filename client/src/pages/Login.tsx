/**
 * 途正英语AI分级测评 - 登录页
 * 对接客户后端API: 手机号+密码+图形验证码
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Phone, Lock, Eye, EyeOff, RefreshCw, ArrowRight, UserPlus } from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { getCaptcha, login, type CaptchaResponse } from "@/lib/api";

const AI_AVATAR = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp";
const LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-icon-C98gq5asJFpo7UzBQvohka.webp";

export default function Login() {
  const [, navigate] = useLocation();
  const { setUser, isAuthenticated } = useAuth();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [captchaCode, setCaptchaCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [captcha, setCaptcha] = useState<CaptchaResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

  const loadCaptcha = useCallback(async () => {
    setLoadingCaptcha(true);
    try {
      const data = await getCaptcha();
      setCaptcha(data);
      setCaptchaCode("");
    } catch {
      toast.error("获取验证码失败，请稍后重试");
    } finally {
      setLoadingCaptcha(false);
    }
  }, []);

  useEffect(() => {
    loadCaptcha();
  }, [loadCaptcha]);

  const handleLogin = async () => {
    if (!phone.trim()) {
      toast.error("请输入手机号");
      return;
    }
    if (!/^1\d{10}$/.test(phone.trim())) {
      toast.error("请输入正确的手机号");
      return;
    }
    if (!password.trim()) {
      toast.error("请输入密码");
      return;
    }
    if (captcha && !captchaCode.trim()) {
      toast.error("请输入验证码");
      return;
    }

    setLoading(true);
    try {
      const data = await login({
        phone: phone.trim(),
        password: password.trim(),
        captchaId: captcha?.captchaId,
        captchaCode: captchaCode.trim(),
      });
      setUser(data.user_info);
      toast.success("登录成功！");
      navigate("/");
    } catch (err: any) {
      toast.error(err.message || "登录失败，请检查账号密码");
      loadCaptcha();
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
          <h2 style={{ color: "#1a1a2e" }} className="text-lg font-extrabold mb-6 text-center">
            登录账号
          </h2>

          {/* 手机号 */}
          <div className="mb-4">
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all focus-within:ring-2 focus-within:ring-coral/30 focus-within:border-coral/30" style={{ backgroundColor: "#f8f9fa", borderColor: "#e9ecef" }}>
              <Phone className="w-5 h-5 shrink-0" style={{ color: "#adb5bd" }} />
              <input
                type="tel"
                placeholder="请输入手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={11}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "#1a1a2e" }}
              />
            </div>
          </div>

          {/* 密码 */}
          <div className="mb-4">
            <div className="flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all focus-within:ring-2 focus-within:ring-coral/30 focus-within:border-coral/30" style={{ backgroundColor: "#f8f9fa", borderColor: "#e9ecef" }}>
              <Lock className="w-5 h-5 shrink-0" style={{ color: "#adb5bd" }} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="请输入密码"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "#1a1a2e" }}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{ color: "#adb5bd" }}
                className="hover:opacity-70 transition-opacity"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 图形验证码 */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all focus-within:ring-2 focus-within:ring-coral/30 focus-within:border-coral/30" style={{ backgroundColor: "#f8f9fa", borderColor: "#e9ecef" }}>
                <input
                  type="text"
                  placeholder="请输入验证码"
                  value={captchaCode}
                  onChange={(e) => setCaptchaCode(e.target.value)}
                  maxLength={6}
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: "#1a1a2e" }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <button
                onClick={loadCaptcha}
                disabled={loadingCaptcha}
                className="h-[50px] min-w-[120px] rounded-2xl overflow-hidden flex items-center justify-center hover:opacity-80 transition-opacity border"
                style={{ backgroundColor: "#f8f9fa", borderColor: "#e9ecef" }}
              >
                {loadingCaptcha ? (
                  <RefreshCw className="w-5 h-5 animate-spin" style={{ color: "#adb5bd" }} />
                ) : captcha?.captchaImage ? (
                  <img
                    src={captcha.captchaImage}
                    alt="验证码"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="text-xs" style={{ color: "#adb5bd" }}>加载中...</span>
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

          {/* 注册入口 */}
          <div className="mt-5 text-center">
            <button
              onClick={() => navigate("/register")}
              className="text-sm transition-colors inline-flex items-center gap-1 hover:opacity-70"
              style={{ color: "#6c757d" }}
            >
              <UserPlus className="w-3.5 h-3.5" />
              还没有账号？立即注册
            </button>
          </div>
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

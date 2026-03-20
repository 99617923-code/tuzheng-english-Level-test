/**
 * 途正英语AI分级测评 - 登录页
 * 手机号 + 短信验证码登录（未注册自动创建账号）
 * 蓝绿品牌色 + 透明毛玻璃风格
 */
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Phone, ArrowRight, RefreshCw, ShieldCheck } from "lucide-react";
import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { sendSmsCode, smsLogin } from "@/lib/api";

const AI_AVATAR = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp";
const LOGO_TEXT = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-transparent_4a301562.png";

export default function Login() {
  const [, navigate] = useLocation();
  const { setUser, isAuthenticated } = useAuth();

  const [phone, setPhone] = useState("");
  const [smsCode, setSmsCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isAuthenticated) navigate("/");
  }, [isAuthenticated, navigate]);

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
    <div
      className="min-h-screen flex flex-col"
      style={{ background: "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)" }}
    >
      {/* 顶部渐变装饰区 */}
      <div className="relative h-52 overflow-hidden shrink-0">
        <div
          className="absolute inset-0"
          style={{ background: "linear-gradient(135deg, #1B3F91 0%, #2B5BA0 50%, #4a8a30 100%)" }}
        />
        {/* 装饰圆形 */}
        <div className="absolute top-[-20px] right-[-20px] w-32 h-32 rounded-full" style={{ background: "rgba(131,186,18,0.15)" }} />
        <div className="absolute bottom-[-10px] left-[-15px] w-24 h-24 rounded-full" style={{ background: "rgba(255,255,255,0.08)" }} />

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
          >
            <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white/30 shadow-xl mb-3">
              <img src={AI_AVATAR} alt="" className="w-full h-full object-cover" />
            </div>
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <img src={LOGO_TEXT} alt="途正英语" className="h-7 object-contain brightness-0 invert" style={{ filter: "brightness(0) invert(1)" }} />
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-sm mt-2 font-medium"
            style={{ color: "rgba(255,255,255,0.85)" }}
          >
            AI智能英语水平测评
          </motion.p>
        </div>
        <svg className="absolute bottom-0 left-0 w-full" viewBox="0 0 1440 60" fill="none">
          <path d="M0,40 C360,80 720,0 1440,40 L1440,60 L0,60 Z" fill="#edf0f5" />
        </svg>
      </div>

      {/* 登录表单 - 毛玻璃卡片 */}
      <div className="flex-1 px-6 -mt-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="backdrop-blur-xl rounded-3xl p-6"
          style={{
            backgroundColor: "rgba(255,255,255,0.70)",
            boxShadow: "0 8px 32px rgba(27,63,145,0.10), inset 0 1px 0 rgba(255,255,255,0.5)",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        >
          <h2 className="text-lg font-extrabold mb-2 text-center" style={{ color: "#1a2340" }}>
            手机号快捷登录
          </h2>
          <p className="text-xs text-center mb-6" style={{ color: "#8a95a5" }}>
            未注册的手机号将自动创建账号
          </p>

          {/* 手机号 */}
          <div className="mb-4">
            <div
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all focus-within:ring-2 focus-within:border-transparent"
              style={{
                backgroundColor: "rgba(255,255,255,0.6)",
                borderColor: "rgba(27,63,145,0.12)",
                "--tw-ring-color": "rgba(27,63,145,0.20)",
              } as any}
            >
              <Phone className="w-5 h-5 shrink-0" style={{ color: "#8a95a5" }} />
              <input
                type="tel"
                placeholder="请输入手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))}
                maxLength={11}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "#1a2340" }}
              />
            </div>
          </div>

          {/* 短信验证码 */}
          <div className="mb-6">
            <div className="flex items-center gap-3">
              <div
                className="flex-1 flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all focus-within:ring-2 focus-within:border-transparent"
                style={{
                  backgroundColor: "rgba(255,255,255,0.6)",
                  borderColor: "rgba(27,63,145,0.12)",
                  "--tw-ring-color": "rgba(27,63,145,0.20)",
                } as any}
              >
                <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: "#8a95a5" }} />
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="请输入验证码"
                  value={smsCode}
                  onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, ""))}
                  maxLength={6}
                  className="flex-1 bg-transparent outline-none text-sm"
                  style={{ color: "#1a2340" }}
                  onKeyDown={(e) => e.key === "Enter" && handleLogin()}
                />
              </div>
              <button
                onClick={handleSendCode}
                disabled={sendingCode || countdown > 0}
                className="h-[50px] min-w-[110px] rounded-2xl text-sm font-semibold transition-all active:scale-[0.97] disabled:opacity-60 shrink-0"
                style={{
                  background: countdown > 0 ? "rgba(240,242,245,0.8)" : "linear-gradient(135deg, #1B3F91, #2B5BA0)",
                  color: countdown > 0 ? "#8a95a5" : "#ffffff",
                  boxShadow: countdown > 0 ? "none" : "0 2px 8px rgba(27,63,145,0.25)",
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
              background: "linear-gradient(135deg, #1B3F91 0%, #2B5BA0 100%)",
              color: "#ffffff",
              boxShadow: "0 4px 15px rgba(27,63,145,0.30)",
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
          <p className="mt-4 text-center text-xs" style={{ color: "#b0b8c5" }}>
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
          <img src={LOGO_TEXT} alt="" className="h-4 object-contain opacity-30" />
        </motion.div>
      </div>
    </div>
  );
}

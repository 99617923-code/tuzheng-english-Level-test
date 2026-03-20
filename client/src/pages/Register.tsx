/**
 * 途正英语AI分级测评 - 注册页
 * 蓝绿品牌色 + 透明毛玻璃风格
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Phone, Lock, Eye, EyeOff, User, ChevronLeft, RefreshCw, ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { register } from "@/lib/api";

const LOGO_TEXT = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-transparent_4a301562.png";

export default function Register() {
  const [, navigate] = useLocation();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!phone.trim()) {
      toast.error("请输入手机号");
      return;
    }
    if (!/^1\d{10}$/.test(phone.trim())) {
      toast.error("请输入正确的手机号");
      return;
    }
    if (!password.trim() || password.length < 6) {
      toast.error("密码至少6位");
      return;
    }
    if (password !== confirmPassword) {
      toast.error("两次密码不一致");
      return;
    }

    setLoading(true);
    try {
      await register({
        phone: phone.trim(),
        password: password.trim(),
        nickname: nickname.trim() || undefined,
        role: "student",
      });
      toast.success("注册成功！请登录");
      navigate("/login");
    } catch (err: any) {
      toast.error(err.message || "注册失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  const inputClass =
    "flex items-center gap-3 rounded-2xl px-4 py-3.5 border transition-all focus-within:ring-2 focus-within:border-transparent";

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
          onClick={() => navigate("/login")}
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/40 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" style={{ color: "#3a4a5a" }} />
        </button>
        <h2 className="flex-1 text-center font-extrabold text-lg pr-10" style={{ color: "#1a2340" }}>
          注册账号
        </h2>
      </motion.div>

      {/* Form */}
      <div className="flex-1 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="backdrop-blur-xl rounded-3xl p-6"
          style={{
            backgroundColor: "rgba(255,255,255,0.70)",
            boxShadow: "0 8px 32px rgba(27,63,145,0.10)",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        >
          {/* 昵称 */}
          <div className="mb-4">
            <label className="text-xs mb-1.5 block ml-1 font-medium" style={{ color: "#7a8a9a" }}>昵称（选填）</label>
            <div
              className={inputClass}
              style={{
                backgroundColor: "rgba(255,255,255,0.6)",
                borderColor: "rgba(27,63,145,0.12)",
                "--tw-ring-color": "rgba(27,63,145,0.20)",
              } as any}
            >
              <User className="w-5 h-5 shrink-0" style={{ color: "#8a95a5" }} />
              <input
                type="text"
                placeholder="你的英文名或昵称"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "#1a2340" }}
              />
            </div>
          </div>

          {/* 手机号 */}
          <div className="mb-4">
            <label className="text-xs mb-1.5 block ml-1 font-medium" style={{ color: "#7a8a9a" }}>手机号</label>
            <div
              className={inputClass}
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
                onChange={(e) => setPhone(e.target.value)}
                maxLength={11}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "#1a2340" }}
              />
            </div>
          </div>

          {/* 密码 */}
          <div className="mb-4">
            <label className="text-xs mb-1.5 block ml-1 font-medium" style={{ color: "#7a8a9a" }}>密码</label>
            <div
              className={inputClass}
              style={{
                backgroundColor: "rgba(255,255,255,0.6)",
                borderColor: "rgba(27,63,145,0.12)",
                "--tw-ring-color": "rgba(27,63,145,0.20)",
              } as any}
            >
              <Lock className="w-5 h-5 shrink-0" style={{ color: "#8a95a5" }} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="请设置密码（至少6位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "#1a2340" }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="transition-colors"
                style={{ color: "#8a95a5" }}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 确认密码 */}
          <div className="mb-6">
            <label className="text-xs mb-1.5 block ml-1 font-medium" style={{ color: "#7a8a9a" }}>确认密码</label>
            <div
              className={inputClass}
              style={{
                backgroundColor: "rgba(255,255,255,0.6)",
                borderColor: "rgba(27,63,145,0.12)",
                "--tw-ring-color": "rgba(27,63,145,0.20)",
              } as any}
            >
              <Lock className="w-5 h-5 shrink-0" style={{ color: "#8a95a5" }} />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                className="flex-1 bg-transparent outline-none text-sm"
                style={{ color: "#1a2340" }}
              />
            </div>
          </div>

          {/* 注册按钮 */}
          <Button
            onClick={handleRegister}
            disabled={loading}
            className="w-full h-13 rounded-2xl text-white text-base font-bold shadow-lg transition-all active:scale-[0.98] disabled:opacity-60"
            style={{
              background: "linear-gradient(135deg, #1B3F91 0%, #2B5BA0 100%)",
              boxShadow: "0 4px 15px rgba(27,63,145,0.30)",
            }}
          >
            {loading ? (
              <RefreshCw className="w-5 h-5 animate-spin mr-2" />
            ) : (
              <ArrowRight className="w-5 h-5 mr-2" />
            )}
            {loading ? "注册中..." : "注册"}
          </Button>

          {/* 返回登录 */}
          <div className="mt-5 text-center">
            <button
              onClick={() => navigate("/login")}
              className="text-sm transition-colors hover:opacity-80"
              style={{ color: "#1B3F91" }}
            >
              已有账号？返回登录
            </button>
          </div>
        </motion.div>

        {/* 底部品牌 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="flex items-center justify-center gap-2 mt-8 mb-6"
        >
          <img src={LOGO_TEXT} alt="" className="h-4 object-contain opacity-30" />
        </motion.div>
      </div>
    </div>
  );
}

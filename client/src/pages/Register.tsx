/**
 * 途正英语AI分级测评 - 注册页
 * 对接客户后端API: 手机号+密码+昵称
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import { Phone, Lock, Eye, EyeOff, User, ChevronLeft, RefreshCw, ArrowRight } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { register } from "@/lib/api";

const LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-icon-C98gq5asJFpo7UzBQvohka.webp";

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

  const inputClass = "flex items-center gap-3 bg-gray-50 rounded-2xl px-4 py-3.5 border border-gray-100 focus-within:ring-2 focus-within:ring-coral/30 focus-within:border-coral/30 transition-all";

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center px-4 py-4"
      >
        <button
          onClick={() => navigate("/login")}
          className="w-10 h-10 rounded-xl flex items-center justify-center hover:bg-white/60 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-gray-700" />
        </button>
        <h2 className="flex-1 text-center font-extrabold text-lg text-gray-800 pr-10">
          注册账号
        </h2>
      </motion.div>

      {/* Form */}
      <div className="flex-1 px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-white rounded-3xl p-6 shadow-xl shadow-black/8"
        >
          {/* 昵称 */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1.5 block ml-1 font-medium">昵称（选填）</label>
            <div className={inputClass}>
              <User className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                type="text"
                placeholder="你的英文名或昵称"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                maxLength={20}
                className="flex-1 bg-transparent outline-none text-gray-800 text-sm placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* 手机号 */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1.5 block ml-1 font-medium">手机号</label>
            <div className={inputClass}>
              <Phone className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                type="tel"
                placeholder="请输入手机号"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                maxLength={11}
                className="flex-1 bg-transparent outline-none text-gray-800 text-sm placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* 密码 */}
          <div className="mb-4">
            <label className="text-xs text-gray-500 mb-1.5 block ml-1 font-medium">密码</label>
            <div className={inputClass}>
              <Lock className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="请设置密码（至少6位）"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 bg-transparent outline-none text-gray-800 text-sm placeholder:text-gray-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* 确认密码 */}
          <div className="mb-6">
            <label className="text-xs text-gray-500 mb-1.5 block ml-1 font-medium">确认密码</label>
            <div className={inputClass}>
              <Lock className="w-5 h-5 text-gray-400 shrink-0" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="请再次输入密码"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
                className="flex-1 bg-transparent outline-none text-gray-800 text-sm placeholder:text-gray-400"
              />
            </div>
          </div>

          {/* 注册按钮 */}
          <Button
            onClick={handleRegister}
            disabled={loading}
            className="w-full h-13 rounded-2xl bg-coral hover:bg-coral-dark text-white text-base font-bold shadow-lg shadow-coral/30 transition-all active:scale-[0.98] disabled:opacity-60"
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
              className="text-sm text-gray-500 hover:text-coral transition-colors"
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
          <img src={LOGO} alt="" className="w-5 h-5 rounded-md opacity-50" />
          <span className="text-xs text-gray-400">途正英语</span>
        </motion.div>
      </div>
    </div>
  );
}

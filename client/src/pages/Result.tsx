/**
 * 途正英语AI分级测评 - 结果展示页
 * 对接后端API: GET /api/v1/test/result/:sessionId
 * 设计风格：庆祝感 + 清晰的级别展示 + 引导入群
 */
import { Button } from "@/components/ui/button";
import { useLocation, useSearch } from "wouter";
import { motion } from "framer-motion";
import {
  Star,
  BookOpen,
  Users,
  RotateCcw,
  Share2,
  Award,
  TrendingUp,
  ChevronRight,
  Loader2,
  History,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { getTestResult, type TestResultDetail } from "@/lib/api";

const LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-icon-C98gq5asJFpo7UzBQvohka.webp";

// Level configurations
const LEVEL_CONFIG: Record<
  number,
  {
    name: string;
    label: string;
    color: string;
    bgColor: string;
    iconBg: string;
    description: string;
    recommendation: string;
    stars: number;
    abilityLabel: string;
  }
> = {
  0: {
    name: "零级",
    label: "零基础 / 小学水平",
    color: "text-amber-700",
    bgColor: "bg-amber-50",
    iconBg: "bg-amber-100",
    description:
      "你目前处于英语入门阶段，掌握了基本的英文字母和少量常用词汇。别担心，每个人都是从零开始的！",
    recommendation:
      "推荐加入零基础口语营，从最基础的日常用语开始，循序渐进地建立英语信心。",
    stars: 1,
    abilityLabel: "入门",
  },
  1: {
    name: "一级",
    label: "初中水平",
    color: "text-blue-700",
    bgColor: "bg-blue-50",
    iconBg: "bg-blue-100",
    description:
      "你具备初中水平的英语基础，能理解简单的日常对话，可以用基本句型进行交流。",
    recommendation:
      "推荐加入初级口语营，重点提升日常会话能力和基础语法运用。",
    stars: 2,
    abilityLabel: "基础",
  },
  2: {
    name: "二级",
    label: "高中水平",
    color: "text-emerald-700",
    bgColor: "bg-emerald-50",
    iconBg: "bg-emerald-100",
    description:
      "你的英语基础不错！能理解较复杂的句子结构，能够就常见话题进行较为流畅的表达。",
    recommendation:
      "推荐加入中级口语营，进一步拓展词汇量，提升口语表达的准确性和流利度。",
    stars: 3,
    abilityLabel: "中级",
  },
  3: {
    name: "三级",
    label: "高中以上水平",
    color: "text-purple-700",
    bgColor: "bg-purple-50",
    iconBg: "bg-purple-100",
    description:
      "你的英语水平很棒！词汇丰富，语法扎实，能够应对复杂的语言场景，表达流利自如。",
    recommendation:
      "推荐加入高级口语营，挑战更高难度的话题讨论和商务英语场景。",
    stars: 4,
    abilityLabel: "高级",
  },
};

export default function Result() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const sessionId = params.get("sessionId");
  const levelFromUrl = parseInt(params.get("level") || "1");
  const questionsFromUrl = parseInt(params.get("questions") || "6");

  const [resultData, setResultData] = useState<TestResultDetail | null>(null);
  const [loading, setLoading] = useState(!!sessionId);

  // 如果有sessionId，从后端获取详细结果
  useEffect(() => {
    if (!sessionId) return;

    const fetchResult = async () => {
      try {
        const data = await getTestResult(sessionId);
        setResultData(data);
      } catch {
        // 如果获取失败，使用URL参数中的数据
        toast.error("获取详细结果失败，显示基本信息");
      } finally {
        setLoading(false);
      }
    };
    fetchResult();
  }, [sessionId]);

  // 使用后端数据或URL参数
  const level = resultData?.finalLevel ?? levelFromUrl;
  const questions = resultData?.questionCount ?? questionsFromUrl;
  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
  const description = resultData?.recommendation || config.description;
  const recommendation = config.recommendation;

  // 分项得分
  const scores = resultData?.scores;

  if (loading) {
    return (
      <div className="min-h-screen bg-cream flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-10 h-10 text-coral animate-spin mx-auto mb-3" />
          <p className="text-sm text-warm-gray font-medium">正在生成测评报告...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cream relative overflow-hidden">
      {/* 顶部渐变装饰 */}
      <div className="absolute top-0 left-0 right-0 h-64 bg-gradient-to-b from-coral/10 to-transparent" />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col px-6 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-4"
        >
          <img src={LOGO} alt="途正英语" className="w-8 h-8 rounded-lg" />
          <span className="text-sm font-bold text-gray-700">测评报告</span>
          <div className="w-8" />
        </motion.div>

        {/* Result Card */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="bg-white rounded-3xl p-6 shadow-xl shadow-black/8 mb-5"
        >
          {/* Award Icon */}
          <div className="flex justify-center mb-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
              className={`w-20 h-20 rounded-full ${config.iconBg} flex items-center justify-center`}
            >
              <Award className={`w-10 h-10 ${config.color}`} />
            </motion.div>
          </div>

          {/* Level Display */}
          <div className="text-center mb-5">
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-3xl font-extrabold text-gray-800 mb-1"
            >
              {resultData?.levelName || config.name}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className={`text-sm font-bold ${config.color}`}
            >
              {resultData?.levelLabel || config.label}
            </motion.p>
          </div>

          {/* Stars */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex justify-center gap-1.5 mb-5"
          >
            {[1, 2, 3, 4].map((i) => (
              <motion.div
                key={i}
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ delay: 0.8 + i * 0.15, type: "spring" }}
              >
                <Star
                  className={`w-7 h-7 ${
                    i <= config.stars
                      ? "text-amber-400 fill-amber-400"
                      : "text-gray-200 fill-gray-200"
                  }`}
                />
              </motion.div>
            ))}
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.9 }}
            className="flex justify-center gap-8 mb-5"
          >
            <div className="text-center">
              <p className="text-2xl font-extrabold text-gray-800">{questions}</p>
              <p className="text-xs text-gray-500 font-medium">测评题数</p>
            </div>
            <div className="w-px bg-gray-200" />
            <div className="text-center">
              <p className="text-2xl font-extrabold text-coral">
                {config.abilityLabel}
              </p>
              <p className="text-xs text-gray-500 font-medium">能力评级</p>
            </div>
            {resultData?.totalDuration && (
              <>
                <div className="w-px bg-gray-200" />
                <div className="text-center">
                  <p className="text-2xl font-extrabold text-gray-800">
                    {Math.round(resultData.totalDuration / 60)}
                  </p>
                  <p className="text-xs text-gray-500 font-medium">用时(分钟)</p>
                </div>
              </>
            )}
          </motion.div>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-sm text-gray-600 leading-relaxed text-center"
          >
            {description}
          </motion.p>
        </motion.div>

        {/* Detailed Scores Card (if available from API) */}
        {scores && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05 }}
            className="bg-white rounded-2xl p-5 shadow-md shadow-black/5 mb-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5 text-coral" />
              <h3 className="font-bold text-gray-800 text-sm">分项得分</h3>
            </div>
            <div className="space-y-3">
              {[
                { label: "综合得分", value: scores.overall, color: "bg-coral" },
                { label: "听力理解", value: scores.comprehension, color: "bg-blue-500" },
                { label: "语法运用", value: scores.grammar, color: "bg-emerald-500" },
                { label: "词汇量", value: scores.vocabulary, color: "bg-amber-500" },
                { label: "发音", value: scores.pronunciation, color: "bg-purple-500" },
                { label: "流利度", value: scores.fluency, color: "bg-pink-500" },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-xs text-gray-600 w-16 shrink-0">{item.label}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.value}%` }}
                      transition={{ duration: 0.8, delay: 1.2 }}
                      className={`h-full rounded-full ${item.color}`}
                    />
                  </div>
                  <span className="text-xs font-bold text-gray-700 w-8 text-right">{item.value}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Recommendation Card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.1 }}
          className="bg-white rounded-2xl p-5 shadow-md shadow-black/5 mb-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-5 h-5 text-coral" />
            <h3 className="font-bold text-gray-800 text-sm">学习建议</h3>
          </div>
          <p className="text-sm text-gray-600 leading-relaxed">
            {recommendation}
          </p>
        </motion.div>

        {/* Question Details (if available from API) */}
        {resultData?.questions && resultData.questions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15 }}
            className="bg-white rounded-2xl p-5 shadow-md shadow-black/5 mb-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <History className="w-5 h-5 text-coral" />
              <h3 className="font-bold text-gray-800 text-sm">答题详情</h3>
            </div>
            <div className="space-y-4">
              {resultData.questions.map((q, idx) => (
                <div key={q.questionId} className="border-b border-gray-100 last:border-0 pb-3 last:pb-0">
                  <div className="flex items-start gap-2 mb-1">
                    <span className="text-xs font-bold text-coral bg-coral/10 rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                      {idx + 1}
                    </span>
                    <p className="text-xs text-gray-700 font-medium leading-relaxed">{q.prompt}</p>
                  </div>
                  <div className="ml-7">
                    <p className="text-xs text-gray-500 mb-1">
                      <span className="text-gray-400">回答：</span>{q.answerText}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-coral font-bold">{q.score}分</span>
                      <span className="text-xs text-gray-400">{q.feedback}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2 }}
          className="space-y-3 mt-auto pb-6"
        >
          {/* Join Group */}
          <Button
            onClick={() => toast("功能即将上线")}
            className="w-full h-14 rounded-2xl bg-coral hover:bg-coral-dark text-white text-base font-bold shadow-lg shadow-coral/30 transition-all active:scale-[0.98]"
          >
            <Users className="w-5 h-5 mr-2" />
            加入{resultData?.levelName || config.name}口语营
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>

          {/* Secondary Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="flex-1 h-12 rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium"
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              重新测评
            </Button>
            <Button
              variant="outline"
              onClick={() => toast("分享功能即将上线")}
              className="flex-1 h-12 rounded-xl border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-medium"
            >
              <Share2 className="w-4 h-4 mr-1.5" />
              分享结果
            </Button>
          </div>

          {/* Course Info */}
          <button
            onClick={() => toast("课程详情即将上线")}
            className="w-full flex items-center justify-between bg-white rounded-xl p-4 mt-2 shadow-sm"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-coral/10 flex items-center justify-center">
                <BookOpen className="w-5 h-5 text-coral" />
              </div>
              <div className="text-left">
                <p className="text-sm font-bold text-gray-800">查看课程详情</p>
                <p className="text-xs text-gray-500">了解{resultData?.levelName || config.name}口语营课程内容</p>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </motion.div>
      </div>
    </div>
  );
}

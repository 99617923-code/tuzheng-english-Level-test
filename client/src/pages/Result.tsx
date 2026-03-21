/**
 * 途正英语AI分级测评 - 结果展示页
 * 支持mock演示模式（URL含mock=true时使用预设数据）
 * 蓝绿品牌色 + 透明毛玻璃风格
 * 点击"加入X级口语营"弹出群二维码弹窗
 */
import { Button } from "@/components/ui/button";
import { useLocation, useSearch } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
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
  X,
  QrCode,
} from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";
import { getTestResult, type TestResultDetail } from "@/lib/api";
import { trpc } from "@/lib/trpc";

const LOGO_TEXT =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-transparent_4a301562.png";

// Level configurations - 蓝绿色系
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
    color: "#8a95a5",
    bgColor: "rgba(138,149,165,0.08)",
    iconBg: "rgba(138,149,165,0.12)",
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
    color: "#1B3F91",
    bgColor: "rgba(27,63,145,0.06)",
    iconBg: "rgba(27,63,145,0.10)",
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
    color: "#83BA12",
    bgColor: "rgba(131,186,18,0.06)",
    iconBg: "rgba(131,186,18,0.12)",
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
    color: "#2B5BA0",
    bgColor: "rgba(43,91,160,0.06)",
    iconBg: "rgba(43,91,160,0.12)",
    description:
      "你的英语水平很棒！词汇丰富，语法扎实，能够应对复杂的语言场景，表达流利自如。",
    recommendation:
      "推荐加入高级口语营，挑战更高难度的话题讨论和商务英语场景。",
    stars: 4,
    abilityLabel: "高级",
  },
};

// Mock演示用的群二维码图片
const MOCK_QRCODE_IMAGES: Record<number, string> = {
  0: "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/demo-qrcode-level0-FmuUuzNiKLLubHiU8j8syk.webp",
  1: "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/demo-qrcode-level1-cvy7uvqBCqRAEuNJZmRHGo.webp",
  2: "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/demo-qrcode-level2-awTpc7c7jaZU946n2r3kxG.webp",
  3: "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/demo-qrcode-level3-jyDMBnpZby7a7fNvfZyU8r.webp",
};

// Mock演示用的分项得分
const MOCK_SCORES = {
  overall: 72,
  comprehension: 78,
  grammar: 68,
  vocabulary: 70,
  pronunciation: 75,
  fluency: 65,
};

// Mock演示用的答题详情
const MOCK_QUESTION_DETAILS = [
  {
    questionId: "q1",
    text: "Can you tell me your name and where you are from?",
    transcription: "My name is Li Ming. I am from Guangzhou, China.",
    score: 85,
    feedback: "清晰的自我介绍，语法正确。",
  },
  {
    questionId: "q2",
    text: "Can you describe what you usually do on a typical weekday?",
    transcription:
      "I usually wake up at seven o'clock. Then I have breakfast and go to work.",
    score: 78,
    feedback: "日常描述流畅，时态运用基本正确。",
  },
  {
    questionId: "q3",
    text: "You're at a restaurant and the waiter brought you the wrong dish. How would you handle this?",
    transcription:
      "Excuse me, I think there might be a mistake with my order. I ordered the chicken salad.",
    score: 82,
    feedback: "情景应对得体，使用了礼貌用语。",
  },
  {
    questionId: "q4",
    text: "What do you think about the impact of social media on young people today?",
    transcription:
      "I think social media has both positive and negative effects on young people.",
    score: 70,
    feedback: "能表达观点，但论证可以更深入。",
  },
  {
    questionId: "q5",
    text: "Do you agree that AI will eventually replace most human jobs?",
    transcription:
      "I partially agree. While AI is transforming many industries, I believe it will create new types of jobs.",
    score: 65,
    feedback: "观点有深度，但高级词汇运用可加强。",
  },
  {
    questionId: "q6",
    text: "If you could change one thing about the education system, what would it be?",
    transcription:
      "I would reform the examination-oriented approach to focus more on practical skills.",
    score: 60,
    feedback: "论述结构清晰，但表达流利度有提升空间。",
  },
];

/** 群二维码弹窗组件 - 支持mock模式 */
function QrcodeModal({
  open,
  onClose,
  level,
  levelName,
  isMock,
}: {
  open: boolean;
  onClose: () => void;
  level: number;
  levelName: string;
  isMock: boolean;
}) {
  // 非mock模式才调用tRPC
  const { data: qrcodeData, isLoading } = trpc.qrcode.getByLevel.useQuery(
    { level },
    { enabled: open && !isMock }
  );

  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];

  // mock模式直接用预设图片
  const qrcodeUrl = isMock
    ? MOCK_QRCODE_IMAGES[level] || MOCK_QRCODE_IMAGES[2]
    : qrcodeData?.qrcodeUrl;
  const groupName = isMock
    ? `途正英语${config.name}口语营`
    : qrcodeData?.groupName;
  const showLoading = !isMock && isLoading;
  const hasQrcode = isMock || !!qrcodeUrl;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto"
          >
            <div
              className="rounded-3xl overflow-hidden"
              style={{
                backgroundColor: "rgba(255,255,255,0.95)",
                boxShadow: "0 20px 60px rgba(27,63,145,0.25)",
                border: "1px solid rgba(255,255,255,0.5)",
              }}
            >
              {/* Header */}
              <div
                className="relative px-5 pt-5 pb-4 text-center"
                style={{
                  background: `linear-gradient(135deg, ${config.color}15 0%, ${config.color}08 100%)`,
                }}
              >
                <button
                  onClick={onClose}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
                  style={{ backgroundColor: "rgba(0,0,0,0.06)" }}
                >
                  <X className="w-4 h-4" style={{ color: "#5a6a7a" }} />
                </button>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                  style={{ backgroundColor: `${config.color}15` }}
                >
                  <Users
                    className="w-6 h-6"
                    style={{ color: config.color }}
                  />
                </div>
                <h3
                  className="text-lg font-bold mb-1"
                  style={{ color: "#1a2340" }}
                >
                  加入{levelName}口语营
                </h3>
                <p className="text-xs" style={{ color: "#7a8a9a" }}>
                  长按识别二维码，加入对应等级的口语训练营
                </p>
              </div>

              {/* QR Code */}
              <div className="px-5 py-6">
                {showLoading ? (
                  <div className="flex flex-col items-center justify-center py-8">
                    <Loader2
                      className="w-8 h-8 animate-spin mb-3"
                      style={{ color: "#1B3F91" }}
                    />
                    <p className="text-xs" style={{ color: "#7a8a9a" }}>
                      加载中...
                    </p>
                  </div>
                ) : hasQrcode ? (
                  <div className="flex flex-col items-center">
                    <div
                      className="w-56 h-56 rounded-2xl overflow-hidden mb-4"
                      style={{
                        border: "2px solid rgba(27,63,145,0.08)",
                        backgroundColor: "#fff",
                        boxShadow: "0 4px 16px rgba(27,63,145,0.06)",
                      }}
                    >
                      <img
                        src={qrcodeUrl!}
                        alt={`${levelName}口语营群二维码`}
                        className="w-full h-full object-contain p-2"
                      />
                    </div>
                    {groupName && (
                      <p
                        className="text-sm font-medium mb-1"
                        style={{ color: "#3a4a5a" }}
                      >
                        {groupName}
                      </p>
                    )}
                    <p className="text-xs" style={{ color: "#adb5bd" }}>
                      请使用微信扫一扫或长按识别
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-6">
                    <div
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-3"
                      style={{ backgroundColor: "rgba(27,63,145,0.06)" }}
                    >
                      <QrCode
                        className="w-8 h-8"
                        style={{ color: "#adb5bd" }}
                      />
                    </div>
                    <p
                      className="text-sm font-medium mb-1"
                      style={{ color: "#5a6a7a" }}
                    >
                      暂未配置群二维码
                    </p>
                    <p className="text-xs" style={{ color: "#adb5bd" }}>
                      请联系管理员添加{levelName}口语营群二维码
                    </p>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="px-5 pb-5">
                <Button
                  onClick={onClose}
                  className="w-full h-11 rounded-xl text-white text-sm font-medium"
                  style={{
                    background: `linear-gradient(135deg, ${config.color} 0%, ${config.color}cc 100%)`,
                  }}
                >
                  我知道了
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default function Result() {
  const [, navigate] = useLocation();
  const searchStr = useSearch();
  const params = new URLSearchParams(searchStr);
  const sessionId = params.get("sessionId");
  const levelFromUrl = parseInt(params.get("level") || "1");
  const questionsFromUrl = parseInt(params.get("questions") || "6");
  const isMock = params.get("mock") === "true";

  const [resultData, setResultData] = useState<TestResultDetail | null>(null);
  const [loading, setLoading] = useState(!isMock && !!sessionId);
  const [showQrcode, setShowQrcode] = useState(false);

  useEffect(() => {
    if (isMock || !sessionId) return;
    const fetchResult = async () => {
      try {
        const data = await getTestResult(sessionId);
        setResultData(data);
      } catch {
        toast.error("获取详细结果失败，显示基本信息");
      } finally {
        setLoading(false);
      }
    };
    fetchResult();
  }, [sessionId, isMock]);

  const level = isMock ? levelFromUrl : (resultData?.finalLevel ?? levelFromUrl);
  const questions = isMock
    ? questionsFromUrl
    : (resultData?.questionCount ?? questionsFromUrl);
  const config = LEVEL_CONFIG[level] || LEVEL_CONFIG[1];
  const description = isMock
    ? config.description
    : (resultData?.recommendation || config.description);
  const recommendation = config.recommendation;
  const scores = isMock ? MOCK_SCORES : resultData?.scores;
  const levelName = isMock
    ? config.name
    : (resultData?.levelName || config.name);
  const questionDetails = isMock
    ? MOCK_QUESTION_DETAILS
    : resultData?.questionDetails;

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)",
        }}
      >
        <div className="text-center">
          <Loader2
            className="w-10 h-10 animate-spin mx-auto mb-3"
            style={{ color: "#1B3F91" }}
          />
          <p className="text-sm font-medium" style={{ color: "#7a8a9a" }}>
            正在生成测评报告...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)",
      }}
    >
      {/* 顶部渐变装饰 */}
      <div
        className="absolute top-0 left-0 right-0 h-64"
        style={{
          background:
            "linear-gradient(180deg, rgba(27,63,145,0.08) 0%, transparent 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 min-h-screen flex flex-col px-6 py-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-4"
        >
          <img
            src={LOGO_TEXT}
            alt="途正英语"
            className="h-6 object-contain"
          />
          <span
            className="text-sm font-bold"
            style={{ color: "#3a4a5a" }}
          >
            测评报告
          </span>
          <div className="w-8" />
        </motion.div>

        {/* Result Card - 毛玻璃 */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="backdrop-blur-xl rounded-3xl p-6 mb-5"
          style={{
            backgroundColor: "rgba(255,255,255,0.70)",
            boxShadow: "0 8px 32px rgba(27,63,145,0.10)",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        >
          {/* Award Icon */}
          <div className="flex justify-center mb-4">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, delay: 0.5 }}
              className="w-20 h-20 rounded-full flex items-center justify-center"
              style={{ backgroundColor: config.iconBg }}
            >
              <Award
                className="w-10 h-10"
                style={{ color: config.color }}
              />
            </motion.div>
          </div>

          {/* Level Display */}
          <div className="text-center mb-5">
            <motion.h1
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-3xl font-extrabold mb-1"
              style={{ color: "#1a2340" }}
            >
              {levelName}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-sm font-bold"
              style={{ color: config.color }}
            >
              {isMock ? config.label : (resultData?.levelLabel || config.label)}
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
              <p
                className="text-2xl font-extrabold"
                style={{ color: "#1a2340" }}
              >
                {questions}
              </p>
              <p
                className="text-xs font-medium"
                style={{ color: "#7a8a9a" }}
              >
                测评题数
              </p>
            </div>
            <div
              className="w-px"
              style={{ backgroundColor: "rgba(27,63,145,0.1)" }}
            />
            <div className="text-center">
              <p
                className="text-2xl font-extrabold"
                style={{ color: config.color }}
              >
                {config.abilityLabel}
              </p>
              <p
                className="text-xs font-medium"
                style={{ color: "#7a8a9a" }}
              >
                能力评级
              </p>
            </div>
            {isMock ? (
              <>
                <div
                  className="w-px"
                  style={{ backgroundColor: "rgba(27,63,145,0.1)" }}
                />
                <div className="text-center">
                  <p
                    className="text-2xl font-extrabold"
                    style={{ color: "#1a2340" }}
                  >
                    4
                  </p>
                  <p
                    className="text-xs font-medium"
                    style={{ color: "#7a8a9a" }}
                  >
                    用时(分钟)
                  </p>
                </div>
              </>
            ) : (
              resultData?.totalDuration && (
                <>
                  <div
                    className="w-px"
                    style={{
                      backgroundColor: "rgba(27,63,145,0.1)",
                    }}
                  />
                  <div className="text-center">
                    <p
                      className="text-2xl font-extrabold"
                      style={{ color: "#1a2340" }}
                    >
                      {Math.round(resultData.totalDuration / 60)}
                    </p>
                    <p
                      className="text-xs font-medium"
                      style={{ color: "#7a8a9a" }}
                    >
                      用时(分钟)
                    </p>
                  </div>
                </>
              )
            )}
          </motion.div>

          {/* Description */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="text-sm leading-relaxed text-center"
            style={{ color: "#5a6a7a" }}
          >
            {description}
          </motion.p>

          {/* 加入口语营按钮 - 红色醒目，紧跟结果卡片内 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05 }}
            className="mt-5"
          >
            <Button
              onClick={() => setShowQrcode(true)}
              className="w-full h-14 rounded-2xl text-white text-base font-bold shadow-lg transition-all active:scale-[0.98]"
              style={{
                background:
                  "linear-gradient(135deg, #E53935 0%, #C62828 100%)",
                boxShadow: "0 6px 20px rgba(229,57,53,0.35)",
              }}
            >
              <Users className="w-5 h-5 mr-2" />
              加入{levelName}口语营
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </motion.div>
        </motion.div>

        {/* Detailed Scores Card */}
        {scores && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.05 }}
            className="backdrop-blur-md rounded-2xl p-5 mb-5"
            style={{
              backgroundColor: "rgba(255,255,255,0.60)",
              boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
              border: "1px solid rgba(255,255,255,0.4)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp
                className="w-5 h-5"
                style={{ color: "#1B3F91" }}
              />
              <h3
                className="font-bold text-sm"
                style={{ color: "#1a2340" }}
              >
                分项得分
              </h3>
            </div>
            <div className="space-y-3">
              {[
                {
                  label: "综合得分",
                  value: scores.overall,
                  color: "#1B3F91",
                },
                {
                  label: "听力理解",
                  value: scores.comprehension,
                  color: "#2B5BA0",
                },
                {
                  label: "语法运用",
                  value: scores.grammar,
                  color: "#83BA12",
                },
                {
                  label: "词汇量",
                  value: scores.vocabulary,
                  color: "#6a9a10",
                },
                {
                  label: "发音",
                  value: scores.pronunciation,
                  color: "#4a7ab0",
                },
                {
                  label: "流利度",
                  value: scores.fluency,
                  color: "#5a9a30",
                },
              ].map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span
                    className="text-xs w-16 shrink-0"
                    style={{ color: "#5a6a7a" }}
                  >
                    {item.label}
                  </span>
                  <div
                    className="flex-1 h-2 rounded-full overflow-hidden"
                    style={{
                      backgroundColor: "rgba(27,63,145,0.06)",
                    }}
                  >
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${item.value}%` }}
                      transition={{ duration: 0.8, delay: 1.2 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: item.color }}
                    />
                  </div>
                  <span
                    className="text-xs font-bold w-8 text-right"
                    style={{ color: "#3a4a5a" }}
                  >
                    {item.value}
                  </span>
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
          className="backdrop-blur-md rounded-2xl p-5 mb-5"
          style={{
            backgroundColor: "rgba(255,255,255,0.60)",
            boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
            border: "1px solid rgba(255,255,255,0.4)",
          }}
        >
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp
              className="w-5 h-5"
              style={{ color: "#83BA12" }}
            />
            <h3
              className="font-bold text-sm"
              style={{ color: "#1a2340" }}
            >
              学习建议
            </h3>
          </div>
          <p
            className="text-sm leading-relaxed"
            style={{ color: "#5a6a7a" }}
          >
            {recommendation}
          </p>
        </motion.div>

        {/* Question Details */}
        {questionDetails && questionDetails.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1.15 }}
            className="backdrop-blur-md rounded-2xl p-5 mb-5"
            style={{
              backgroundColor: "rgba(255,255,255,0.60)",
              boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
              border: "1px solid rgba(255,255,255,0.4)",
            }}
          >
            <div className="flex items-center gap-2 mb-4">
              <History
                className="w-5 h-5"
                style={{ color: "#1B3F91" }}
              />
              <h3
                className="font-bold text-sm"
                style={{ color: "#1a2340" }}
              >
                答题详情
              </h3>
            </div>
            <div className="space-y-4">
              {questionDetails.map(
                (
                  q: {
                    questionId: string;
                    text?: string;
                    transcription?: string;
                    score?: number;
                    feedback?: string;
                  },
                  idx: number
                ) => (
                  <div
                    key={q.questionId}
                    className="border-b pb-3 last:border-0 last:pb-0"
                    style={{ borderColor: "rgba(27,63,145,0.06)" }}
                  >
                    <div className="flex items-start gap-2 mb-1">
                      <span
                        className="text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5 text-white"
                        style={{ backgroundColor: "#1B3F91" }}
                      >
                        {idx + 1}
                      </span>
                      <p
                        className="text-xs font-medium leading-relaxed"
                        style={{ color: "#3a4a5a" }}
                      >
                        {q.text}
                      </p>
                    </div>
                    <div className="ml-7">
                      <p
                        className="text-xs mb-1"
                        style={{ color: "#7a8a9a" }}
                      >
                        <span style={{ color: "#adb5bd" }}>回答：</span>
                        {q.transcription}
                      </p>
                      <div className="flex items-center gap-2">
                        <span
                          className="text-xs font-bold"
                          style={{ color: "#1B3F91" }}
                        >
                          {q.score}分
                        </span>
                        <span
                          className="text-xs"
                          style={{ color: "#8a95a5" }}
                        >
                          {q.feedback}
                        </span>
                      </div>
                    </div>
                  </div>
                )
              )}
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
          {/* Secondary Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => navigate("/")}
              className="flex-1 h-12 rounded-xl font-medium backdrop-blur-md"
              style={{
                backgroundColor: "rgba(255,255,255,0.6)",
                borderColor: "rgba(27,63,145,0.15)",
                color: "#3a4a5a",
              }}
            >
              <RotateCcw className="w-4 h-4 mr-1.5" />
              重新测评
            </Button>
            <Button
              variant="outline"
              onClick={() => toast("分享功能即将上线")}
              className="flex-1 h-12 rounded-xl font-medium backdrop-blur-md"
              style={{
                backgroundColor: "rgba(255,255,255,0.6)",
                borderColor: "rgba(27,63,145,0.15)",
                color: "#3a4a5a",
              }}
            >
              <Share2 className="w-4 h-4 mr-1.5" />
              分享结果
            </Button>
          </div>

          {/* Course Info */}
          <button
            onClick={() => toast("课程详情即将上线")}
            className="w-full flex items-center justify-between backdrop-blur-md rounded-xl p-4 mt-2 transition-all hover:shadow-md"
            style={{
              backgroundColor: "rgba(255,255,255,0.55)",
              boxShadow: "0 2px 12px rgba(27,63,145,0.05)",
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: "rgba(131,186,18,0.10)" }}
              >
                <BookOpen
                  className="w-5 h-5"
                  style={{ color: "#6a9a10" }}
                />
              </div>
              <div className="text-left">
                <p
                  className="text-sm font-bold"
                  style={{ color: "#1a2340" }}
                >
                  查看课程详情
                </p>
                <p className="text-xs" style={{ color: "#7a8a9a" }}>
                  了解{levelName}口语营课程内容
                </p>
              </div>
            </div>
            <ChevronRight
              className="w-4 h-4"
              style={{ color: "#adb5bd" }}
            />
          </button>
        </motion.div>
      </div>

      {/* 群二维码弹窗 */}
      <QrcodeModal
        open={showQrcode}
        onClose={() => setShowQrcode(false)}
        level={level}
        levelName={levelName}
        isMock={isMock}
      />
    </div>
  );
}

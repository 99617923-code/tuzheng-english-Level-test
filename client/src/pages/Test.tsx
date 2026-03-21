/**
 * 途正英语AI分级测评 - Mock演示版（客户反馈优化版）
 * 
 * 核心改动：
 * 1. 去掉英文文字显示（只显示语音条，不显示文字）
 * 2. 去掉文字输入模式（只保留语音录音）
 * 3. 去掉AI反馈（答对答错提示），用户回答后直接出下一题
 * 4. 去掉出题策略提示卡片
 * 5. 出题逻辑从低到高（所有用户从零级开始逐步升级）
 * 6. 微信风格语音录音交互 + 底部输入区固定
 * 7. 预留真人音频替换接口
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic,
  Volume2,
  Loader2,
  ChevronLeft,
  AlertCircle,
  Play,
  Pause,
  X,
  ChevronUp,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

const AI_AVATAR =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp";

type MessageRole = "ai" | "user" | "system";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string; // 内部保留文字用于TTS，但不显示给用户
  timestamp: number;
  audioDuration?: number;
  /** 预录音频URL（后续替换TTS用） */
  audioUrl?: string;
}

// ========== Mock题目数据（从低到高） ==========
interface MockQuestion {
  questionId: string;
  text: string; // AI朗读的英文（不显示给用户）
  level: number; // 0=零级(小学), 1=一级(初中), 2=二级(高中), 3=三级(高中以上)
  levelLabel: string;
  mockAudioDuration: number;
  /** 预录音频URL，后续由真人录制替换 */
  audioUrl?: string;
}

// 从低到高的题目序列
const MOCK_QUESTIONS: MockQuestion[] = [
  // Level 0 - 零级（小学水平）
  {
    questionId: "q1",
    text: "Hello! Can you tell me your name? What is your name?",
    level: 0,
    levelLabel: "小学",
    mockAudioDuration: 5,
  },
  {
    questionId: "q2",
    text: "How old are you? And where do you live?",
    level: 0,
    levelLabel: "小学",
    mockAudioDuration: 4,
  },
  // Level 1 - 一级（初中水平）
  {
    questionId: "q3",
    text: "What do you usually do after school? Can you describe your daily routine?",
    level: 1,
    levelLabel: "初中",
    mockAudioDuration: 7,
  },
  {
    questionId: "q4",
    text: "Tell me about your favorite hobby. Why do you like it?",
    level: 1,
    levelLabel: "初中",
    mockAudioDuration: 6,
  },
  // Level 2 - 二级（高中水平）
  {
    questionId: "q5",
    text: "Imagine you are at a restaurant and the waiter brought you the wrong dish. How would you handle this situation?",
    level: 2,
    levelLabel: "高中",
    mockAudioDuration: 9,
  },
  {
    questionId: "q6",
    text: "What do you think about the impact of social media on young people today? Can you share your opinion?",
    level: 2,
    levelLabel: "高中",
    mockAudioDuration: 9,
  },
  // Level 3 - 三级（高中以上水平）
  {
    questionId: "q7",
    text: "Some people believe that artificial intelligence will eventually replace most human jobs. Do you agree or disagree? Please explain your reasoning.",
    level: 3,
    levelLabel: "大学",
    mockAudioDuration: 12,
  },
  {
    questionId: "q8",
    text: "If you could change one thing about the education system in your country, what would it be and why? Please provide a detailed explanation.",
    level: 3,
    levelLabel: "大学",
    mockAudioDuration: 12,
  },
];

// ========== 语音条组件（只显示语音条，不显示文字） ==========
function AudioBar({
  duration,
  isAi,
  text,
  audioUrl,
}: {
  duration: number;
  isAi: boolean;
  text: string;
  audioUrl?: string;
  onPlay?: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlay = () => {
    if (isPlaying) {
      // 停止播放
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
      setIsPlaying(false);
      setProgress(0);
      return;
    }

    setIsPlaying(true);
    setProgress(0);

    const onEnd = () => {
      setIsPlaying(false);
      setProgress(100);
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeout(() => setProgress(0), 500);
    };

    const onError = () => {
      setIsPlaying(false);
      setProgress(0);
      if (timerRef.current) clearInterval(timerRef.current);
    };

    // 优先使用预录音频
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = onEnd;
      audio.onerror = onError;
      audio.play().catch(onError);
    } else if ("speechSynthesis" in window && text) {
      // 降级使用浏览器TTS
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const englishVoice =
        voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            v.name.toLowerCase().includes("female")
        ) || voices.find((v) => v.lang.startsWith("en"));
      if (englishVoice) utterance.voice = englishVoice;
      utterance.onend = onEnd;
      utterance.onerror = onError;
      window.speechSynthesis.speak(utterance);
    }

    // 进度条动画
    const startTime = Date.now();
    const totalMs = duration * 1000;
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min(100, (elapsed / totalMs) * 100);
      setProgress(pct);
      if (pct >= 100) {
        if (timerRef.current) clearInterval(timerRef.current);
      }
    }, 50);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      window.speechSynthesis?.cancel();
    };
  }, []);

  const barWidth = Math.min(260, Math.max(120, duration * 12 + 80));
  const waveCount = Math.min(30, Math.max(8, Math.floor(duration * 1.5)));

  return (
    <button
      onClick={handlePlay}
      className="flex items-center gap-2 rounded-2xl px-3 py-2.5 transition-all active:scale-[0.98]"
      style={{
        width: barWidth,
        background: isAi
          ? "linear-gradient(135deg, #f0f4f8, #e8eef8)"
          : "linear-gradient(135deg, #1B3F91, #2B5BA0)",
      }}
    >
      <div
        className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
        style={{
          background: isAi
            ? "linear-gradient(135deg, #1B3F91, #2B5BA0)"
            : "rgba(255,255,255,0.25)",
        }}
      >
        {isPlaying ? (
          <Pause className="w-3.5 h-3.5 text-white" />
        ) : (
          <Play className="w-3.5 h-3.5 ml-0.5 text-white" />
        )}
      </div>

      <div className="flex items-center gap-[2px] flex-1 h-5 overflow-hidden">
        {Array.from({ length: waveCount }).map((_, i) => {
          const heights = [3, 8, 5, 12, 7, 15, 9, 6, 13, 4, 10, 7, 14, 5, 11, 8, 6, 13, 9, 4, 12, 7, 10, 5, 14, 8, 6, 11, 9, 7];
          const h = heights[i % heights.length];
          const isActive = (i / waveCount) * 100 <= progress;
          return (
            <motion.div
              key={i}
              className="rounded-full transition-colors duration-150"
              style={{
                width: 2,
                height: h,
                backgroundColor: isAi
                  ? isActive ? "#1B3F91" : "rgba(27,63,145,0.25)"
                  : isActive ? "#fff" : "rgba(255,255,255,0.35)",
              }}
              animate={isPlaying ? { height: [h, h * 0.4 + Math.random() * h * 0.8, h] } : {}}
              transition={isPlaying ? { duration: 0.3 + Math.random() * 0.2, repeat: Infinity, delay: i * 0.03 } : {}}
            />
          );
        })}
      </div>

      <span
        className="text-xs font-medium shrink-0 tabular-nums"
        style={{ color: isAi ? "#5a6a7a" : "rgba(255,255,255,0.8)" }}
      >
        {duration}"
      </span>
    </button>
  );
}

// ========== 微信风格录音遮罩组件 ==========
function WechatRecordingOverlay({
  isRecording,
  recordingTime,
  isCancelZone,
}: {
  isRecording: boolean;
  recordingTime: number;
  isCancelZone: boolean;
}) {
  return (
    <AnimatePresence>
      {isRecording && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-40 flex flex-col items-center justify-center"
          style={{
            background: isCancelZone
              ? "rgba(180, 30, 30, 0.85)"
              : "rgba(0, 0, 0, 0.70)",
            backdropFilter: "blur(8px)",
          }}
        >
          <div className="flex flex-col items-center gap-6">
            {/* 麦克风图标 + 脉冲动画 */}
            <div className="relative">
              {!isCancelZone && (
                <>
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: "rgba(131,186,18,0.15)" }}
                    animate={{ scale: [1, 2.2, 1], opacity: [0.5, 0, 0.5] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  />
                  <motion.div
                    className="absolute inset-0 rounded-full"
                    style={{ backgroundColor: "rgba(131,186,18,0.10)" }}
                    animate={{ scale: [1, 2.8, 1], opacity: [0.3, 0, 0.3] }}
                    transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
                  />
                </>
              )}
              <motion.div
                className="relative w-20 h-20 rounded-full flex items-center justify-center"
                style={{
                  background: isCancelZone
                    ? "linear-gradient(135deg, #ef4444, #dc2626)"
                    : "linear-gradient(135deg, #83BA12, #6a9a10)",
                  boxShadow: isCancelZone
                    ? "0 0 40px rgba(239,68,68,0.4)"
                    : "0 0 40px rgba(131,186,18,0.3)",
                }}
                animate={isCancelZone ? { scale: [1, 0.9, 1] } : {}}
                transition={{ duration: 0.3 }}
              >
                {isCancelZone ? (
                  <X className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </motion.div>
            </div>

            {/* 声波可视化 */}
            {!isCancelZone && (
              <div className="flex items-center gap-[3px] h-8">
                {Array.from({ length: 20 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-[3px] rounded-full bg-white/60"
                    animate={{
                      height: [4, 8 + Math.random() * 24, 4],
                    }}
                    transition={{
                      duration: 0.3 + Math.random() * 0.3,
                      repeat: Infinity,
                      delay: i * 0.05,
                    }}
                  />
                ))}
              </div>
            )}

            {/* 录音时长 */}
            <motion.div
              className="flex items-center gap-2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
            >
              <div
                className="w-2.5 h-2.5 rounded-full animate-pulse"
                style={{
                  backgroundColor: isCancelZone ? "#ef4444" : "#83BA12",
                }}
              />
              <span className="text-white text-lg font-semibold tabular-nums">
                {Math.floor(recordingTime / 60)
                  .toString()
                  .padStart(2, "0")}
                :{(recordingTime % 60).toString().padStart(2, "0")}
              </span>
            </motion.div>

            {/* 提示文字 */}
            <motion.div
              className="flex flex-col items-center gap-1"
              animate={isCancelZone ? { scale: [1, 1.05, 1] } : {}}
              transition={{ duration: 0.5, repeat: Infinity }}
            >
              {isCancelZone ? (
                <p className="text-red-400 text-sm font-medium">
                  松开手指，取消发送
                </p>
              ) : (
                <>
                  <div className="flex items-center gap-1 text-white/70">
                    <ChevronUp className="w-4 h-4" />
                    <p className="text-sm">上滑取消</p>
                  </div>
                  <p className="text-white/50 text-xs">松开发送</p>
                </>
              )}
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ========== 主组件 ==========
export default function Test() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(-1);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isCancelZone, setIsCancelZone] = useState(false);
  /** 记录用户在每个level的最高题目index，用于判断最终等级 */
  const [highestLevel, setHighestLevel] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const cancelledRef = useRef<boolean>(false);

  const totalQuestions = MOCK_QUESTIONS.length;
  const questionNumber = currentQuestionIndex + 1;

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const addMessage = useCallback(
    (
      role: MessageRole,
      text: string,
      extra?: { audioDuration?: number; audioUrl?: string }
    ) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          role,
          text,
          audioDuration: extra?.audioDuration,
          audioUrl: extra?.audioUrl,
          timestamp: Date.now(),
        },
      ]);
    },
    []
  );

  const speakText = (text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!("speechSynthesis" in window)) {
        setTimeout(resolve, 2000);
        return;
      }
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      const voices = window.speechSynthesis.getVoices();
      const englishVoice =
        voices.find(
          (v) =>
            v.lang.startsWith("en") &&
            v.name.toLowerCase().includes("female")
        ) || voices.find((v) => v.lang.startsWith("en"));
      if (englishVoice) utterance.voice = englishVoice;
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      window.speechSynthesis.speak(utterance);
    });
  };

  // ========== 初始化 ==========
  useEffect(() => {
    const initTest = async () => {
      // 欢迎语（只有语音条，不显示文字）
      const welcomeText = "Hello! Welcome to TuZheng English Level Assessment. I'm going to ask you some questions. Just relax and do your best. Let's begin!";
      addMessage("ai", welcomeText, { audioDuration: 8 });
      setIsAiSpeaking(true);
      await speakText(welcomeText);
      setIsAiSpeaking(false);

      await delay(800);

      // 系统提示：进入第一题
      addMessage("system", "第 1 题");

      await delay(500);

      // 出第一题
      setCurrentQuestionIndex(0);
      const q = MOCK_QUESTIONS[0];
      addMessage("ai", q.text, {
        audioDuration: q.mockAudioDuration,
        audioUrl: q.audioUrl,
      });
      setIsAiSpeaking(true);
      await speakText(q.text);
      setIsAiSpeaking(false);
    };

    initTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ========== 处理用户回答（mock - 不给反馈，直接下一题） ==========
  const processAnswer = async () => {
    if (currentQuestionIndex < 0 || currentQuestionIndex >= MOCK_QUESTIONS.length) return;

    const q = MOCK_QUESTIONS[currentQuestionIndex];

    // 用户回答显示为语音条（不显示文字内容）
    const answerDuration = Math.max(3, Math.ceil(recordingTime || 5));
    addMessage("user", "(用户语音回答)", { audioDuration: answerDuration });

    // 更新最高等级
    setHighestLevel((prev) => Math.max(prev, q.level));

    setIsProcessing(true);

    // 短暂停顿后直接出下一题（不给反馈）
    await delay(800);

    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex >= MOCK_QUESTIONS.length) {
      // 所有题目做完
      setIsFinished(true);
      
      const finishText = "Great! Your assessment is now complete. Let me prepare your result.";
      addMessage("ai", finishText, { audioDuration: 5 });
      setIsAiSpeaking(true);
      await speakText(finishText);
      setIsAiSpeaking(false);

      // 根据最高到达的等级确定结果
      const finalLevel = Math.max(highestLevel, q.level);
      const levelConfig: Record<number, { name: string; label: string }> = {
        0: { name: "零级", label: "零基础 / 小学水平" },
        1: { name: "一级", label: "初中水平" },
        2: { name: "二级", label: "高中水平" },
        3: { name: "三级", label: "高中以上水平" },
      };
      const cfg = levelConfig[finalLevel] || levelConfig[0];

      setTimeout(() => {
        navigate(
          `/result?sessionId=mock-demo&level=${finalLevel}&name=${encodeURIComponent(
            cfg.name
          )}&label=${encodeURIComponent(
            cfg.label
          )}&questions=${totalQuestions}&mock=true`
        );
      }, 2000);
    } else {
      // 出下一题
      addMessage("system", `第 ${nextIndex + 1} 题`);
      await delay(500);

      setCurrentQuestionIndex(nextIndex);
      const nextQ = MOCK_QUESTIONS[nextIndex];
      addMessage("ai", nextQ.text, {
        audioDuration: nextQ.mockAudioDuration,
        audioUrl: nextQ.audioUrl,
      });
      setIsAiSpeaking(true);
      await speakText(nextQ.text);
      setIsAiSpeaking(false);
    }

    setIsProcessing(false);
  };

  // ========== 微信风格语音录音 ==========
  const startRecording = useCallback(async () => {
    if (isAiSpeaking || isProcessing || isFinished) return;

    cancelledRef.current = false;
    setIsCancelZone(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      startTimeRef.current = Date.now();

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (!cancelledRef.current) {
          processAnswer();
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch {
      toast.error("无法访问麦克风，请检查权限设置");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAiSpeaking, isProcessing, isFinished, currentQuestionIndex]);

  const stopRecording = useCallback((cancelled?: boolean) => {
    if (cancelled) {
      cancelledRef.current = true;
    }
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      setIsCancelZone(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (cancelled) {
        toast("已取消录音", { icon: "🚫" });
      }
    }
  }, []);

  // 触摸事件处理（微信风格上滑取消）
  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      touchStartYRef.current = e.touches[0].clientY;
      startRecording();
    },
    [startRecording]
  );

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    const deltaY = touchStartYRef.current - e.touches[0].clientY;
    setIsCancelZone(deltaY > 80);
  }, []);

  // 全局mouseUp/touchEnd监听
  useEffect(() => {
    if (!isRecording) return;

    const handleGlobalMouseUp = () => {
      stopRecording(isCancelZone);
    };
    const handleGlobalTouchEnd = (e: TouchEvent) => {
      e.preventDefault();
      stopRecording(isCancelZone);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    window.addEventListener('touchend', handleGlobalTouchEnd, { passive: false });

    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
      window.removeEventListener('touchend', handleGlobalTouchEnd);
    };
  }, [isRecording, isCancelZone, stopRecording]);

  const handleCantUnderstand = async () => {
    if (isProcessing || isFinished) return;
    // "听不懂"也算一次回答，直接进入下一题
    await processAnswer();
  };

  const handleQuit = () => {
    window.speechSynthesis?.cancel();
    navigate("/");
  };

  const progress = Math.min(
    100,
    (Math.max(1, questionNumber) / totalQuestions) * 100
  );
  const isDisabled = isAiSpeaking || isProcessing || isFinished;

  return (
    <div
      className="h-screen flex flex-col overflow-hidden"
      style={{
        background:
          "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)",
      }}
    >
      {/* ===== Fixed Header ===== */}
      <div className="bg-white/80 backdrop-blur-md border-b border-border/50 px-4 py-3 z-20 shrink-0">
        <div className="flex items-center justify-between">
          <button
            onClick={handleQuit}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1 text-center">
            <h2 className="font-bold text-sm text-foreground">AI 英语测评</h2>
            <p className="text-xs text-warm-gray">
              第 {Math.max(1, questionNumber)}/{totalQuestions} 题
            </p>
          </div>
          <div className="w-9" />
        </div>
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{
              background: "linear-gradient(90deg, #1B3F91, #83BA12)",
            }}
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* ===== Scrollable Chat Area ===== */}
      <div
        ref={chatContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-4"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <style>{`
          .chat-scroll::-webkit-scrollbar { display: none; }
        `}</style>
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              {msg.role === "ai" ? (
                <AiBubble
                  audioDuration={msg.audioDuration}
                  text={msg.text}
                  audioUrl={msg.audioUrl}
                />
              ) : msg.role === "user" ? (
                <UserBubble audioDuration={msg.audioDuration} />
              ) : (
                <SystemBubble text={msg.text} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* AI处理中指示器 */}
        {isProcessing && !isFinished && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2.5"
          >
            <img
              src={AI_AVATAR}
              alt=""
              className="w-9 h-9 rounded-full shrink-0 border-2 border-white shadow-sm"
            />
            <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                {[0, 150, 300].map((d) => (
                  <span
                    key={d}
                    className="w-2 h-2 rounded-full animate-bounce"
                    style={{
                      animationDelay: `${d}ms`,
                      backgroundColor: "rgba(27,63,145,0.4)",
                    }}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* ===== Fixed Bottom Controls ===== */}
      <div className="bg-white/95 backdrop-blur-md border-t border-border/50 px-4 py-3 pb-[max(env(safe-area-inset-bottom),16px)] z-20 shrink-0">
        {isFinished ? (
          <div className="text-center py-2">
            <div
              className="flex items-center justify-center gap-2"
              style={{ color: "#6a9a10" }}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">
                正在生成测评报告...
              </span>
            </div>
          </div>
        ) : isProcessing ? (
          <div className="text-center py-2">
            <div
              className="flex items-center justify-center gap-2"
              style={{ color: "#1B3F91" }}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">
                正在准备下一题...
              </span>
            </div>
          </div>
        ) : (
          /* ========== 语音录音模式（微信风格）- 唯一输入方式 ========== */
          <div className="flex flex-col items-center gap-2">
            {/* AI说话状态提示 */}
            {isAiSpeaking && !isRecording && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 rounded-full px-4 py-1.5"
                style={{ backgroundColor: "rgba(131,186,18,0.10)" }}
              >
                <Volume2 className="w-4 h-4" style={{ color: "#6a9a10" }} />
                <span
                  className="text-sm font-medium"
                  style={{ color: "#6a9a10" }}
                >
                  请仔细听题...
                </span>
              </motion.div>
            )}

            {/* 按住说话按钮区 */}
            <div className="flex items-center gap-3 w-full">
              {/* 左侧占位 */}
              <div className="w-10 h-10 shrink-0" />

              {/* 微信风格按住说话按钮 */}
              <button
                onMouseDown={() => startRecording()}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchCancel={(e) => {
                  e.preventDefault();
                  stopRecording(true);
                }}
                disabled={isDisabled}
                className={`flex-1 h-12 rounded-full flex items-center justify-center gap-2 font-medium text-sm transition-all select-none ${
                  isRecording
                    ? "scale-[0.97]"
                    : isDisabled
                    ? "opacity-50 cursor-not-allowed"
                    : "active:scale-[0.97]"
                }`}
                style={{
                  background: isRecording
                    ? "linear-gradient(135deg, rgba(131,186,18,0.15), rgba(27,63,145,0.10))"
                    : "linear-gradient(135deg, rgba(27,63,145,0.06), rgba(131,186,18,0.06))",
                  border: isRecording
                    ? "1.5px solid rgba(131,186,18,0.4)"
                    : "1.5px solid rgba(27,63,145,0.12)",
                  color: isRecording ? "#6a9a10" : "#5a6a7a",
                }}
              >
                <Mic className="w-4.5 h-4.5" />
                {isRecording ? "松开 发送" : "按住 说话"}
              </button>

              {/* 听不懂按钮 */}
              {!isRecording && !isDisabled && questionNumber > 0 ? (
                <button
                  onClick={handleCantUnderstand}
                  className="w-10 h-10 rounded-full flex items-center justify-center border border-border/60 bg-white hover:bg-muted/50 transition-all shrink-0"
                  title="听不懂？点这里"
                >
                  <AlertCircle className="w-4.5 h-4.5" style={{ color: "#8a95a5" }} />
                </button>
              ) : (
                <div className="w-10 h-10 shrink-0" />
              )}
            </div>

            {/* 底部提示 */}
            {!isRecording && !isAiSpeaking && !isDisabled && (
              <p className="text-[11px]" style={{ color: "#adb5bd" }}>
                按住按钮说话，上滑可取消
              </p>
            )}
          </div>
        )}
      </div>

      {/* ===== 微信风格录音全屏遮罩 ===== */}
      <WechatRecordingOverlay
        isRecording={isRecording}
        recordingTime={recordingTime}
        isCancelZone={isCancelZone}
      />
    </div>
  );
}

// ========== 消息气泡组件（只显示语音条，不显示文字） ==========

function AiBubble({
  audioDuration,
  text,
  audioUrl,
}: {
  audioDuration?: number;
  text: string;
  audioUrl?: string;
}) {
  return (
    <div className="flex items-start gap-2.5 max-w-[88%]">
      <img
        src={AI_AVATAR}
        alt=""
        className="w-10 h-10 rounded-full shrink-0 shadow-md border-2 border-white"
      />
      <div className="flex flex-col gap-1.5">
        {audioDuration && (
          <AudioBar
            duration={audioDuration}
            isAi={true}
            text={text}
            audioUrl={audioUrl}
          />
        )}
        {/* 不再显示文字内容 */}
      </div>
    </div>
  );
}

function UserBubble({
  audioDuration,
}: {
  audioDuration?: number;
}) {
  return (
    <div className="flex items-start gap-2.5 max-w-[85%] ml-auto flex-row-reverse">
      <div
        className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm"
        style={{
          background: "linear-gradient(135deg, #1B3F91, #2B5BA0)",
        }}
      >
        <Mic className="w-4 h-4 text-white" />
      </div>
      <div className="flex flex-col gap-1.5 items-end">
        {audioDuration && (
          <AudioBar duration={audioDuration} isAi={false} text="" />
        )}
        {/* 不再显示文字内容 */}
      </div>
    </div>
  );
}

function SystemBubble({ text }: { text: string }) {
  return (
    <div className="text-center">
      <span className="text-xs text-warm-gray bg-muted/50 px-3 py-1 rounded-full">
        {text}
      </span>
    </div>
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

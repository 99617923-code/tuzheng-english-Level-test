/**
 * 途正英语AI分级测评 - Mock演示版
 * 纯前端mock，不依赖任何后端API
 * 6道预设题目，AI语音条+用户语音条交互
 * 每题之间显示出题原则提示
 * 微信风格语音录音交互 + 底部输入区固定
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
  Square,
  Send,
  Keyboard,
  Play,
  Pause,
  Brain,
  X,
  ChevronUp,
} from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

const AI_AVATAR =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp";

type MessageRole = "ai" | "user" | "system" | "principle";
type InputMode = "voice" | "text";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  hint?: string;
  timestamp: number;
  audioDuration?: number;
}

// ========== Mock题目数据 ==========
interface MockQuestion {
  questionId: string;
  text: string;
  level: number;
  type: string;
  feedback: string;
  principle: string;
  mockUserAnswer: string;
  mockAudioDuration: number;
}

const MOCK_QUESTIONS: MockQuestion[] = [
  {
    questionId: "q1",
    text: "Hello! Let's start with something simple. Can you tell me your name and where you are from?",
    level: 0,
    type: "自我介绍",
    feedback:
      "Good start! You can introduce yourself clearly. Let me ask you something a bit more specific.",
    principle:
      "🎯 出题策略：第1题为破冰热身题，难度Level 0（零基础），测试基本自我介绍能力，帮助学员放松进入状态。",
    mockUserAnswer: "My name is Li Ming. I am from Guangzhou, China.",
    mockAudioDuration: 4,
  },
  {
    questionId: "q2",
    text: "That's great! Now, can you describe what you usually do on a typical weekday? For example, what time do you wake up and what do you do after that?",
    level: 1,
    type: "日常描述",
    feedback:
      "Nice! You can describe daily routines quite well. Let's try something that requires a bit more detail.",
    principle:
      "🎯 出题策略：根据第1题表现良好，系统自适应提升至Level 1（初级），测试日常话题描述能力和时态运用。",
    mockUserAnswer:
      "I usually wake up at seven o'clock. Then I have breakfast and go to work. I work from nine to six. After work, I like to read books or watch TV.",
    mockAudioDuration: 8,
  },
  {
    questionId: "q3",
    text: "Interesting! Now I'd like you to imagine this situation: You're at a restaurant and you want to order food, but the waiter brought you the wrong dish. How would you handle this situation?",
    level: 2,
    type: "情景应对",
    feedback:
      "Very good! You handled that situation well with polite language. Let's move to a more challenging topic.",
    principle:
      "🎯 出题策略：连续正确作答，系统继续提升至Level 2（中级），测试实际场景应对能力和礼貌用语。",
    mockUserAnswer:
      "Excuse me, I think there might be a mistake with my order. I ordered the chicken salad, but this looks like a beef steak. Could you please check my order again? Thank you very much.",
    mockAudioDuration: 10,
  },
  {
    questionId: "q4",
    text: "Well done! Here's a more complex question: What do you think about the impact of social media on young people today? Can you share your opinion with some examples?",
    level: 2,
    type: "观点表达",
    feedback:
      "Excellent analysis! You can express opinions with supporting examples. Let me test your ability with a more advanced topic.",
    principle:
      "🎯 出题策略：维持Level 2难度，切换题型为观点论述，测试逻辑表达和举例论证能力，评估是否可进阶Level 3。",
    mockUserAnswer:
      "I think social media has both positive and negative effects on young people. On one hand, it helps them connect with friends and learn new things. For example, many students use YouTube to study. On the other hand, spending too much time on social media can affect their sleep and studies.",
    mockAudioDuration: 14,
  },
  {
    questionId: "q5",
    text: "Impressive! Now, let's discuss something more abstract. Some people believe that artificial intelligence will eventually replace most human jobs. Do you agree or disagree? Please explain your reasoning.",
    level: 3,
    type: "深度讨论",
    feedback:
      "That's a very thoughtful response with good reasoning. One final question to complete your assessment.",
    principle:
      "🎯 出题策略：表现优秀，提升至Level 3（高级），测试抽象话题的深度讨论能力、逻辑推理和高级词汇运用。",
    mockUserAnswer:
      "I partially agree with this statement. While AI is certainly transforming many industries, I believe it will create new types of jobs rather than simply replacing all human roles. For instance, we'll need people to develop, maintain, and ethically oversee AI systems. However, routine and repetitive tasks will likely be automated, so it's crucial for workers to continuously upgrade their skills.",
    mockAudioDuration: 18,
  },
  {
    questionId: "q6",
    text: "For our final question: If you could change one thing about the education system in your country, what would it be and why? Please provide a detailed explanation.",
    level: 3,
    type: "综合论述",
    feedback:
      "Wonderful! You've demonstrated excellent English proficiency across all levels. Your assessment is now complete.",
    principle:
      "🎯 出题策略：最终确认题，Level 3难度，综合考察论述深度、语言流畅度和批判性思维，用于最终定级。",
    mockUserAnswer:
      "If I could change one thing, I would reform the examination-oriented approach to focus more on practical skills and creative thinking. Currently, students spend enormous amounts of time memorizing facts for standardized tests, which doesn't necessarily prepare them for real-world challenges. I would introduce more project-based learning, where students collaborate to solve actual problems. This approach not only develops critical thinking but also teaches teamwork and communication skills that are essential in today's workplace.",
    mockAudioDuration: 22,
  },
];

// ========== 语音条组件 ==========
function AudioBar({
  duration,
  isAi,
  text,
}: {
  duration: number;
  isAi: boolean;
  text: string;
  onPlay?: () => void;
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handlePlay = () => {
    if (isPlaying) {
      window.speechSynthesis?.cancel();
      if (timerRef.current) clearInterval(timerRef.current);
      setIsPlaying(false);
      setProgress(0);
      return;
    }

    setIsPlaying(true);
    setProgress(0);

    if ("speechSynthesis" in window && text) {
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
      utterance.onend = () => {
        setIsPlaying(false);
        setProgress(100);
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeout(() => setProgress(0), 500);
      };
      utterance.onerror = () => {
        setIsPlaying(false);
        setProgress(0);
        if (timerRef.current) clearInterval(timerRef.current);
      };
      window.speechSynthesis.speak(utterance);
    }

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
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-40 flex flex-col items-center justify-center"
          style={{
            background: isCancelZone
              ? "rgba(0,0,0,0.65)"
              : "rgba(0,0,0,0.50)",
          }}
        >
          {/* 录音动画区域 */}
          <div className="flex flex-col items-center">
            {/* 波纹圈 */}
            <div className="relative w-32 h-32 flex items-center justify-center mb-6">
              {/* 外圈脉冲 */}
              <motion.div
                className="absolute inset-0 rounded-full"
                style={{
                  border: isCancelZone
                    ? "2px solid rgba(239,68,68,0.3)"
                    : "2px solid rgba(131,186,18,0.3)",
                }}
                animate={{ scale: [1, 1.4, 1], opacity: [0.6, 0, 0.6] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
              <motion.div
                className="absolute inset-2 rounded-full"
                style={{
                  border: isCancelZone
                    ? "2px solid rgba(239,68,68,0.4)"
                    : "2px solid rgba(131,186,18,0.4)",
                }}
                animate={{ scale: [1, 1.3, 1], opacity: [0.7, 0.1, 0.7] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.3 }}
              />
              <motion.div
                className="absolute inset-4 rounded-full"
                style={{
                  border: isCancelZone
                    ? "2px solid rgba(239,68,68,0.5)"
                    : "2px solid rgba(131,186,18,0.5)",
                }}
                animate={{ scale: [1, 1.2, 1], opacity: [0.8, 0.2, 0.8] }}
                transition={{ duration: 1.5, repeat: Infinity, delay: 0.6 }}
              />

              {/* 中心麦克风图标 */}
              <motion.div
                className="relative w-20 h-20 rounded-full flex items-center justify-center"
                style={{
                  background: isCancelZone
                    ? "linear-gradient(135deg, #ef4444, #dc2626)"
                    : "linear-gradient(135deg, #83BA12, #6a9a10)",
                  boxShadow: isCancelZone
                    ? "0 0 40px rgba(239,68,68,0.4)"
                    : "0 0 40px rgba(131,186,18,0.4)",
                }}
                animate={{ scale: [1, 1.05, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              >
                {isCancelZone ? (
                  <X className="w-8 h-8 text-white" />
                ) : (
                  <Mic className="w-8 h-8 text-white" />
                )}
              </motion.div>
            </div>

            {/* 声波可视化 */}
            <div className="flex items-end gap-1 h-10 mb-4">
              {Array.from({ length: 20 }).map((_, i) => (
                <motion.div
                  key={i}
                  className="w-1 rounded-full"
                  style={{
                    backgroundColor: isCancelZone
                      ? "rgba(239,68,68,0.7)"
                      : "rgba(131,186,18,0.7)",
                  }}
                  animate={{
                    height: [4, Math.random() * 32 + 6, 4],
                  }}
                  transition={{
                    duration: 0.3 + Math.random() * 0.4,
                    repeat: Infinity,
                    delay: i * 0.05,
                  }}
                />
              ))}
            </div>

            {/* 录音时长 */}
            <motion.div
              className="flex items-center gap-2 mb-3"
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
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [inputMode, setInputMode] = useState<InputMode>("voice");
  const [textInput, setTextInput] = useState("");
  const [isCancelZone, setIsCancelZone] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const textInputRef = useRef<HTMLInputElement>(null);
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
      extra?: { hint?: string; audioDuration?: number }
    ) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-${Math.random()}`,
          role,
          text,
          hint: extra?.hint,
          audioDuration: extra?.audioDuration,
          timestamp: Date.now(),
        },
      ]);
    },
    []
  );

  // ========== 初始化 ==========
  useEffect(() => {
    const initTest = async () => {
      addMessage(
        "ai",
        "Hello! Welcome to TuZheng English Level Assessment. I'm your AI examiner. Let's begin with a few questions to understand your English level. Just relax and do your best!",
        { audioDuration: 8 }
      );

      await delay(1500);

      addMessage("principle", MOCK_QUESTIONS[0].principle);
      await delay(1200);

      setCurrentQuestionIndex(0);
      const q = MOCK_QUESTIONS[0];
      addMessage("ai", q.text, { audioDuration: 6 });
      setIsAiSpeaking(true);

      await speakText(q.text);
      setIsAiSpeaking(false);
    };

    initTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // ========== 处理用户回答（mock） ==========
  const processAnswer = async (userText?: string) => {
    if (currentQuestionIndex < 0 || currentQuestionIndex >= MOCK_QUESTIONS.length) return;

    const q = MOCK_QUESTIONS[currentQuestionIndex];
    const answerText = userText || q.mockUserAnswer;
    const answerDuration = userText
      ? Math.max(3, Math.ceil(answerText.split(" ").length * 0.5))
      : q.mockAudioDuration;

    addMessage("user", answerText, { audioDuration: answerDuration });

    setIsProcessing(true);
    setIsAiThinking(true);

    await delay(1500 + Math.random() * 1000);

    setIsAiThinking(false);

    addMessage("ai", q.feedback, { audioDuration: 5 });
    setIsAiSpeaking(true);
    await speakText(q.feedback);
    setIsAiSpeaking(false);

    await delay(600);

    const nextIndex = currentQuestionIndex + 1;
    if (nextIndex >= MOCK_QUESTIONS.length) {
      setIsFinished(true);
      addMessage(
        "ai",
        "Great job! You've done really well. Based on our conversation, I've completed your English level assessment. Let me prepare your detailed report now.",
        { audioDuration: 7 }
      );
      setIsAiSpeaking(true);
      await speakText(
        "Great job! Your assessment is complete. Let me show you your result."
      );
      setIsAiSpeaking(false);

      setTimeout(() => {
        navigate(
          `/result?sessionId=mock-demo&level=2&name=${encodeURIComponent(
            "中级"
          )}&label=${encodeURIComponent(
            "中级 / 高中水平"
          )}&questions=6&mock=true`
        );
      }, 2500);
    } else {
      const nextQ = MOCK_QUESTIONS[nextIndex];
      addMessage("principle", nextQ.principle);
      await delay(1500);

      setCurrentQuestionIndex(nextIndex);
      addMessage("ai", nextQ.text, {
        audioDuration: Math.ceil(nextQ.text.split(" ").length * 0.3),
      });
      setIsAiSpeaking(true);
      await speakText(nextQ.text);
      setIsAiSpeaking(false);
    }

    setIsProcessing(false);
  };

  // ========== 微信风格语音录音 ==========
  const startRecording = useCallback(async () => {
    if (isAiSpeaking || isAiThinking || isProcessing || isFinished) return;

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
  }, [isAiSpeaking, isAiThinking, isProcessing, isFinished, currentQuestionIndex]);

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
    // 上滑超过80px进入取消区域
    setIsCancelZone(deltaY > 80);
  }, []);

  // 全局mouseUp/touchEnd监听：确保无论在哪里松开都能停止录音
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

  const handleTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault();
      if (isCancelZone) {
        stopRecording(true);
      } else {
        stopRecording(false);
      }
    },
    [isCancelZone, stopRecording]
  );

  // ========== 文字输入模式 ==========
  const handleTextSubmit = async () => {
    const text = textInput.trim();
    if (!text) return;
    if (isProcessing || isAiThinking || isFinished) return;

    setTextInput("");
    await processAnswer(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  const handleCantUnderstand = async () => {
    if (isProcessing || isAiThinking || isFinished) return;
    await processAnswer("I don't understand the question.");
  };

  const handleQuit = () => {
    window.speechSynthesis?.cancel();
    navigate("/");
  };

  const progress = Math.min(
    100,
    (Math.max(1, questionNumber) / totalQuestions) * 100
  );
  const isDisabled = isAiSpeaking || isAiThinking || isProcessing || isFinished;

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
                  text={msg.text}
                  hint={msg.hint}
                  audioDuration={msg.audioDuration}
                />
              ) : msg.role === "user" ? (
                <UserBubble
                  text={msg.text}
                  audioDuration={msg.audioDuration}
                />
              ) : msg.role === "principle" ? (
                <PrincipleBubble text={msg.text} />
              ) : (
                <SystemBubble text={msg.text} />
              )}
            </motion.div>
          ))}
        </AnimatePresence>

        {/* AI Thinking Indicator */}
        {isAiThinking && (
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
        ) : isProcessing && !isAiThinking ? (
          <div className="text-center py-2">
            <div
              className="flex items-center justify-center gap-2"
              style={{ color: "#1B3F91" }}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">
                正在处理你的回答...
              </span>
            </div>
          </div>
        ) : inputMode === "text" ? (
          /* ========== 文字输入模式 ========== */
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  ref={textInputRef}
                  type="text"
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Type your answer in English..."
                  disabled={isDisabled}
                  className="w-full h-11 pl-4 pr-12 rounded-full border border-border/60 bg-white text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-[#1B3F91]/30 focus:border-[#1B3F91]/50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                />
                <button
                  onClick={handleTextSubmit}
                  disabled={isDisabled || !textInput.trim()}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full flex items-center justify-center transition-all disabled:opacity-30"
                  style={
                    !isDisabled && textInput.trim()
                      ? {
                          background:
                            "linear-gradient(135deg, #1B3F91, #2B5BA0)",
                        }
                      : {}
                  }
                >
                  <Send
                    className={`w-4 h-4 ${
                      !isDisabled && textInput.trim()
                        ? "text-white"
                        : "text-muted-foreground/40"
                    }`}
                  />
                </button>
              </div>
              {/* 切换到语音模式 */}
              <button
                onClick={() => setInputMode("voice")}
                disabled={isDisabled}
                className="w-11 h-11 rounded-full flex items-center justify-center border border-border/60 bg-white hover:bg-muted/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                title="切换到语音模式"
              >
                <Mic className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            {/* AI说话状态提示 */}
            {isAiSpeaking && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-center gap-2 rounded-full px-4 py-1.5"
                style={{ backgroundColor: "rgba(131,186,18,0.10)" }}
              >
                <Volume2
                  className="w-3.5 h-3.5"
                  style={{ color: "#6a9a10" }}
                />
                <span
                  className="text-xs font-medium"
                  style={{ color: "#6a9a10" }}
                >
                  AI正在说话，请仔细听...
                </span>
              </motion.div>
            )}

            {/* 听不懂按钮 */}
            {!isDisabled && questionNumber > 0 && (
              <div className="flex justify-center">
                <button
                  onClick={handleCantUnderstand}
                  className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
                  style={{ color: "#8a95a5" }}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  听不懂？点这里
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ========== 语音录音模式（微信风格） ========== */
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
                  AI正在说话，请仔细听...
                </span>
              </motion.div>
            )}

            {/* 按住说话按钮区 + 切换文字 */}
            <div className="flex items-center gap-3 w-full">
              {/* 切换到文字模式 */}
              <button
                onClick={() => setInputMode("text")}
                disabled={isDisabled || isRecording}
                className="w-10 h-10 rounded-full flex items-center justify-center border border-border/60 bg-white hover:bg-muted/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                title="切换到文字模式"
              >
                <Keyboard className="w-4.5 h-4.5 text-muted-foreground" />
              </button>

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
            {(isAiThinking || (isProcessing && !isAiThinking && !isFinished)) && (
              <p className="text-[11px]" style={{ color: "#1B3F91" }}>
                AI正在思考...
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

// ========== 消息气泡组件 ==========

function AiBubble({
  text,
  hint,
  audioDuration,
}: {
  text: string;
  hint?: string;
  audioDuration?: number;
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
          <AudioBar duration={audioDuration} isAi={true} text={text} />
        )}
        <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
          <p
            className="text-sm leading-relaxed font-medium"
            style={{ color: "#1a1a2e" }}
          >
            {text}
          </p>
        </div>
        {hint && (
          <p className="text-[11px] text-warm-gray/50 mt-1 ml-1">{hint}</p>
        )}
      </div>
    </div>
  );
}

function UserBubble({
  text,
  audioDuration,
}: {
  text: string;
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
          <AudioBar duration={audioDuration} isAi={false} text={text} />
        )}
        <div
          className="text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-sm"
          style={{
            background: "linear-gradient(135deg, #1B3F91, #2B5BA0)",
          }}
        >
          <p className="text-sm leading-relaxed">{text}</p>
        </div>
      </div>
    </div>
  );
}

function PrincipleBubble({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="mx-auto max-w-[92%]"
    >
      <div
        className="rounded-2xl px-4 py-3 border"
        style={{
          background:
            "linear-gradient(135deg, rgba(131,186,18,0.06), rgba(27,63,145,0.06))",
          borderColor: "rgba(131,186,18,0.2)",
        }}
      >
        <div className="flex items-start gap-2">
          <Brain
            className="w-4 h-4 mt-0.5 shrink-0"
            style={{ color: "#6a9a10" }}
          />
          <p
            className="text-xs leading-relaxed font-medium"
            style={{ color: "#4a5a3a" }}
          >
            {text}
          </p>
        </div>
      </div>
    </motion.div>
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

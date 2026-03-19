/**
 * 途正英语AI分级测评 - 核心测评对话页
 * 设计风格：聊天式对话布局，AI在左，学员在右
 * 功能：AI语音提问 → 学员语音回答 → 自适应出题 → 定级
 * 当前：前端模拟数据，后续对接后端API
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, MicOff, Volume2, Loader2, ChevronLeft, AlertCircle, Square } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

const AI_AVATAR = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp";

// 级别定义（与方案文档一致）
const LEVELS = ["零级", "一级", "二级", "三级"] as const;
const LEVEL_LABELS: Record<string, string> = {
  "零级": "零基础 / 小学水平",
  "一级": "初中水平",
  "二级": "高中水平",
  "三级": "高中以上水平",
};

// 模拟题库 - 按难度分级（CAT自适应出题）
const QUESTION_BANK: Record<number, { text: string; hint: string }[]> = {
  0: [
    { text: "Hello! What is your name?", hint: "请用英语说出你的名字" },
    { text: "How old are you?", hint: "请用英语说出你的年龄" },
    { text: "Can you count from one to ten in English?", hint: "请用英语从1数到10" },
    { text: "What color do you like?", hint: "请说出你喜欢的颜色" },
    { text: "Do you like apples or bananas?", hint: "请回答你喜欢苹果还是香蕉" },
  ],
  1: [
    { text: "What do you usually do on weekends?", hint: "请描述你周末通常做什么" },
    { text: "Can you describe your family members?", hint: "请描述你的家庭成员" },
    { text: "What is your favorite subject at school and why?", hint: "请说出你最喜欢的科目及原因" },
    { text: "Tell me about your daily routine.", hint: "请描述你的日常作息" },
    { text: "What did you do yesterday?", hint: "请描述你昨天做了什么" },
  ],
  2: [
    { text: "What are the advantages and disadvantages of social media?", hint: "请谈谈社交媒体的利弊" },
    { text: "If you could travel anywhere in the world, where would you go and why?", hint: "请说出你想去的地方及原因" },
    { text: "How do you think technology has changed education?", hint: "请谈谈科技如何改变教育" },
    { text: "Describe a challenging experience you've had and what you learned from it.", hint: "请描述一次挑战经历" },
    { text: "What qualities make a good leader in your opinion?", hint: "请谈谈好领导的品质" },
  ],
  3: [
    { text: "How would you evaluate the impact of artificial intelligence on the job market in the next decade?", hint: "请评估AI对就业市场的影响" },
    { text: "Some people argue that globalization has more drawbacks than benefits. What's your perspective?", hint: "请谈谈你对全球化的看法" },
    { text: "Discuss the ethical implications of genetic engineering in modern medicine.", hint: "请讨论基因工程的伦理问题" },
    { text: "How does cultural diversity contribute to innovation in multinational organizations?", hint: "请谈谈文化多样性与创新" },
    { text: "What role should governments play in addressing climate change?", hint: "请谈谈政府在应对气候变化中的角色" },
  ],
};

type MessageRole = "ai" | "user" | "system";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  hint?: string;
  timestamp: number;
}

interface TestState {
  currentLevel: number;
  questionCount: number;
  scores: number[];
  isFinished: boolean;
  finalLevel: number | null;
  usedQuestions: Set<string>;
}

export default function Test() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [testState, setTestState] = useState<TestState>({
    currentLevel: 1,
    questionCount: 0,
    scores: [],
    isFinished: false,
    finalLevel: null,
    usedQuestions: new Set(),
  });
  const [isRecording, setIsRecording] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentHint, setCurrentHint] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start test with welcome + first question
  useEffect(() => {
    const startTest = async () => {
      addMessage("ai", "Hello! Welcome to TuZheng English Level Assessment. I'm your AI examiner. Let's begin with a few questions to understand your English level. Just relax and do your best!");
      
      await delay(2500);
      askQuestion(1);
    };
    startTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addMessage = (role: MessageRole, text: string, hint?: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        role,
        text,
        hint,
        timestamp: Date.now(),
      },
    ]);
  };

  const askQuestion = (level: number) => {
    const questions = QUESTION_BANK[level] || QUESTION_BANK[1];
    // 避免重复出题
    const available = questions.filter((q) => !testState.usedQuestions.has(q.text));
    const pool = available.length > 0 ? available : questions;
    const chosen = pool[Math.floor(Math.random() * pool.length)];
    
    setIsAiThinking(true);
    setTimeout(() => {
      setIsAiThinking(false);
      addMessage("ai", chosen.text, chosen.hint);
      setCurrentHint(chosen.hint);
      speakText(chosen.text);
      setTestState((prev) => ({
        ...prev,
        currentLevel: level,
        questionCount: prev.questionCount + 1,
        usedQuestions: new Set(Array.from(prev.usedQuestions).concat(chosen.text)),
      }));
    }, 1200);
  };

  const speakText = (text: string) => {
    if ("speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "en-US";
      utterance.rate = 0.85;
      utterance.pitch = 1.0;
      
      // 尝试选择英语女声
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(
        (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")
      ) || voices.find((v) => v.lang.startsWith("en"));
      if (englishVoice) utterance.voice = englishVoice;
      
      utterance.onstart = () => setIsAiSpeaking(true);
      utterance.onend = () => setIsAiSpeaking(false);
      utterance.onerror = () => setIsAiSpeaking(false);
      
      synthRef.current = utterance;
      window.speechSynthesis.speak(utterance);
    }
  };

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        processRecording();
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
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [isRecording]);

  const processRecording = () => {
    // 模拟ASR转录 - 后续对接后端API
    // 实际场景：录音文件上传 → ASR转文字 → LLM评估
    const { currentLevel } = testState;
    
    // 根据当前难度级别模拟不同水平的回答
    const simulatedByLevel: Record<number, string[]> = {
      0: [
        "My name is... uh... I am student.",
        "I am... twenty years old.",
        "One, two, three, four, five, six, seven, eight, nine, ten.",
        "I like... blue color.",
        "Yes, I like apple.",
      ],
      1: [
        "On weekends, I usually play games and watch TV.",
        "I have father, mother and one sister.",
        "I like English because it is interesting.",
        "I get up at seven o'clock every day and go to school.",
        "Yesterday I went to the park with my friends.",
      ],
      2: [
        "Social media has both advantages and disadvantages. It helps people connect but can also be addictive.",
        "I would like to travel to Japan because of its unique culture and beautiful scenery.",
        "Technology has made education more accessible through online learning platforms.",
        "When I was learning to swim, I was very afraid but my coach helped me overcome my fear.",
        "A good leader should be responsible, empathetic and able to inspire others.",
      ],
      3: [
        "The impact of AI on employment will be multifaceted. While some jobs will be automated, new opportunities will emerge in AI development and maintenance.",
        "Globalization has brought both economic growth and cultural exchange, but it has also widened the gap between developed and developing nations.",
        "Genetic engineering raises important ethical questions about the boundaries of human intervention in natural processes.",
        "Cultural diversity fosters innovation by bringing together different perspectives and problem-solving approaches.",
        "Governments should implement comprehensive policies including carbon taxation and renewable energy incentives.",
      ],
    };
    
    const responses = simulatedByLevel[currentLevel] || simulatedByLevel[1];
    const response = responses[Math.floor(Math.random() * responses.length)];
    addMessage("user", response);

    // 模拟AI评估
    setTimeout(() => evaluateAndContinue(response), 1200);
  };

  const evaluateAndContinue = (userResponse: string) => {
    const { currentLevel, questionCount, scores } = testState;
    
    // 模拟评分逻辑（后续由后端LLM完成）
    const wordCount = userResponse.split(" ").length;
    const hasComplexStructure = /\b(although|however|furthermore|moreover|consequently|nevertheless)\b/i.test(userResponse);
    const hasComplexVocab = /\b(multifaceted|comprehensive|accessible|perspectives|intervention)\b/i.test(userResponse);
    const hasBasicErrors = /\b(I am student|I like apple|I has)\b/i.test(userResponse);
    const cantUnderstand = /don't understand|I don't know|听不懂/i.test(userResponse);
    
    let score: number;
    if (cantUnderstand) {
      score = Math.max(0, currentLevel - 1);
    } else if ((hasComplexStructure || hasComplexVocab) && wordCount > 15) {
      score = Math.min(3, currentLevel + 1);
    } else if (hasBasicErrors || wordCount < 5) {
      score = Math.max(0, currentLevel - 1);
    } else if (wordCount > 10) {
      score = currentLevel;
    } else {
      score = Math.max(0, currentLevel - 1);
    }
    
    const newScores = [...scores, score];
    const newQuestionCount = questionCount;
    
    // CAT终止条件：6题以上，或连续3题同级别
    const shouldTerminate = newQuestionCount >= 6 || (
      newQuestionCount >= 4 && newScores.length >= 3 &&
      newScores.slice(-3).every((s) => s === newScores[newScores.length - 1])
    );
    
    if (shouldTerminate) {
      const avgScore = newScores.reduce((a, b) => a + b, 0) / newScores.length;
      const finalLevel = Math.min(3, Math.max(0, Math.round(avgScore)));
      
      setTestState((prev) => ({
        ...prev,
        scores: newScores,
        isFinished: true,
        finalLevel,
      }));
      
      setIsAiThinking(true);
      setTimeout(() => {
        setIsAiThinking(false);
        const levelName = LEVELS[finalLevel];
        addMessage(
          "ai",
          "Great job! You've done really well. Based on our conversation, I've completed your English level assessment. Let me prepare your detailed report now."
        );
        speakText("Great job! Your assessment is complete. Let me show you your result.");
        
        setTimeout(() => {
          navigate(`/result?level=${finalLevel}&questions=${newQuestionCount}&label=${encodeURIComponent(LEVEL_LABELS[levelName] || "")}&name=${encodeURIComponent(levelName)}`);
        }, 3500);
      }, 2000);
    } else {
      // 继续出题
      const nextLevel = score;
      
      setIsAiThinking(true);
      setTimeout(() => {
        setIsAiThinking(false);
        const feedbacks = [
          "Good answer. Let me ask you something else.",
          "I see. Let's try a different topic.",
          "Alright, here's the next question for you.",
          "Thank you for your answer. Let's continue.",
          "Nice. Now let me ask you this.",
        ];
        const feedback = feedbacks[Math.floor(Math.random() * feedbacks.length)];
        addMessage("ai", feedback);
        speakText(feedback);
        
        setTimeout(() => {
          askQuestion(nextLevel);
        }, 2000);
      }, 1500);
      
      setTestState((prev) => ({
        ...prev,
        scores: newScores,
      }));
    }
  };

  const totalQuestions = 6;
  const progress = Math.min(100, (testState.questionCount / totalQuestions) * 100);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-border/50 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              window.speechSynthesis.cancel();
              navigate("/");
            }}
            className="w-9 h-9 rounded-xl flex items-center justify-center hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
          <div className="flex-1 text-center">
            <h2 className="font-bold text-sm text-foreground">AI 英语测评</h2>
            <p className="text-xs text-warm-gray">
              第 {Math.max(1, testState.questionCount)}/{totalQuestions} 题
            </p>
          </div>
          <div className="w-9" />
        </div>
        {/* Progress Bar */}
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-coral to-coral-light rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.5 }}
          />
        </div>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <AnimatePresence>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              {msg.role === "ai" ? (
                <AiBubble text={msg.text} hint={msg.hint} />
              ) : msg.role === "user" ? (
                <UserBubble text={msg.text} />
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
            <img src={AI_AVATAR} alt="" className="w-9 h-9 rounded-full shrink-0 border-2 border-white shadow-sm" />
            <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-coral/40 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="w-2 h-2 bg-coral/40 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 bg-coral/40 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Recording Controls */}
      <div className="bg-white/90 backdrop-blur-md border-t border-border/50 px-4 py-4 pb-8">
        {testState.isFinished ? (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 text-mint-dark">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">正在生成测评报告...</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            {/* Recording Status */}
            {isRecording && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 bg-coral/5 rounded-full px-4 py-2"
              >
                <div className="flex items-end gap-0.5 h-5">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <motion.div
                      key={i}
                      className="w-0.5 bg-coral rounded-full"
                      animate={{ height: [3, Math.random() * 18 + 3, 3] }}
                      transition={{
                        duration: 0.4 + Math.random() * 0.3,
                        repeat: Infinity,
                        delay: i * 0.08,
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium text-coral">
                  {recordingTime}s
                </span>
                <div className="w-2 h-2 rounded-full bg-coral animate-pulse" />
              </motion.div>
            )}

            {isAiSpeaking && !isRecording && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 bg-mint/10 rounded-full px-4 py-2"
              >
                <Volume2 className="w-4 h-4 text-mint-dark" />
                <span className="text-sm font-medium text-mint-dark">AI正在说话，请仔细听...</span>
              </motion.div>
            )}

            {/* Hint text */}
            {currentHint && !isRecording && !isAiSpeaking && !isAiThinking && testState.questionCount > 0 && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs text-warm-gray/70 bg-muted/30 rounded-full px-3 py-1"
              >
                {currentHint}
              </motion.p>
            )}

            {/* Mic Button */}
            <div className="relative">
              {isRecording && (
                <>
                  <div className="absolute inset-[-4px] rounded-full bg-coral/15 animate-pulse-ring" />
                  <div className="absolute inset-[-12px] rounded-full bg-coral/8 animate-pulse-ring" style={{ animationDelay: "0.5s" }} />
                </>
              )}
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                disabled={isAiSpeaking || isAiThinking}
                className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
                  isRecording
                    ? "bg-coral text-white scale-110 shadow-xl shadow-coral/40"
                    : isAiSpeaking || isAiThinking
                    ? "bg-muted text-warm-gray"
                    : "bg-coral text-white shadow-lg shadow-coral/30 active:scale-95"
                }`}
              >
                {isRecording ? (
                  <Square className="w-6 h-6 fill-white" />
                ) : (
                  <Mic className="w-7 h-7" />
                )}
              </button>
            </div>

            <p className="text-xs text-warm-gray">
              {isRecording
                ? "松开结束录音"
                : isAiSpeaking
                ? "请等待AI说完"
                : isAiThinking
                ? "AI正在思考..."
                : "按住说话，松开发送"}
            </p>

            {/* Can't understand button */}
            {!isRecording && !isAiSpeaking && !isAiThinking && testState.questionCount > 0 && (
              <button
                onClick={() => {
                  addMessage("user", "I don't understand the question.");
                  evaluateAndContinue("I don't understand the question.");
                }}
                className="flex items-center gap-1.5 text-xs text-warm-gray/60 hover:text-coral transition-colors mt-1"
              >
                <AlertCircle className="w-3.5 h-3.5" />
                听不懂？点这里
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function AiBubble({ text, hint }: { text: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5 max-w-[88%]">
      <img src={AI_AVATAR} alt="" className="w-10 h-10 rounded-full shrink-0 shadow-md border-2 border-white" />
      <div>
        <div className="bg-white rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
          <p className="text-sm leading-relaxed font-medium" style={{ color: '#1a1a2e' }}>{text}</p>
        </div>
        {hint && (
          <p className="text-[11px] text-warm-gray/50 mt-1 ml-1">{hint}</p>
        )}
      </div>
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-2.5 max-w-[85%] ml-auto flex-row-reverse">
      <div className="w-9 h-9 rounded-full bg-gradient-to-br from-coral to-coral-light flex items-center justify-center shrink-0 shadow-sm">
        <Mic className="w-4 h-4 text-white" />
      </div>
      <div className="bg-coral text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-sm">
        <p className="text-sm leading-relaxed">{text}</p>
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

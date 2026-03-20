/**
 * 途正英语AI分级测评 - 核心测评对话页
 * 对接后端API: start → evaluate → upload-audio → transcribe → tts
 * 设计风格：聊天式对话布局，AI在左，学员在右
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Volume2, Loader2, ChevronLeft, AlertCircle, Square } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  startTest,
  evaluateAnswer,
  uploadAudio,
  transcribeAudio,
  textToSpeech,
  terminateTest,
  type TestQuestion,
} from "@/lib/api";

const AI_AVATAR = "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/ai-teacher-avatar-dLw5RzBDM3AJWaRxiMxYoU.webp";

type MessageRole = "ai" | "user" | "system";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  hint?: string;
  timestamp: number;
  isPlaying?: boolean;
}

export default function Test() {
  const [, navigate] = useLocation();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [currentQuestion, setCurrentQuestion] = useState<TestQuestion | null>(null);
  const [questionNumber, setQuestionNumber] = useState(0);
  const [totalQuestions, setTotalQuestions] = useState(6);
  const [isRecording, setIsRecording] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isAiThinking, setIsAiThinking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);

  // Auto-scroll to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Start test session
  useEffect(() => {
    const initTest = async () => {
      addMessage("ai", "Hello! Welcome to TuZheng English Level Assessment. I'm your AI examiner. Let's begin with a few questions to understand your English level. Just relax and do your best!");

      setIsAiThinking(true);
      try {
        const data = await startTest();
        setSessionId(data.sessionId);
        setCurrentQuestion(data.currentQuestion);
        setQuestionNumber(data.currentQuestion.questionNumber);
        setTotalQuestions(data.currentQuestion.totalQuestions);

        // 等一下再显示第一道题
        await delay(1500);
        setIsAiThinking(false);

        const q = data.currentQuestion;
        addMessage("ai", q.prompt);
        // 播放TTS音频或降级到Web Speech API
        await playQuestionAudio(q.prompt, q.audioUrl);
      } catch (err: unknown) {
        setIsAiThinking(false);
        const errMsg = err instanceof Error ? err.message : "未知错误";
        toast.error(`测评初始化失败: ${errMsg}`);
        addMessage("system", "测评初始化失败，请返回重试");
      }
    };
    initTest();
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

  /** 播放题目音频：优先用后端TTS音频URL，降级到Web Speech API */
  const playQuestionAudio = async (text: string, audioUrl?: string | null) => {
    setIsAiSpeaking(true);

    // 1. 如果后端已提供audioUrl，直接播放
    if (audioUrl) {
      try {
        await playAudioUrl(audioUrl);
        setIsAiSpeaking(false);
        return;
      } catch {
        // 降级到方案2
      }
    }

    // 2. 尝试调用后端TTS接口
    try {
      const ttsData = await textToSpeech({ text, speed: 0.85 });
      if (ttsData.audioUrl) {
        await playAudioUrl(ttsData.audioUrl);
        setIsAiSpeaking(false);
        return;
      }
    } catch {
      // 降级到方案3
    }

    // 3. 降级到浏览器Web Speech API
    if ("speechSynthesis" in window) {
      await new Promise<void>((resolve) => {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "en-US";
        utterance.rate = 0.85;
        utterance.pitch = 1.0;

        const voices = window.speechSynthesis.getVoices();
        const englishVoice = voices.find(
          (v) => v.lang.startsWith("en") && v.name.toLowerCase().includes("female")
        ) || voices.find((v) => v.lang.startsWith("en"));
        if (englishVoice) utterance.voice = englishVoice;

        utterance.onend = () => resolve();
        utterance.onerror = () => resolve();
        window.speechSynthesis.speak(utterance);
      });
    }

    setIsAiSpeaking(false);
  };

  /** 播放音频URL */
  const playAudioUrl = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed"));
      audio.play().catch(reject);
    });
  };

  const startRecording = useCallback(async () => {
    if (isAiSpeaking || isAiThinking || isProcessing || isFinished) return;

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
  }, [isAiSpeaking, isAiThinking, isProcessing, isFinished]);

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

  /** 处理录音：上传 → ASR转文字 → 提交评估 */
  const processRecording = async () => {
    if (!sessionId || !currentQuestion) return;

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    const duration = Date.now() - startTimeRef.current;

    setIsProcessing(true);
    setIsAiThinking(true);

    try {
      // 1. 上传录音
      const uploadResult = await uploadAudio({
        file: audioBlob,
        sessionId,
        questionId: currentQuestion.questionId,
      });

      // 2. ASR转文字
      const transcription = await transcribeAudio({
        audioUrl: uploadResult.audioUrl,
        language: "en",
      });

      // 显示用户回答
      addMessage("user", transcription.text);

      // 3. 提交评估
      const evalResult = await evaluateAnswer({
        sessionId,
        questionId: currentQuestion.questionId,
        answerText: transcription.text,
        audioUrl: uploadResult.audioUrl,
        duration,
      });

      setIsAiThinking(false);

      // 4. 显示AI反馈
      if (evalResult.evaluation.feedback) {
        addMessage("ai", evalResult.evaluation.feedback);
        // 朗读反馈
        await playQuestionAudio(evalResult.evaluation.feedback);
      }

      // 5. 判断是否完成
      if (evalResult.isComplete && evalResult.result) {
        setIsFinished(true);
        addMessage(
          "ai",
          "Great job! You've done really well. Based on our conversation, I've completed your English level assessment. Let me prepare your detailed report now."
        );
        await playQuestionAudio(
          "Great job! Your assessment is complete. Let me show you your result."
        );

        // 跳转到结果页
        setTimeout(() => {
          const r = evalResult.result!;
          navigate(
            `/result?sessionId=${r.sessionId}&level=${r.finalLevel}&name=${encodeURIComponent(r.levelLabel)}&label=${encodeURIComponent(r.levelName)}&questions=${r.questionCount}`
          );
        }, 2000);
      } else if (evalResult.nextQuestion) {
        // 6. 显示下一题
        const nextQ = evalResult.nextQuestion;
        setCurrentQuestion(nextQ);
        setQuestionNumber(nextQ.questionNumber);
        setTotalQuestions(nextQ.totalQuestions);

        await delay(800);
        addMessage("ai", nextQ.prompt);
        await playQuestionAudio(nextQ.prompt, nextQ.audioUrl);
      }
    } catch (err: unknown) {
      setIsAiThinking(false);
      const errMsg = err instanceof Error ? err.message : "处理失败";
      toast.error(`处理回答失败: ${errMsg}`);
      addMessage("system", "处理失败，请重新回答");
    } finally {
      setIsProcessing(false);
    }
  };

  /** 用户点击"听不懂" */
  const handleCantUnderstand = async () => {
    if (!sessionId || !currentQuestion) return;

    setIsProcessing(true);
    setIsAiThinking(true);

    addMessage("user", "I don't understand the question.");

    try {
      const evalResult = await evaluateAnswer({
        sessionId,
        questionId: currentQuestion.questionId,
        answerText: "I don't understand the question.",
        duration: 0,
      });

      setIsAiThinking(false);

      if (evalResult.evaluation.feedback) {
        addMessage("ai", evalResult.evaluation.feedback);
        await playQuestionAudio(evalResult.evaluation.feedback);
      }

      if (evalResult.isComplete && evalResult.result) {
        setIsFinished(true);
        addMessage("ai", "Thank you for trying! Let me prepare your result.");
        setTimeout(() => {
          const r = evalResult.result!;
          navigate(
            `/result?sessionId=${r.sessionId}&level=${r.finalLevel}&name=${encodeURIComponent(r.levelLabel)}&label=${encodeURIComponent(r.levelName)}&questions=${r.questionCount}`
          );
        }, 2000);
      } else if (evalResult.nextQuestion) {
        const nextQ = evalResult.nextQuestion;
        setCurrentQuestion(nextQ);
        setQuestionNumber(nextQ.questionNumber);
        setTotalQuestions(nextQ.totalQuestions);

        await delay(800);
        addMessage("ai", nextQ.prompt);
        await playQuestionAudio(nextQ.prompt, nextQ.audioUrl);
      }
    } catch (err: unknown) {
      setIsAiThinking(false);
      const errMsg = err instanceof Error ? err.message : "处理失败";
      toast.error(`提交失败: ${errMsg}`);
    } finally {
      setIsProcessing(false);
    }
  };

  /** 退出测评 */
  const handleQuit = async () => {
    if (sessionId) {
      try {
        await terminateTest({ sessionId, reason: "user_quit" });
      } catch {
        // 忽略终止错误
      }
    }
    window.speechSynthesis?.cancel();
    if (audioRef.current) audioRef.current.pause();
    navigate("/");
  };

  const progress = Math.min(100, (questionNumber / totalQuestions) * 100);

  return (
    <div className="min-h-screen bg-cream flex flex-col">
      {/* Header */}
      <div className="bg-white/80 backdrop-blur-md border-b border-border/50 px-4 py-3 sticky top-0 z-20">
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
        {isFinished ? (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 text-mint-dark">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">正在生成测评报告...</span>
            </div>
          </div>
        ) : isProcessing && !isAiThinking ? (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2 text-coral">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">正在处理你的回答...</span>
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
                disabled={isAiSpeaking || isAiThinking || isProcessing}
                className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
                  isRecording
                    ? "bg-coral text-white scale-110 shadow-xl shadow-coral/40"
                    : isAiSpeaking || isAiThinking || isProcessing
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
                : isAiThinking || isProcessing
                ? "AI正在思考..."
                : "按住说话，松开发送"}
            </p>

            {/* Can't understand button */}
            {!isRecording && !isAiSpeaking && !isAiThinking && !isProcessing && questionNumber > 0 && (
              <button
                onClick={handleCantUnderstand}
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

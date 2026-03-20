/**
 * 途正英语AI分级测评 - 核心测评对话页
 * 对接后端API: start → evaluate → upload-audio → transcribe → tts
 * 支持两种输入模式：语音录音 / 文字输入
 * 设计风格：聊天式对话布局，AI在左，学员在右
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Volume2, Loader2, ChevronLeft, AlertCircle, Square, Send, Keyboard, MessageSquare } from "lucide-react";
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
type InputMode = "voice" | "text";

interface ChatMessage {
  id: string;
  role: MessageRole;
  text: string;
  hint?: string;
  timestamp: number;
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
  const [inputMode, setInputMode] = useState<InputMode>("text"); // 默认文字输入
  const [textInput, setTextInput] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const startTimeRef = useRef<number>(0);
  const textInputRef = useRef<HTMLInputElement>(null);

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
        const q = data.firstQuestion;
        setCurrentQuestion(q);
        setQuestionNumber(1);
        setTotalQuestions(data.totalQuestions);

        await delay(1500);
        setIsAiThinking(false);

        addMessage("ai", q.text);
        await playQuestionAudio(q.text, q.audioUrl);
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

    if (audioUrl) {
      try {
        await playAudioUrl(audioUrl);
        setIsAiSpeaking(false);
        return;
      } catch { /* 降级 */ }
    }

    try {
      const ttsData = await textToSpeech({ text, speed: 0.85 });
      if (ttsData.audioUrl) {
        await playAudioUrl(ttsData.audioUrl);
        setIsAiSpeaking(false);
        return;
      }
    } catch { /* 降级 */ }

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

  const playAudioUrl = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (audioRef.current) audioRef.current.pause();
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => reject(new Error("Audio playback failed"));
      audio.play().catch(reject);
    });
  };

  // ========== 语音录音模式 ==========
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
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, []);

  /** 处理录音：上传 → ASR转文字 → 提交评估 */
  const processRecording = async () => {
    if (!sessionId || !currentQuestion) return;

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
    const answerDuration = Date.now() - startTimeRef.current;

    setIsProcessing(true);
    setIsAiThinking(true);

    try {
      const uploadResult = await uploadAudio({
        file: audioBlob,
        sessionId,
        questionId: currentQuestion.questionId,
      });

      const transcription = await transcribeAudio({
        audioUrl: uploadResult.audioUrl,
        language: "en",
      });

      addMessage("user", transcription.text);

      await handleEvaluateResult(
        transcription.text,
        uploadResult.audioUrl,
        answerDuration
      );
    } catch (err: unknown) {
      setIsAiThinking(false);
      const errMsg = err instanceof Error ? err.message : "处理失败";
      toast.error(`处理回答失败: ${errMsg}`);
      addMessage("system", "处理失败，请重新回答");
    } finally {
      setIsProcessing(false);
    }
  };

  // ========== 文字输入模式 ==========
  const handleTextSubmit = async () => {
    const text = textInput.trim();
    if (!text || !sessionId || !currentQuestion) return;
    if (isProcessing || isAiThinking || isFinished) return;

    // 显示用户消息
    addMessage("user", text);
    setTextInput("");

    setIsProcessing(true);
    setIsAiThinking(true);

    try {
      await handleEvaluateResult(text);
    } catch (err: unknown) {
      setIsAiThinking(false);
      const errMsg = err instanceof Error ? err.message : "处理失败";
      toast.error(`处理回答失败: ${errMsg}`);
      addMessage("system", "处理失败，请重新回答");
    } finally {
      setIsProcessing(false);
    }
  };

  /** 键盘回车提交 */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleTextSubmit();
    }
  };

  // ========== 共用评估结果处理 ==========
  const handleEvaluateResult = async (
    transcription: string,
    audioUrl?: string,
    answerDuration?: number
  ) => {
    if (!sessionId || !currentQuestion) return;

    const evalResult = await evaluateAnswer({
      sessionId,
      questionId: currentQuestion.questionId,
      transcription,
      audioUrl,
      answerDuration,
    });

    setIsAiThinking(false);

    // 显示AI反馈
    if (evalResult.evaluation?.feedback) {
      addMessage("ai", evalResult.evaluation.feedback);
      await playQuestionAudio(evalResult.evaluation.feedback);
    }

    // 判断是否完成
    const isComplete = evalResult.nextAction === "complete" || evalResult.nextAction === "finish";
    if (isComplete) {
      setIsFinished(true);
      addMessage(
        "ai",
        "Great job! You've done really well. Based on our conversation, I've completed your English level assessment. Let me prepare your detailed report now."
      );
      await playQuestionAudio(
        "Great job! Your assessment is complete. Let me show you your result."
      );

      setTimeout(() => {
        if (evalResult.result) {
          const r = evalResult.result;
          navigate(
            `/result?sessionId=${r.sessionId}&level=${r.finalLevel}&name=${encodeURIComponent(r.levelLabel || "")}&label=${encodeURIComponent(r.levelName || "")}&questions=${r.questionCount}`
          );
        } else {
          navigate(`/result?sessionId=${sessionId}`);
        }
      }, 2000);
    } else if (evalResult.nextQuestion) {
      const nextQ = evalResult.nextQuestion;
      setCurrentQuestion(nextQ);
      setQuestionNumber((prev) => prev + 1);

      await delay(800);
      addMessage("ai", nextQ.text);
      await playQuestionAudio(nextQ.text, nextQ.audioUrl);
    }
  };

  /** 用户点击"听不懂" */
  const handleCantUnderstand = async () => {
    if (!sessionId || !currentQuestion) return;

    setIsProcessing(true);
    setIsAiThinking(true);

    addMessage("user", "I don't understand the question.");

    try {
      await handleEvaluateResult("I don't understand the question.", undefined, 0);
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
      } catch { /* 忽略 */ }
    }
    window.speechSynthesis?.cancel();
    if (audioRef.current) audioRef.current.pause();
    navigate("/");
  };

  const progress = Math.min(100, (questionNumber / totalQuestions) * 100);
  const isDisabled = isAiSpeaking || isAiThinking || isProcessing || isFinished;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)" }}>
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
            className="h-full rounded-full" style={{ background: "linear-gradient(90deg, #1B3F91, #83BA12)" }}
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
                <UserBubble text={msg.text} inputMode={inputMode} />
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
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: "0ms", backgroundColor: "rgba(27,63,145,0.4)" }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: "150ms", backgroundColor: "rgba(27,63,145,0.4)" }} />
                <span className="w-2 h-2 rounded-full animate-bounce" style={{ animationDelay: "300ms", backgroundColor: "rgba(27,63,145,0.4)" }} />
              </div>
            </div>
          </motion.div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Bottom Controls */}
      <div className="bg-white/90 backdrop-blur-md border-t border-border/50 px-4 py-3 pb-6">
        {isFinished ? (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2" style={{ color: "#6a9a10" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">正在生成测评报告...</span>
            </div>
          </div>
        ) : isProcessing && !isAiThinking ? (
          <div className="text-center py-2">
            <div className="flex items-center justify-center gap-2" style={{ color: "#1B3F91" }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm font-medium">正在处理你的回答...</span>
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
                      ? { background: "linear-gradient(135deg, #1B3F91, #2B5BA0)" }
                      : {}
                  }
                >
                  <Send className={`w-4 h-4 ${!isDisabled && textInput.trim() ? "text-white" : "text-muted-foreground/40"}`} />
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
                className="flex items-center justify-center gap-2 rounded-full px-4 py-1.5" style={{ backgroundColor: "rgba(131,186,18,0.10)" }}
              >
                <Volume2 className="w-3.5 h-3.5" style={{ color: "#6a9a10" }} />
                <span className="text-xs font-medium" style={{ color: "#6a9a10" }}>AI正在说话，请仔细听...</span>
              </motion.div>
            )}

            {/* 听不懂按钮 */}
            {!isDisabled && questionNumber > 0 && (
              <div className="flex justify-center">
                <button
                  onClick={handleCantUnderstand}
                  className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80" style={{ color: "#8a95a5" }}
                >
                  <AlertCircle className="w-3.5 h-3.5" />
                  听不懂？点这里
                </button>
              </div>
            )}
          </div>
        ) : (
          /* ========== 语音录音模式 ========== */
          <div className="flex flex-col items-center gap-3">
            {/* Recording Status */}
            {isRecording && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-3 rounded-full px-4 py-2" style={{ backgroundColor: "rgba(27,63,145,0.05)" }}
              >
                <div className="flex items-end gap-0.5 h-5">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <motion.div
                      key={i}
                      className="w-0.5 rounded-full" style={{ backgroundColor: "#1B3F91" }}
                      animate={{ height: [3, Math.random() * 18 + 3, 3] }}
                      transition={{
                        duration: 0.4 + Math.random() * 0.3,
                        repeat: Infinity,
                        delay: i * 0.08,
                      }}
                    />
                  ))}
                </div>
                <span className="text-sm font-medium" style={{ color: "#1B3F91" }}>
                  {recordingTime}s
                </span>
                <div className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: "#1B3F91" }} />
              </motion.div>
            )}

            {isAiSpeaking && !isRecording && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center gap-2 rounded-full px-4 py-2" style={{ backgroundColor: "rgba(131,186,18,0.10)" }}
              >
                <Volume2 className="w-4 h-4" style={{ color: "#6a9a10" }} />
                <span className="text-sm font-medium" style={{ color: "#6a9a10" }}>AI正在说话，请仔细听...</span>
              </motion.div>
            )}

            {/* Mic Button + Switch to Text */}
            <div className="flex items-center gap-4">
              {/* 切换到文字模式 */}
              <button
                onClick={() => setInputMode("text")}
                disabled={isDisabled || isRecording}
                className="w-11 h-11 rounded-full flex items-center justify-center border border-border/60 bg-white hover:bg-muted/50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                title="切换到文字模式"
              >
                <Keyboard className="w-5 h-5 text-muted-foreground" />
              </button>

              {/* Mic Button */}
              <div className="relative">
                {isRecording && (
                  <>
                    <div className="absolute inset-[-4px] rounded-full animate-pulse-ring" style={{ backgroundColor: "rgba(27,63,145,0.15)" }} />
                    <div className="absolute inset-[-12px] rounded-full animate-pulse-ring" style={{ animationDelay: "0.5s", backgroundColor: "rgba(27,63,145,0.08)" }} />
                  </>
                )}
                <button
                  onMouseDown={startRecording}
                  onMouseUp={stopRecording}
                  onMouseLeave={stopRecording}
                  onTouchStart={(e) => { e.preventDefault(); startRecording(); }}
                  onTouchEnd={(e) => { e.preventDefault(); stopRecording(); }}
                  onTouchCancel={(e) => { e.preventDefault(); stopRecording(); }}
                  disabled={isDisabled}
                  style={isRecording ? { background: "linear-gradient(135deg, #1B3F91, #2B5BA0)", boxShadow: "0 8px 25px rgba(27,63,145,0.4)" } : !isDisabled ? { background: "linear-gradient(135deg, #1B3F91, #2B5BA0)", boxShadow: "0 6px 20px rgba(27,63,145,0.3)" } : {}}
                  className={`relative w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
                    isRecording
                      ? "text-white scale-110 shadow-xl"
                      : isDisabled
                      ? "bg-muted text-warm-gray"
                      : "text-white shadow-lg active:scale-95"
                  }`}
                >
                  {isRecording ? (
                    <Square className="w-6 h-6 fill-white" />
                  ) : (
                    <Mic className="w-7 h-7" />
                  )}
                </button>
              </div>

              {/* 占位保持居中 */}
              <div className="w-11 h-11" />
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
            {!isRecording && !isDisabled && questionNumber > 0 && (
              <button
                onClick={handleCantUnderstand}
                className="flex items-center gap-1.5 text-xs transition-colors mt-1 hover:opacity-80" style={{ color: "#8a95a5" }}
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

function UserBubble({ text, inputMode }: { text: string; inputMode?: InputMode }) {
  return (
    <div className="flex items-start gap-2.5 max-w-[85%] ml-auto flex-row-reverse">
      <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 shadow-sm" style={{ background: "linear-gradient(135deg, #1B3F91, #2B5BA0)" }}>
        {inputMode === "text" ? (
          <MessageSquare className="w-4 h-4 text-white" />
        ) : (
          <Mic className="w-4 h-4 text-white" />
        )}
      </div>
      <div className="text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-sm" style={{ background: "linear-gradient(135deg, #1B3F91, #2B5BA0)" }}>
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

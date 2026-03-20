/**
 * 途正英语 - 后台管理：口语训练营群二维码管理
 * 管理员为每个等级(0-3)配置对应的口语营群二维码
 * 使用tRPC调用后端接口
 */
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  ImagePlus,
  Loader2,
  QrCode,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";

const LOGO_TEXT =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663267704571/C9Jj6DH7b3EoSGBmrxJBc6/tuzheng-logo-transparent_4a301562.png";

/** 等级配置 */
const LEVEL_OPTIONS = [
  { level: 0, name: "零级口语营", label: "零基础 / 小学水平", color: "#8a95a5" },
  { level: 1, name: "一级口语营", label: "初中水平", color: "#1B3F91" },
  { level: 2, name: "二级口语营", label: "高中水平", color: "#83BA12" },
  { level: 3, name: "三级口语营", label: "高中以上水平", color: "#2B5BA0" },
];

interface QrcodeFormData {
  level: number;
  levelName: string;
  qrcodeUrl: string;
  groupName: string;
  enabled: boolean;
  previewUrl?: string; // 本地预览
}

export default function AdminQrcodes() {
  const [, navigate] = useLocation();
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // tRPC queries
  const { data: qrcodes, isLoading, refetch } = trpc.qrcode.list.useQuery();
  const upsertMutation = trpc.qrcode.upsert.useMutation({
    onSuccess: () => {
      toast.success("保存成功");
      refetch();
    },
    onError: (err) => toast.error(`保存失败: ${err.message}`),
  });
  const deleteMutation = trpc.qrcode.delete.useMutation({
    onSuccess: () => {
      toast.success("删除成功");
      refetch();
    },
    onError: (err) => toast.error(`删除失败: ${err.message}`),
  });
  const toggleMutation = trpc.qrcode.toggleEnabled.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => toast.error(`操作失败: ${err.message}`),
  });
  const uploadMutation = trpc.qrcode.uploadQrcode.useMutation({
    onError: (err) => toast.error(`上传失败: ${err.message}`),
  });

  // 表单状态 - 每个等级一个
  const [forms, setForms] = useState<Record<number, QrcodeFormData>>({});

  // 初始化表单数据
  const getFormData = useCallback(
    (level: number): QrcodeFormData => {
      if (forms[level]) return forms[level];
      const existing = qrcodes?.find((q) => q.level === level);
      const option = LEVEL_OPTIONS.find((o) => o.level === level)!;
      return {
        level,
        levelName: existing?.levelName || option.name,
        qrcodeUrl: existing?.qrcodeUrl || "",
        groupName: existing?.groupName || "",
        enabled: existing ? existing.enabled === 1 : true,
        previewUrl: existing?.qrcodeUrl || undefined,
      };
    },
    [forms, qrcodes]
  );

  const updateForm = (level: number, updates: Partial<QrcodeFormData>) => {
    setForms((prev) => ({
      ...prev,
      [level]: { ...getFormData(level), ...updates },
    }));
  };

  /** 处理图片选择 */
  const handleImageSelect = async (level: number, file: File) => {
    // 本地预览
    const previewUrl = URL.createObjectURL(file);
    updateForm(level, { previewUrl });

    // 转base64上传到S3
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(",")[1];
      try {
        const result = await uploadMutation.mutateAsync({
          level,
          base64Data: base64,
          mimeType: file.type || "image/png",
        });
        updateForm(level, { qrcodeUrl: result.url, previewUrl: result.url });
        toast.success("二维码图片上传成功");
      } catch {
        // error handled by mutation
      }
    };
    reader.readAsDataURL(file);
  };

  /** 保存配置 */
  const handleSave = async (level: number) => {
    const form = getFormData(level);
    if (!form.qrcodeUrl) {
      toast.error("请先上传群二维码图片");
      return;
    }
    await upsertMutation.mutateAsync({
      level: form.level,
      levelName: form.levelName,
      qrcodeUrl: form.qrcodeUrl,
      groupName: form.groupName || undefined,
      enabled: form.enabled ? 1 : 0,
    });
  };

  /** 删除配置 */
  const handleDelete = async (level: number) => {
    const existing = qrcodes?.find((q) => q.level === level);
    if (!existing) return;
    if (!confirm(`确定删除${existing.levelName}的群二维码配置？`)) return;
    await deleteMutation.mutateAsync({ id: existing.id });
    setForms((prev) => {
      const next = { ...prev };
      delete next[level];
      return next;
    });
  };

  /** 切换启用状态 */
  const handleToggle = async (level: number, enabled: boolean) => {
    const existing = qrcodes?.find((q) => q.level === level);
    if (existing) {
      await toggleMutation.mutateAsync({ id: existing.id, enabled });
    }
    updateForm(level, { enabled });
  };

  if (isLoading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{
          background:
            "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)",
        }}
      >
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: "#1B3F91" }}
        />
      </div>
    );
  }

  return (
    <div
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(160deg, #e8eef8 0%, #f0f4f8 30%, #eef6e8 70%, #f5f8f0 100%)",
      }}
    >
      {/* Header */}
      <div
        className="sticky top-0 z-20 backdrop-blur-xl px-4 py-3 flex items-center gap-3"
        style={{
          backgroundColor: "rgba(255,255,255,0.80)",
          borderBottom: "1px solid rgba(27,63,145,0.08)",
        }}
      >
        <button
          onClick={() => navigate("/")}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-colors"
          style={{ backgroundColor: "rgba(27,63,145,0.06)" }}
        >
          <ArrowLeft className="w-5 h-5" style={{ color: "#1B3F91" }} />
        </button>
        <img src={LOGO_TEXT} alt="途正英语" className="h-5 object-contain" />
        <span
          className="text-sm font-bold ml-auto"
          style={{ color: "#3a4a5a" }}
        >
          群二维码管理
        </span>
      </div>

      {/* Content */}
      <div className="px-4 py-5 space-y-4 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <QrCode className="w-5 h-5" style={{ color: "#1B3F91" }} />
          <h2 className="text-base font-bold" style={{ color: "#1a2340" }}>
            口语训练营群二维码配置
          </h2>
        </div>
        <p className="text-xs mb-4" style={{ color: "#7a8a9a" }}>
          为每个等级配置对应的口语训练营群二维码，用户测评完成后将展示对应等级的群二维码供扫码加入。
        </p>

        {LEVEL_OPTIONS.map((option) => {
          const form = getFormData(option.level);
          const existing = qrcodes?.find((q) => q.level === option.level);
          const isSaving =
            upsertMutation.isPending &&
            upsertMutation.variables?.level === option.level;

          return (
            <Card
              key={option.level}
              className="backdrop-blur-md overflow-hidden"
              style={{
                backgroundColor: "rgba(255,255,255,0.70)",
                border: "1px solid rgba(255,255,255,0.4)",
                boxShadow: "0 4px 20px rgba(27,63,145,0.06)",
              }}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                      style={{ backgroundColor: option.color }}
                    >
                      {option.level}
                    </div>
                    <div>
                      <CardTitle
                        className="text-sm"
                        style={{ color: "#1a2340" }}
                      >
                        {option.name}
                      </CardTitle>
                      <p className="text-xs" style={{ color: "#7a8a9a" }}>
                        {option.label}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {existing && (
                      <Switch
                        checked={form.enabled}
                        onCheckedChange={(checked) =>
                          handleToggle(option.level, checked)
                        }
                      />
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* 群名称 */}
                <div>
                  <Label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "#5a6a7a" }}
                  >
                    群名称（选填）
                  </Label>
                  <Input
                    placeholder={`如：途正英语${option.name}`}
                    value={form.groupName}
                    onChange={(e) =>
                      updateForm(option.level, { groupName: e.target.value })
                    }
                    className="h-9 text-sm"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.6)",
                      borderColor: "rgba(27,63,145,0.12)",
                    }}
                  />
                </div>

                {/* 二维码图片上传 */}
                <div>
                  <Label
                    className="text-xs font-medium mb-1 block"
                    style={{ color: "#5a6a7a" }}
                  >
                    群二维码图片
                  </Label>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    ref={(el) => {
                      fileInputRefs.current[option.level] = el;
                    }}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleImageSelect(option.level, file);
                    }}
                  />

                  {form.previewUrl || form.qrcodeUrl ? (
                    <div className="flex items-start gap-3">
                      <div
                        className="w-32 h-32 rounded-xl overflow-hidden flex-shrink-0"
                        style={{
                          border: "2px dashed rgba(27,63,145,0.15)",
                          backgroundColor: "rgba(255,255,255,0.5)",
                        }}
                      >
                        <img
                          src={form.previewUrl || form.qrcodeUrl}
                          alt="群二维码"
                          className="w-full h-full object-contain p-1"
                        />
                      </div>
                      <div className="flex flex-col gap-2 pt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            fileInputRefs.current[option.level]?.click()
                          }
                          disabled={uploadMutation.isPending}
                          className="text-xs"
                          style={{
                            borderColor: "rgba(27,63,145,0.15)",
                            color: "#3a4a5a",
                          }}
                        >
                          {uploadMutation.isPending ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Upload className="w-3 h-3 mr-1" />
                          )}
                          更换图片
                        </Button>
                        {existing && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(option.level)}
                            disabled={deleteMutation.isPending}
                            className="text-xs text-red-500 hover:text-red-600"
                            style={{ borderColor: "rgba(239,68,68,0.2)" }}
                          >
                            <Trash2 className="w-3 h-3 mr-1" />
                            删除配置
                          </Button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        fileInputRefs.current[option.level]?.click()
                      }
                      className="w-full h-28 rounded-xl flex flex-col items-center justify-center gap-2 transition-all hover:shadow-md"
                      style={{
                        border: "2px dashed rgba(27,63,145,0.15)",
                        backgroundColor: "rgba(255,255,255,0.4)",
                      }}
                    >
                      <ImagePlus
                        className="w-8 h-8"
                        style={{ color: "#adb5bd" }}
                      />
                      <span className="text-xs" style={{ color: "#7a8a9a" }}>
                        点击上传群二维码图片
                      </span>
                    </button>
                  )}
                </div>

                {/* 保存按钮 */}
                <Button
                  onClick={() => handleSave(option.level)}
                  disabled={isSaving || !form.qrcodeUrl}
                  className="w-full h-10 text-white text-sm font-medium"
                  style={{
                    background:
                      "linear-gradient(135deg, #1B3F91 0%, #2B5BA0 100%)",
                    opacity: !form.qrcodeUrl ? 0.5 : 1,
                  }}
                >
                  {isSaving ? (
                    <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-1" />
                  )}
                  {existing ? "更新配置" : "保存配置"}
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

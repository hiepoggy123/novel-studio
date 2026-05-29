"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LineEditor } from "@/components/ui/line-editor";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { StepModelConfig, WritingAgentRole } from "@/lib/db";
import {
  getOrCreateWritingSettings,
  updateWritingSettings,
  useAIModels,
  useApiInferenceProviders,
  useClearWebGpuStepModel,
  useWritingSettings,
} from "@/lib/hooks";
import { useDebouncedCallback } from "@/lib/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { getDefaultPrompt } from "@/lib/writing/prompts";
import {
  BookOpenIcon,
  CompassIcon,
  ListTreeIcon,
  PenLineIcon,
  RotateCcwIcon,
  SearchCheckIcon,
  Settings2Icon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useCallback, useState } from "react";

const SMART_WRITER_MIN_STEPS = 5;
const SMART_WRITER_MAX_STEPS = 20;

function clampSmartWriterSteps(n: number): number {
  return Math.min(
    SMART_WRITER_MAX_STEPS,
    Math.max(SMART_WRITER_MIN_STEPS, Math.round(n)),
  );
}

const AGENT_ROLES: {
  role: ConfigurableRole;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    role: "plan",
    label: "Kế hoạch",
    description: "Phân tích cốt truyện và đề xuất hướng đi",
    icon: CompassIcon,
  },
  {
    role: "outline",
    label: "Giàn ý",
    description: "Tạo cấu trúc phân cảnh chi tiết",
    icon: ListTreeIcon,
  },
  {
    role: "writer",
    label: "Viết truyện",
    description: "Viết nội dung chương hoàn chỉnh",
    icon: PenLineIcon,
  },
  {
    role: "normalize",
    label: "Chuẩn hóa",
    description: "Chuẩn hóa độ dài và định dạng",
    icon: BookOpenIcon,
  },
  {
    role: "observe",
    label: "Quan sát",
    description: "Phân tích thay đổi trạng thái truyện",
    icon: SearchCheckIcon,
  },
  {
    role: "audit",
    label: "Đánh giá",
    description: "Đánh giá chất lượng chương",
    icon: SearchCheckIcon,
  },
  {
    role: "revise",
    label: "Viết lại",
    description: "Viết lại chương dựa trên đánh giá",
    icon: PenLineIcon,
  },
];

type ConfigurableRole = Exclude<WritingAgentRole, "commit">;

function StepModelPicker({
  novelId,
  role,
}: {
  novelId: string;
  role: ConfigurableRole;
}) {
  const settings = useWritingSettings(novelId);
  const modelKey = `${role}Model` as keyof typeof settings;
  const value = settings?.[modelKey] as StepModelConfig | undefined;
  const providers = useApiInferenceProviders();
  const selectedProviderId = value?.providerId ?? "";
  const models = useAIModels(selectedProviderId || undefined);

  const clearWebGpu = useCallback(() => {
    updateWritingSettings(novelId, { [modelKey]: undefined });
  }, [novelId, modelKey]);
  useClearWebGpuStepModel(value?.providerId, clearWebGpu);

  const handleProviderChange = (providerId: string) => {
    if (!providerId) {
      updateWritingSettings(novelId, { [modelKey]: undefined });
      return;
    }
    updateWritingSettings(novelId, {
      [modelKey]: { providerId, modelId: "" },
    });
  };

  const handleModelChange = (modelId: string) => {
    if (!selectedProviderId) return;
    updateWritingSettings(novelId, {
      [modelKey]: { providerId: selectedProviderId, modelId },
    });
  };

  return (
    <div className="grid gap-2 grid-cols-2">
      <div>
        <Label className="text-xs text-muted-foreground">Nhà cung cấp</Label>
        <NativeSelect
          className="mt-1 w-full"
          value={selectedProviderId}
          onChange={(e) => handleProviderChange(e.target.value)}
        >
          <NativeSelectOption value="">Mặc định (Chat)</NativeSelectOption>
          {providers?.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div>
        <Label className="text-xs text-muted-foreground">Mô hình</Label>
        <NativeSelect
          className="mt-1 w-full"
          value={value?.modelId ?? ""}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={!selectedProviderId}
        >
          <NativeSelectOption value="">
            {selectedProviderId ? "Chọn mô hình" : "—"}
          </NativeSelectOption>
          {models?.map((m) => (
            <NativeSelectOption key={m.id} value={m.modelId}>
              {m.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
    </div>
  );
}

function PromptEditorField({
  value,
  isCustom,
  onSave,
  onReset,
}: {
  value: string;
  isCustom: boolean;
  onSave: (v: string) => void;
  onReset: () => void;
}) {
  const [text, setText] = useState(value);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-xs font-medium">System Prompt</Label>
        {isCustom && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 text-xs text-muted-foreground"
            onClick={onReset}
          >
            <RotateCcwIcon className="h-3 w-3 mr-1" />
            Khôi phục mặc định
          </Button>
        )}
      </div>
      <LineEditor
        value={text}
        onChange={(v) => {
          setText(v);
          onSave(v);
        }}
        className="h-[300px]"
        contentFont="text-xs leading-5"
        gutterFont="text-xs leading-5"
        xmlColors
      />
      {!isCustom && (
        <p className="text-xs text-muted-foreground">
          Đây là prompt mặc định. Chỉnh sửa trực tiếp để tùy biến.
        </p>
      )}
    </div>
  );
}

export function WritingSettingsDialog({
  novelId,
  open,
  onOpenChangeAction,
}: {
  novelId: string;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
}) {
  const settings = useWritingSettings(novelId);
  const chapterLength = settings?.chapterLength ?? 3000;
  const smartWriterMaxToolSteps = settings?.smartWriterMaxToolSteps;
  const noAskingMode = settings?.noAskingMode ?? false;
  const [activeRole, setActiveRole] = useState<ConfigurableRole>("plan");

  const sliderSteps = clampSmartWriterSteps(smartWriterMaxToolSteps ?? 12);

  if (open && !settings) {
    getOrCreateWritingSettings(novelId);
  }

  const debouncedPromptChange = useDebouncedCallback(
    async (role: ConfigurableRole, value: string) => {
      const key = `${role}Prompt` as keyof Parameters<typeof updateWritingSettings>[1];
      const defaultPrompt = getDefaultPrompt(role);
      await updateWritingSettings(novelId, {
        [key]: value === defaultPrompt ? undefined : value,
      });
    },
    500,
  );

  const handleLengthChange = async (value: number) => {
    await updateWritingSettings(novelId, { chapterLength: value });
  };

  const handleSmartMaxStepsChange = async (value: number) => {
    await updateWritingSettings(novelId, {
      smartWriterMaxToolSteps: clampSmartWriterSteps(value),
    });
  };

  const handleNoAskingChange = async (checked: boolean) => {
    await updateWritingSettings(novelId, { noAskingMode: checked });
  };

  const handleResetPrompt = async (role: ConfigurableRole) => {
    const key = `${role}Prompt` as keyof Parameters<typeof updateWritingSettings>[1];
    await updateWritingSettings(novelId, { [key]: undefined });
  };

  const getPromptValue = (role: ConfigurableRole): string => {
    const key = `${role}Prompt` as keyof typeof settings;
    const custom = settings?.[key] as string | undefined;
    return custom || getDefaultPrompt(role);
  };

  const isCustomPrompt = (role: ConfigurableRole): boolean => {
    const key = `${role}Prompt` as keyof typeof settings;
    return !!(settings?.[key] as string | undefined);
  };

  const activeConfig = AGENT_ROLES.find((r) => r.role === activeRole)!;

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="sm:max-w-3xl max-h-[85vh] p-0 gap-0 overflow-hidden flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0">
          <DialogTitle>Cài đặt viết truyện</DialogTitle>
          <DialogDescription>
            Thiết lập hành vi pipeline và độ dài chương cũng như cấu hình AI
            từng bước.
          </DialogDescription>
        </DialogHeader>

        <Tabs
          defaultValue="general"
          className="flex min-h-0 flex-1 flex-col gap-0"
        >
          <TabsList
            variant="line"
            className="mx-6 mb-0 h-10 w-auto shrink-0 justify-start rounded-none border-b border-border bg-transparent p-0 gap-0"
          >
            <TabsTrigger
              value="general"
              className="rounded-none border-0 shadow-none data-active:shadow-none px-4"
            >
              <Settings2Icon className="size-4" />
              Chung
            </TabsTrigger>
            <TabsTrigger
              value="steps"
              className="rounded-none border-0 shadow-none data-active:shadow-none px-4"
            >
              <SlidersHorizontalIcon className="size-4" />
              Mô hình &amp; prompt
            </TabsTrigger>
          </TabsList>

          <TabsContent
            value="general"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
          >
            <ScrollArea className="h-[min(70vh,calc(85vh-10rem))]">
              <div className="space-y-6 px-6 py-4 pb-6">
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Độ dài chương</Label>
                  <div className="flex flex-wrap items-center gap-3">
                    <Input
                      type="number"
                      value={chapterLength}
                      onChange={(e) =>
                        handleLengthChange(Number(e.target.value) || 3000)
                      }
                      min={500}
                      max={10000}
                      step={500}
                      className="w-28"
                    />
                    <span className="text-xs text-muted-foreground">
                      từ / chương
                    </span>
                  </div>
                </div>

                <div className="space-y-4 rounded-lg border bg-muted/20 p-4">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Hành vi pipeline
                  </p>
                  <div className="flex items-start gap-3">
                    <Switch
                      id="no-asking"
                      className="mt-0.5"
                      checked={noAskingMode}
                      onCheckedChange={handleNoAskingChange}
                    />
                    <div className="space-y-0.5">
                      <Label
                        htmlFor="no-asking"
                        className="text-sm cursor-pointer font-medium leading-snug"
                      >
                        Không hỏi lại
                      </Label>
                      <p className="text-xs text-muted-foreground leading-relaxed">
                        Chạy liền tới khi đánh giá xong; tự chọn hướng theo gợi
                        ý AI. Theo cài đặt hiện tại mỗi bước pipeline.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3 pt-1 border-t border-border/60">
                    <div className="flex items-center justify-between gap-4">
                      <Label className="text-sm font-medium">
                        Giới hạn bước công cụ (bước Viết)
                      </Label>
                      <span className="tabular-nums text-sm font-semibold text-foreground min-w-[2ch] text-right">
                        {sliderSteps}
                      </span>
                    </div>
                    <Slider
                      min={SMART_WRITER_MIN_STEPS}
                      max={SMART_WRITER_MAX_STEPS}
                      step={1}
                      value={[sliderSteps]}
                      onValueChange={(v) => {
                        const n = v[0];
                        if (n != null) void handleSmartMaxStepsChange(n);
                      }}
                      aria-label="Giới hạn bước công cụ"
                    />
                    <p className="text-xs text-muted-foreground">
                      <span className="mr-0.5">
                        {SMART_WRITER_MIN_STEPS}–{SMART_WRITER_MAX_STEPS}
                      </span>
                      vòng gọi công cụ mỗi lần viết.
                    </p>
                  </div>
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent
            value="steps"
            className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden border-t data-[state=inactive]:hidden"
          >
            <div className="flex min-h-0 flex-1">
              <div className="w-48 shrink-0 border-r bg-muted/30">
                <div className="p-2 space-y-0.5">
                  {AGENT_ROLES.map(({ role, label, icon: Icon }) => {
                    const hasCustom = isCustomPrompt(role);
                    const hasModel = !!(settings?.[`${role}Model` as const] as
                      | StepModelConfig
                      | undefined);
                    return (
                      <button
                        key={role}
                        type="button"
                        onClick={() => setActiveRole(role)}
                        className={cn(
                          "flex items-center gap-2.5 w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                          activeRole === role
                            ? "bg-background shadow-sm font-medium"
                            : "hover:bg-background/60 text-muted-foreground",
                        )}
                      >
                        <Icon className="h-4 w-4 shrink-0" />
                        <span className="flex-1 truncate">{label}</span>
                        {(hasCustom || hasModel) && (
                          <span className="h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <ScrollArea className="flex-1 h-[min(70vh,calc(85vh-10rem))]">
                <div className="p-5 space-y-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <activeConfig.icon className="h-4 w-4" />
                      <h3 className="text-sm font-medium">
                        {activeConfig.label}
                      </h3>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {activeConfig.description}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium">Mô hình AI</Label>
                    <StepModelPicker novelId={novelId} role={activeRole} />
                  </div>

                  <PromptEditorField
                    key={activeRole}
                    value={getPromptValue(activeRole)}
                    isCustom={isCustomPrompt(activeRole)}
                    onSave={(v) => debouncedPromptChange.run(activeRole, v)}
                    onReset={() => void handleResetPrompt(activeRole)}
                  />
                </div>
              </ScrollArea>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

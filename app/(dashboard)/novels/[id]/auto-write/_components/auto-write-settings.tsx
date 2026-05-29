"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  getOrCreateWritingSettings,
  updateWritingSettings,
  useAIModels,
  useApiInferenceProviders,
  useWritingSettings,
} from "@/lib/hooks";
import type { StepModelConfig, WritingAgentRole } from "@/lib/db";

const SCORE_MIN = 0;
const SCORE_MAX = 10;
const RETRIES_MIN = 0;
const RETRIES_MAX = 5;

type SettingsRole = Exclude<WritingAgentRole, "outline" | "writer" | "revise" | "commit">;

const STEP_ROLES: { role: SettingsRole; label: string }[] = [
  { role: "plan", label: "Kế hoạch" },
  { role: "normalize", label: "Chuẩn hóa" },
  { role: "observe", label: "Quan sát" },
  { role: "audit", label: "Đánh giá" },
];

function StepModelRow({
  novelId,
  role,
  label,
}: {
  novelId: string;
  role: SettingsRole;
  label: string;
}) {
  const settings = useWritingSettings(novelId);
  const modelKey = `${role}Model` as keyof typeof settings;
  const value = settings?.[modelKey] as StepModelConfig | undefined;
  const providers = useApiInferenceProviders();
  const selectedProviderId = value?.providerId ?? "";
  const models = useAIModels(selectedProviderId || undefined);

  function handleProviderChange(providerId: string) {
    if (!providerId) {
      void updateWritingSettings(novelId, { [modelKey]: undefined });
      return;
    }
    void updateWritingSettings(novelId, {
      [modelKey]: { providerId, modelId: "" },
    });
  }

  function handleModelChange(modelId: string) {
    if (!selectedProviderId) return;
    void updateWritingSettings(novelId, {
      [modelKey]: { providerId: selectedProviderId, modelId },
    });
  }

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect
          value={selectedProviderId}
          onChange={(e) => handleProviderChange(e.target.value)}
          className="w-full"
        >
          <NativeSelectOption value="">Mặc định</NativeSelectOption>
          {providers?.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          value={value?.modelId ?? ""}
          onChange={(e) => handleModelChange(e.target.value)}
          disabled={!selectedProviderId}
          className="w-full"
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

export function AutoWriteSettings({ novelId }: { novelId: string }) {
  const settings = useWritingSettings(novelId);

  if (!settings) {
    void getOrCreateWritingSettings(novelId);
    return null;
  }

  const noAskingMode = settings.noAskingMode ?? false;
  const enablePolish = settings.enablePolish ?? false;
  const minScore = settings.minScoreToAutoAccept ?? 7;
  const maxRetries = settings.maxAutoRetries ?? 2;
  const chapterLength = settings.chapterLength ?? 3000;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-6">
        <section className="space-y-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Độ dài chương
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="number"
              value={chapterLength}
              min={500}
              max={10000}
              step={500}
              className="w-28 h-8 text-xs"
              onChange={(e) =>
                void updateWritingSettings(novelId, {
                  chapterLength: Number(e.target.value) || 3000,
                })
              }
            />
            <span className="text-xs text-muted-foreground">từ / chương</span>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Hành vi pipeline
          </p>

          <div className="flex items-start gap-3">
            <Switch
              id="no-asking"
              className="mt-0.5"
              checked={noAskingMode}
              onCheckedChange={(v) =>
                void updateWritingSettings(novelId, { noAskingMode: v })
              }
            />
            <div className="space-y-0.5">
              <Label htmlFor="no-asking" className="text-sm cursor-pointer font-medium">
                Không hỏi lại (hands-free)
              </Label>
              <p className="text-xs text-muted-foreground">
                Tự chọn hướng đi và tiếp tục đến bước Đánh giá.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 pt-1 border-t border-border/60">
            <Switch
              id="enable-polish"
              className="mt-0.5"
              checked={enablePolish}
              onCheckedChange={(v) =>
                void updateWritingSettings(novelId, { enablePolish: v })
              }
            />
            <div className="space-y-0.5">
              <Label htmlFor="enable-polish" className="text-sm cursor-pointer font-medium">
                Bật bước đánh bóng (polish)
              </Label>
              <p className="text-xs text-muted-foreground">
                Chạy thêm bước chỉnh văn phong sau khi viết xong.
              </p>
            </div>
          </div>
        </section>

        <section className="space-y-3 rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Ngưỡng tự động
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Điểm tối thiểu tự chấp nhận</Label>
              <span className="tabular-nums text-sm font-semibold min-w-[2ch] text-right">
                {minScore}
              </span>
            </div>
            <Slider
              min={SCORE_MIN}
              max={SCORE_MAX}
              step={1}
              value={[minScore]}
              onValueChange={(v) => {
                const n = v[0];
                if (n != null)
                  void updateWritingSettings(novelId, { minScoreToAutoAccept: n });
              }}
              aria-label="Điểm tự chấp nhận"
            />
            <p className="text-xs text-muted-foreground">
              Hands-free: tự lưu chương khi điểm đánh giá ≥ {minScore}/10.
            </p>
          </div>

          <div className="space-y-2 pt-1 border-t border-border/60">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium">Số lần thử lại tối đa</Label>
              <span className="tabular-nums text-sm font-semibold min-w-[2ch] text-right">
                {maxRetries}
              </span>
            </div>
            <Slider
              min={RETRIES_MIN}
              max={RETRIES_MAX}
              step={1}
              value={[maxRetries]}
              onValueChange={(v) => {
                const n = v[0];
                if (n != null)
                  void updateWritingSettings(novelId, { maxAutoRetries: n });
              }}
              aria-label="Số lần thử lại"
            />
          </div>
        </section>

        <section className="space-y-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Mô hình AI từng bước
          </p>
          {STEP_ROLES.map(({ role, label }) => (
            <StepModelRow key={role} novelId={novelId} role={role} label={label} />
          ))}
        </section>
      </div>
    </ScrollArea>
  );
}

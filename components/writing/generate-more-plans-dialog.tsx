"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { LineEditor } from "@/components/ui/line-editor";
import type { StepModelConfig } from "@/lib/db";
import {
  getOrCreateWritingSettings,
  updateWritingSettings,
  useAIModels,
  useApiInferenceProviders,
  useClearWebGpuStepModel,
  useWritingSettings,
} from "@/lib/hooks";
import { useDebouncedCallback } from "@/lib/hooks/use-debounce";
import { useWritingPipelineStore } from "@/lib/stores/writing-pipeline";
import { getDefaultPrompt } from "@/lib/writing/prompts";
import { ChevronDownIcon, Loader2Icon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const USER_KEY = "generate-more-plans";

function ModelRow({
  novelId,
  role,
  label,
}: {
  novelId: string;
  role: "outline" | "writer";
  label: string;
}) {
  const settings = useWritingSettings(novelId);
  const modelKey = `${role}Model` as const;
  const value = settings?.[modelKey] as StepModelConfig | undefined;
  const providers = useApiInferenceProviders();
  const selectedProviderId = value?.providerId ?? "";
  const models = useAIModels(selectedProviderId || undefined);

  const ensureAndUpdate = async (data: Record<string, unknown>) => {
    await getOrCreateWritingSettings(novelId);
    await updateWritingSettings(novelId, data);
  };

  const clearWebGpu = useCallback(() => {
    void (async () => {
      await getOrCreateWritingSettings(novelId);
      await updateWritingSettings(novelId, { [modelKey]: undefined });
    })();
  }, [novelId, modelKey]);
  useClearWebGpuStepModel(value?.providerId, clearWebGpu);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect
          className="w-full text-xs"
          value={selectedProviderId}
          onChange={(e) => {
            const pid = e.target.value;
            ensureAndUpdate({
              [modelKey]: pid ? { providerId: pid, modelId: "" } : undefined,
            });
          }}
        >
          <NativeSelectOption value="">Mặc định</NativeSelectOption>
          {providers?.map((p) => (
            <NativeSelectOption key={p.id} value={p.id}>
              {p.name}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <NativeSelect
          className="w-full text-xs"
          value={value?.modelId ?? ""}
          disabled={!selectedProviderId}
          onChange={(e) => {
            if (!selectedProviderId) return;
            ensureAndUpdate({
              [modelKey]: {
                providerId: selectedProviderId,
                modelId: e.target.value,
              },
            });
          }}
        >
          <NativeSelectOption value="">
            {selectedProviderId ? "Chọn model" : "—"}
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

function PromptCollapsible({
  novelId,
  role,
  title,
}: {
  novelId: string;
  role: "outline" | "writer";
  title: string;
}) {
  const settings = useWritingSettings(novelId);
  const promptKey = `${role}Prompt` as const;
  const defaultPrompt = getDefaultPrompt(role);
  const storedPrompt = (settings?.[promptKey] as string | undefined) ?? "";
  const isCustom = !!storedPrompt;
  const effectivePrompt = storedPrompt || defaultPrompt;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(effectivePrompt);

  useEffect(() => {
    setDraft(effectivePrompt);
  }, [effectivePrompt]);

  const debouncedPromptChange = useDebouncedCallback(
    async (value: string) => {
      await getOrCreateWritingSettings(novelId);
      await updateWritingSettings(novelId, {
        [promptKey]: value === defaultPrompt ? undefined : value,
      });
    },
    500,
  );

  const handleChange = (value: string) => {
    setDraft(value);
    debouncedPromptChange.run(value);
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium hover:bg-muted/50">
        <span>{title}</span>
        <ChevronDownIcon
          className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-2 pt-2">
        <div className="flex justify-end">
          {isCustom && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                debouncedPromptChange.cancel();
                void updateWritingSettings(novelId, {
                  [promptKey]: undefined,
                });
              }}
            >
              <RotateCcwIcon className="h-3 w-3 mr-1" />
              Khôi phục mặc định
            </Button>
          )}
        </div>
        <LineEditor
          value={draft}
          onChange={handleChange}
          className="h-[200px]"
          contentFont="text-xs leading-5"
          gutterFont="text-xs leading-5"
          xmlColors
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

export function GenerateMorePlansDialog({
  novelId,
  open,
  onOpenChangeAction,
  onConfirmAction,
  isLoading,
}: {
  novelId: string;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onConfirmAction: (userInstruction: string) => void;
  isLoading: boolean;
}) {
  const instruction = useWritingPipelineStore(
    (s) => s.stepUserInstructions[USER_KEY] ?? "",
  );
  const setStepUserInstruction = useWritingPipelineStore(
    (s) => s.setStepUserInstruction,
  );

  useEffect(() => {
    if (open) void getOrCreateWritingSettings(novelId);
  }, [open, novelId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChangeAction}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Tạo thêm kế hoạch chương</DialogTitle>
          <DialogDescription>
            Cấu hình mô hình và prompt cho bước mạch truyện (outline) và kế
            hoạch chương (writer). Yêu cầu của bạn không được lưu vào DB.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <ModelRow
            novelId={novelId}
            role="outline"
            label="Mô hình — mạch truyện (outline)"
          />
          <ModelRow
            novelId={novelId}
            role="writer"
            label="Mô hình — kế hoạch chương (writer)"
          />

          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Yêu cầu của bạn</Label>
            <LineEditor
              value={instruction}
              onChange={(v) => setStepUserInstruction(USER_KEY, v)}
              placeholder="Ý tưởng cho các chương tiếp theo, nhân vật bắt buộc, v.v."
              className="h-[88px]"
              contentFont="text-sm leading-5"
              gutterFont="text-xs leading-5"
              xmlColors
            />
          </div>

          <PromptCollapsible
            novelId={novelId}
            role="outline"
            title="System prompt — mạch truyện (outline)"
          />
          <PromptCollapsible
            novelId={novelId}
            role="writer"
            title="System prompt — kế hoạch chương (writer)"
          />
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChangeAction(false)}
            disabled={isLoading}
          >
            Hủy
          </Button>
          <Button
            type="button"
            onClick={() => onConfirmAction(instruction)}
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2Icon className="h-4 w-4 mr-2 animate-spin" />
                Đang tạo...
              </>
            ) : (
              "Tạo thêm"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

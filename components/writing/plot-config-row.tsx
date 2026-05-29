"use client";

import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { LineEditor } from "@/components/ui/line-editor";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
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
import { DEFAULT_PLOT_PROMPT } from "@/lib/writing/prompts";
import { ChevronDownIcon, RotateCcwIcon } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function PlotModelRow({ novelId }: { novelId: string }) {
  const settings = useWritingSettings(novelId);
  const value = settings?.plotModel as StepModelConfig | undefined;
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
      await updateWritingSettings(novelId, { plotModel: undefined });
    })();
  }, [novelId]);
  useClearWebGpuStepModel(value?.providerId, clearWebGpu);

  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">Mô hình — tạo cốt truyện</Label>
      <div className="grid grid-cols-2 gap-2">
        <NativeSelect
          className="w-full text-xs"
          value={selectedProviderId}
          onChange={(e) => {
            const pid = e.target.value;
            ensureAndUpdate({
              plotModel: pid ? { providerId: pid, modelId: "" } : undefined,
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
              plotModel: {
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

export function PlotPromptCollapsible({ novelId }: { novelId: string }) {
  const settings = useWritingSettings(novelId);
  const storedPrompt = settings?.plotPrompt ?? "";
  const isCustom = !!storedPrompt;
  const effectivePrompt = storedPrompt || DEFAULT_PLOT_PROMPT;
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(effectivePrompt);

  useEffect(() => {
    setDraft(effectivePrompt);
  }, [effectivePrompt]);

  const debouncedChange = useDebouncedCallback(async (value: string) => {
    await getOrCreateWritingSettings(novelId);
    await updateWritingSettings(novelId, {
      plotPrompt: value === DEFAULT_PLOT_PROMPT ? undefined : value,
    });
  }, 500);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium hover:bg-muted/50">
        <span>System prompt — tạo cốt truyện</span>
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
                debouncedChange.cancel();
                void updateWritingSettings(novelId, { plotPrompt: undefined });
              }}
            >
              <RotateCcwIcon className="h-3 w-3 mr-1" />
              Khôi phục mặc định
            </Button>
          )}
        </div>
        <LineEditor
          value={draft}
          onChange={(v) => {
            setDraft(v);
            debouncedChange.run(v);
          }}
          className="h-[200px]"
          contentFont="text-xs leading-5"
          gutterFont="text-xs leading-5"
          xmlColors
        />
      </CollapsibleContent>
    </Collapsible>
  );
}

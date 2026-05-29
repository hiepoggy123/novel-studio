"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { WritingAgentRole } from "@/lib/db";
import {
  createChapterPlan,
  getNextChapterOrder,
  useActiveSession,
  useChapterPlans,
  useCharacters,
  useNovel,
  usePlotArcs,
  useSessionByPlan,
  useStepResults,
  useStoryState,
} from "@/lib/hooks";
import { useWritingPipelineStore } from "@/lib/stores/writing-pipeline";
import { repairSessionIfWriterOutputEmpty } from "@/lib/writing";
import type { PlannerAgentOutput } from "@/lib/writing/agents/planner-agent";
import type { OutlineAgentOutput } from "@/lib/writing/types";
import {
  ArrowLeftIcon,
  DatabaseIcon,
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SettingsIcon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { GenerateCharactersDialog } from "@/components/novel/generate-characters-dialog";
import { EditChapterPlanDialog } from "@/components/writing/edit-chapter-plan-dialog";
import { GenerateMorePlansDialog } from "@/components/writing/generate-more-plans-dialog";
import { IdeaForm, type IdeaFormData } from "@/components/writing/idea-form";
import { NovelSetup } from "@/components/writing/novel-setup";
import { SetupWizard } from "@/components/writing/setup-wizard";
import { SyncEntitiesButton } from "@/components/writing/sync-entities-button";
import { WritingSettingsDialog } from "@/components/writing/writing-settings-dialog";

import { BootstrapPanel } from "./_components/bootstrap-panel";
import { ChapterPlanSidebar } from "./_components/chapter-plan-sidebar";
import { ContentTabPanel } from "./_components/content-tab-panel";
import { ObserveTabPanel } from "./_components/observe-tab-panel";
import { OutlineTabPanel } from "./_components/outline-tab-panel";
import { PipelineStepsPanel } from "./_components/pipeline-steps";
import { ReviewTabPanel } from "./_components/review-tab-panel";
import { StatePanel } from "./_components/state-panel";
import { usePipelineControls } from "./_components/use-pipeline-controls";

type PageMode = "empty" | "wizard" | "dashboard" | "pipeline";
type ActiveTab =
  | "pipeline"
  | "outline"
  | "content"
  | "observe"
  | "review"
  | "state";

const STEP_PANEL_MAP: Record<
  WritingAgentRole,
  "pipeline" | "outline" | "content" | "observe" | "review"
> = {
  plan: "pipeline",
  outline: "outline",
  writer: "content",
  normalize: "content",
  observe: "observe",
  audit: "review",
  revise: "content",
  commit: "observe",
};

export default function AutoWritePage() {
  const { id: novelId } = useParams<{ id: string }>();
  const novel = useNovel(novelId);
  const chapterPlans = useChapterPlans(novelId);
  const characters = useCharacters(novelId);
  const plotArcs = usePlotArcs(novelId);
  const latestSession = useActiveSession(novelId);
  const storyState = useStoryState(novelId);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);

  const autoSelectedPlanId = useMemo(() => {
    if (selectedPlanId) return selectedPlanId;
    if (latestSession?.chapterPlanId) return latestSession.chapterPlanId;
    const next = chapterPlans?.find((p) => p.status === "planned");
    return next?.id ?? chapterPlans?.[0]?.id ?? null;
  }, [selectedPlanId, latestSession?.chapterPlanId, chapterPlans]);

  const planSession = useSessionByPlan(autoSelectedPlanId ?? undefined);
  const activeSession = autoSelectedPlanId ? planSession : latestSession;
  const stepResults = useStepResults(activeSession?.id);

  const scrollClass = "h-[calc(100dvh-144px)] min-h-[240px] w-full";

  const {
    isRunning,
    activePanel,
    setActivePanel,
    pausePipeline,
    cancelPipeline,
  } = useWritingPipelineStore();

  const [activeTab, setActiveTab] = useState<ActiveTab>("pipeline");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshSessionOpen, setRefreshSessionOpen] = useState(false);
  const [staleWarning, setStaleWarning] = useState(false);
  const [ideaData, setIdeaData] = useState<IdeaFormData | null>(null);
  const [modeOverride, setModeOverride] = useState<PageMode | null>(null);
  const [generateMorePlansOpen, setGenerateMorePlansOpen] = useState(false);
  const [generateCharsOpen, setGenerateCharsOpen] = useState(false);
  const [editPlanId, setEditPlanId] = useState<string | null>(null);

  const hasWorld = !!(novel?.worldOverview || novel?.factions?.length);
  const hasCharacters = (characters?.length ?? 0) > 0;
  const hasPlotArcs = (plotArcs?.length ?? 0) > 0;
  const hasChapterPlans = (chapterPlans?.length ?? 0) > 0;

  const autoMode = useMemo((): PageMode => {
    if (hasChapterPlans && hasPlotArcs) return "pipeline";
    if (hasWorld || hasCharacters) return "dashboard";
    return "empty";
  }, [hasChapterPlans, hasPlotArcs, hasWorld, hasCharacters]);

  const mode = modeOverride ?? autoMode;

  const storyStateLoaded = chapterPlans !== undefined;
  const bootstrapReady =
    storyStateLoaded &&
    storyState != null &&
    storyState.bootstrapComplete === true;

  useEffect(() => {
    if (hasChapterPlans && hasPlotArcs && modeOverride !== "pipeline") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setModeOverride(null);
    }
  }, [hasChapterPlans, hasPlotArcs, modeOverride]);

  useEffect(() => {
    return () => {
      cancelPipeline();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!activeSession?.id) return;
    void repairSessionIfWriterOutputEmpty(activeSession.id);
  }, [activeSession?.id]);

  useEffect(() => {
    if (activePanel !== activeTab && activeTab !== "state") {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTab(activePanel);
    }
  }, [activePanel]); // eslint-disable-line react-hooks/exhaustive-deps

  const resultMap = useMemo(
    () => new Map(stepResults?.map((r) => [r.role, r]) ?? []),
    [stepResults],
  );

  const planOutput = useMemo((): PlannerAgentOutput | null => {
    const raw = resultMap.get("plan")?.output;
    if (!raw) return null;
    try {
      return JSON.parse(raw) as PlannerAgentOutput;
    } catch {
      return null;
    }
  }, [resultMap]);

  const outlineOutput = useMemo((): OutlineAgentOutput | null => {
    const raw = resultMap.get("outline")?.output;
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as OutlineAgentOutput;
      if (!Array.isArray(parsed.scenes)) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [resultMap]);

  const activePlan = useMemo(
    () => chapterPlans?.find((p) => p.id === autoSelectedPlanId) ?? null,
    [chapterPlans, autoSelectedPlanId],
  );

  const nextPlan = useMemo(
    () => chapterPlans?.find((p) => p.status === "planned") ?? null,
    [chapterPlans],
  );
  const savedCount = useMemo(
    () => chapterPlans?.filter((p) => p.status === "saved").length ?? 0,
    [chapterPlans],
  );

  const controls = usePipelineControls({
    novelId,
    activeSessionId: activeSession?.id,
    activeSessionChapterPlanId: activeSession?.chapterPlanId,
    activeSessionStatus: activeSession?.status,
    effectivePlanId: autoSelectedPlanId,
    nextPlanId: nextPlan?.id ?? null,
    nextPlanOrder: nextPlan?.chapterOrder ?? null,
    outlineOutput,
    chapterPlanIds: chapterPlans?.map((p) => p.id) ?? [],
    savedPlanCount: savedCount,
    totalPlanCount: chapterPlans?.length ?? 0,
    onSelectPlan: setSelectedPlanId,
    setActivePanel,
    setStaleWarning,
  });

  const writerOutputDone =
    resultMap.get("writer")?.status === "completed" &&
    !!resultMap.get("writer")?.output?.trim();
  const reviewOutputDone = resultMap.get("audit")?.status === "completed";
  const outlineStepComplete = resultMap.get("outline")?.status === "completed";

  function handleTabChange(val: string) {
    const tab = val as ActiveTab;
    setActiveTab(tab);
    if (tab !== "state") {
      setActivePanel(
        tab as "pipeline" | "outline" | "content" | "observe" | "review",
      );
    }
  }

  if (!novel) return <Skeleton className="h-screen w-full" />;

  return (
    <div className="h-full flex flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-b px-4">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href={`/novels/${novelId}`}>
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="truncate text-sm font-semibold">
            {novel.title} — Auto-Write
          </h1>
        </div>
        <div className="flex items-center gap-1">
          {mode === "pipeline" &&
            (isRunning ? (
              <Button variant="ghost" size="sm" onClick={pausePipeline}>
                <PauseIcon className="h-4 w-4 mr-1" />
                Tạm dừng
              </Button>
            ) : activeSession ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void controls.handleStartPipeline()}
              >
                <PlayIcon className="h-4 w-4 mr-1" />
                Tiếp tục
              </Button>
            ) : nextPlan ? (
              <Button
                variant="default"
                size="sm"
                onClick={() => void controls.handleStartPipeline(nextPlan.id)}
              >
                <PlayIcon className="h-4 w-4 mr-1" />
                Viết chương {nextPlan.chapterOrder}
              </Button>
            ) : null)}
          {activeSession && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Làm mới phiên"
              onClick={() => setRefreshSessionOpen(true)}
            >
              <RotateCcwIcon className="h-4 w-4" />
            </Button>
          )}
          {mode === "pipeline" && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Trạng thái truyện"
              onClick={() => handleTabChange("state")}
            >
              <DatabaseIcon className="h-4 w-4" />
            </Button>
          )}
          {mode === "pipeline" && bootstrapReady && (
            <SyncEntitiesButton novelId={novelId} />
          )}
          {mode === "pipeline" && bootstrapReady && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              title="Tạo nhân vật bằng AI"
              onClick={() => setGenerateCharsOpen(true)}
            >
              <UsersIcon className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => setSettingsOpen(true)}
            title="Cài đặt viết truyện"
          >
            <SettingsIcon className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {mode === "empty" && (
        <div className="flex-1 overflow-auto">
          <IdeaForm
            onSubmitAction={(d) => {
              setIdeaData(d);
              setModeOverride("wizard");
            }}
          />
        </div>
      )}

      {mode === "wizard" && ideaData && (
        <div className="flex-1">
          <SetupWizard
            novelId={novelId}
            ideaData={ideaData}
            startAtStep={
              hasWorld
                ? hasCharacters
                  ? hasPlotArcs
                    ? "plans"
                    : "arcs"
                  : "characters"
                : "world"
            }
            onCompleteAction={() => setModeOverride("pipeline")}
          />
        </div>
      )}

      {mode === "dashboard" && (
        <div className="flex-1 overflow-hidden">
          <NovelSetup
            novelId={novelId}
            onActionAction={(action) => {
              if (action === "skip") {
                setModeOverride("pipeline");
                return;
              }
              if (action === "chat") {
                setIdeaData({
                  genre: novel.genre ?? "",
                  setting: novel.storySetting ?? "",
                  idea: novel.synopsis ?? novel.description ?? "",
                  style: "",
                });
                setModeOverride("wizard");
              }
            }}
          />
        </div>
      )}

      {mode === "pipeline" && storyStateLoaded && !bootstrapReady && (
        <div className="flex-1 overflow-auto">
          <BootstrapPanel novelId={novelId} />
        </div>
      )}

      {mode === "pipeline" && !storyStateLoaded && (
        <div className="flex-1 flex items-center justify-center">
          <Skeleton className="h-8 w-48" />
        </div>
      )}

      {mode === "pipeline" && bootstrapReady && (
        <ResizablePanelGroup
          orientation="horizontal"
          className="min-h-0 flex-1"
        >
          <ResizablePanel defaultSize="320px" minSize="260px" maxSize="400px">
            <ChapterPlanSidebar
              plans={chapterPlans}
              effectivePlanId={autoSelectedPlanId}
              sessionId={activeSession?.id}
              currentStep={activeSession?.currentStep}
              sessionStatus={activeSession?.status}
              isGeneratingPlans={controls.isGeneratingPlans}
              novelId={novelId}
              onSelectPlan={setSelectedPlanId}
              onEditPlan={setEditPlanId}
              onRetry={() => void controls.handleStartPipeline()}
              onStepClick={(role) => handleTabChange(STEP_PANEL_MAP[role])}
              onGenerateMore={() => setGenerateMorePlansOpen(true)}
              onAddBlank={async () => {
                const nextOrder = await getNextChapterOrder(novelId);
                await createChapterPlan({
                  novelId,
                  chapterOrder: nextOrder,
                  directions: [],
                  outline: "",
                  scenes: [],
                  status: "planned",
                });
              }}
            />
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel minSize="300px" className="h-full min-h-0">
            <Tabs
              value={activeTab}
              onValueChange={handleTabChange}
              className="flex h-full min-h-0 flex-col"
            >
              <TabsList className="mx-auto mt-2 max-w-full w-fit shrink-0 flex-wrap justify-center gap-0.5 px-1 [&_button]:text-xs [&_button]:px-2 sm:[&_button]:min-w-20">
                <TabsTrigger value="pipeline">Kế hoạch</TabsTrigger>
                <TabsTrigger value="outline">Giàn ý</TabsTrigger>
                <TabsTrigger value="content">Nội dung</TabsTrigger>
                <TabsTrigger value="observe">Quan sát</TabsTrigger>
                <TabsTrigger value="review">Đánh giá</TabsTrigger>
                <TabsTrigger value="state">Trạng thái</TabsTrigger>
              </TabsList>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <TabsContent
                  value="pipeline"
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <PipelineStepsPanel
                    novelId={novelId}
                    sessionId={activeSession?.id}
                    currentStep={activeSession?.currentStep}
                    sessionStatus={activeSession?.status}
                    planOutput={planOutput}
                    effectivePlanId={autoSelectedPlanId}
                    activePlanIntent={activePlan?.intent ?? null}
                    scrollClass={scrollClass}
                    onRetry={() => void controls.handleStartPipeline()}
                    onStepClick={(role) =>
                      handleTabChange(STEP_PANEL_MAP[role])
                    }
                    onDirectionConfirm={controls.handleDirectionConfirm}
                    onRerunPlan={() => void controls.handleRerunPlan()}
                    onStartPipeline={() => void controls.handleStartPipeline()}
                  />
                </TabsContent>
                <TabsContent
                  value="outline"
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <OutlineTabPanel
                    novelId={novelId}
                    sessionId={activeSession?.id}
                    currentStep={activeSession?.currentStep}
                    outlineOutput={outlineOutput}
                    scrollClass={scrollClass}
                    onApprove={controls.handleOutlineApprove}
                    onRegenerate={() => void controls.handleRerunOutline()}
                    onStartPipeline={() => void controls.handleStartPipeline()}
                  />
                </TabsContent>
                <TabsContent
                  value="content"
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <ContentTabPanel
                    novelId={novelId}
                    sessionId={activeSession?.id}
                    currentStep={activeSession?.currentStep}
                    sessionStatus={activeSession?.status}
                    outlineStepComplete={outlineStepComplete}
                    writerOutputDone={writerOutputDone}
                    isRewriting={controls.isRewriting}
                    scrollClass={scrollClass}
                    onStartPipeline={() => void controls.handleStartPipeline()}
                    onRerunWriter={() => void controls.handleRerunWriter()}
                  />
                </TabsContent>
                <TabsContent
                  value="observe"
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <ObserveTabPanel
                    novelId={novelId}
                    sessionId={activeSession?.id}
                    scrollClass={scrollClass}
                    isRunning={isRunning}
                    onSaveChapter={() => void controls.handleSaveChapter()}
                  />
                </TabsContent>
                <TabsContent
                  value="review"
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <ReviewTabPanel
                    novelId={novelId}
                    sessionId={activeSession?.id}
                    writerOutputDone={writerOutputDone}
                    reviewOutputDone={reviewOutputDone}
                    isRewriting={controls.isRewriting}
                    scrollClass={scrollClass}
                    onStartPipeline={() => void controls.handleStartPipeline()}
                    onRerunAudit={() => void controls.handleRerunAudit()}
                    onRewrite={controls.handleRewrite}
                    onSaveChapter={() => void controls.handleSaveChapter()}
                  />
                </TabsContent>
                <TabsContent
                  value="state"
                  className="mt-0 flex min-h-0 flex-1 flex-col overflow-hidden"
                >
                  <StatePanel novelId={novelId} />
                </TabsContent>
              </div>
            </Tabs>
          </ResizablePanel>
        </ResizablePanelGroup>
      )}

      <WritingSettingsDialog
        novelId={novelId}
        open={settingsOpen}
        onOpenChangeAction={setSettingsOpen}
      />

      <AlertDialog
        open={refreshSessionOpen}
        onOpenChange={setRefreshSessionOpen}
      >
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Làm mới phiên viết?</AlertDialogTitle>
            <AlertDialogDescription className="text-left sm:text-left">
              Toàn bộ kết quả các bước pipeline của phiên này sẽ bị xóa. Phiên
              bắt đầu lại từ bước Kế hoạch.
              {isRunning && (
                <>
                  {" "}
                  <span className="font-medium text-amber-600 dark:text-amber-500">
                    Pipeline đang chạy sẽ bị dừng.
                  </span>
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Hủy</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRefreshSessionOpen(false);
                void controls.handleConfirmRefreshSession();
              }}
            >
              Làm mới phiên
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GenerateCharactersDialog
        open={generateCharsOpen}
        onOpenChangeAction={setGenerateCharsOpen}
        novelId={novelId}
        existingNames={characters?.map((c) => c.name) ?? []}
      />

      <GenerateMorePlansDialog
        novelId={novelId}
        open={generateMorePlansOpen}
        onOpenChangeAction={setGenerateMorePlansOpen}
        onConfirmAction={async (instruction: string) => {
          setGenerateMorePlansOpen(false);
          await controls.runGenerateMorePlans(instruction);
        }}
        isLoading={controls.isGeneratingPlans}
      />

      <EditChapterPlanDialog
        plan={chapterPlans?.find((p) => p.id === editPlanId) ?? null}
        open={editPlanId !== null}
        onOpenChangeAction={(open) => {
          if (!open) setEditPlanId(null);
        }}
      />

      <AlertDialog open={staleWarning} onOpenChange={setStaleWarning}>
        <AlertDialogContent size="md">
          <AlertDialogHeader>
            <AlertDialogTitle>Trạng thái truyện đã thay đổi</AlertDialogTitle>
            <AlertDialogDescription>
              Trạng thái câu chuyện đã thay đổi kể từ khi phiên này bắt đầu.
              Chạy lại từ bước Kế hoạch hay tiếp tục với trạng thái cũ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => void controls.handleStaleContinue()}>
              Tiếp tục với trạng thái cũ
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => void controls.handleStaleRerun()}>
              Chạy lại từ bước Kế hoạch
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

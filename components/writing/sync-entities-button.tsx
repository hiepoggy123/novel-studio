"use client";

import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { syncStateToEntities } from "@/lib/writing/sync-entities";

interface SyncEntitiesButtonProps {
  novelId: string;
}

export function SyncEntitiesButton({ novelId }: SyncEntitiesButtonProps) {
  const [syncing, setSyncing] = useState(false);

  async function handleSync() {
    setSyncing(true);
    try {
      const result = await syncStateToEntities(novelId);
      if (!result.ok) {
        toast.error(result.error ?? "Đồng bộ thất bại");
        return;
      }

      const parts: string[] = [];
      if (result.charactersUpdated) parts.push(`${result.charactersUpdated} nhân vật cập nhật`);
      if (result.charactersCreated) parts.push(`${result.charactersCreated} nhân vật mới`);
      if (result.worldUpdated) parts.push("thế giới quan");

      toast.success(
        parts.length ? `Đã đồng bộ: ${parts.join(", ")}` : "Không có thay đổi mới",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Đồng bộ thất bại");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-8 w-8 shrink-0"
      title="Đồng bộ trạng thái vào hồ sơ nhân vật & thế giới quan"
      onClick={handleSync}
      disabled={syncing}
    >
      <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
    </Button>
  );
}

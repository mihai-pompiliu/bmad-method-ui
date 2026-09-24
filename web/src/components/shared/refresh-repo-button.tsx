"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { refreshRepoData } from "@/actions/repo-actions";

interface RefreshRepoButtonProps {
  owner: string;
  name: string;
  showLabel?: boolean;
  label?: string;
  messages?: {
    successTitle: string;
    fileCount: (count: number) => string;
    failedTitle: string;
    rateLimited: string;
    unknownError: string;
    close: string;
  };
}

function formatFileCount(count: number): string {
  if (count === 0) return "No BMAD files detected.";
  return `${count} BMAD file${count > 1 ? "s" : ""} detected.`;
}

export function RefreshRepoButton({ owner, name, showLabel = false, label = "Refresh data", messages }: RefreshRepoButtonProps) {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    totalFiles?: number;
    error?: string;
    code?: string;
  } | null>(null);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await refreshRepoData({ owner, name });
      if (res.success) {
        setResult({ success: true, totalFiles: res.data.totalFiles });
      } else {
        setResult({ success: false, error: res.error, code: res.code });
      }
      setDialogOpen(true);
      if (res.success) {
        router.refresh();
      }
    } catch {
      setResult({ success: false, error: messages?.unknownError ?? "Unexpected error" });
      setDialogOpen(true);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size={showLabel ? "sm" : "icon"}
        className={showLabel ? "text-muted-foreground hover:text-foreground" : "h-9 w-9 text-muted-foreground hover:text-foreground"}
        aria-label={label}
        onClick={handleRefresh}
        disabled={refreshing}
      >
        <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
        {showLabel && <span>{label}</span>}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        if (!refreshing) setDialogOpen(open);
      }}>
        <DialogContent>
          {result?.success === true ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <DialogTitle>{messages?.successTitle ?? "Refresh successful"}</DialogTitle>
                </div>
                <DialogDescription>
                  {messages?.fileCount(result.totalFiles ?? 0) ?? formatFileCount(result.totalFiles ?? 0)}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button onClick={() => setDialogOpen(false)}>{messages?.close ?? "OK"}</Button>
              </DialogFooter>
            </>
          ) : result?.success === false ? (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <XCircle className="h-5 w-5 text-destructive" />
                  <DialogTitle>{messages?.failedTitle ?? "Refresh failed"}</DialogTitle>
                </div>
                <DialogDescription>
                  <span role="alert">
                    {result.code === "RATE_LIMITED"
                      ? messages?.rateLimited ?? "GitHub rate limit reached. Cached data is displayed."
                      : result.error || messages?.unknownError || "An unknown error occurred."}
                  </span>
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>{messages?.close ?? "Close"}</Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

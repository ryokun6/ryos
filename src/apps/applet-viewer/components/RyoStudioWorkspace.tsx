import HtmlPreview from "@/components/shared/HtmlPreview";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Sparkle, ArrowCounterClockwise, FloppyDisk, UploadSimple, ArrowLeft } from "@phosphor-icons/react";
import type { StudioDraftSnapshot } from "../hooks/useRyoStudio";

interface RyoStudioWorkspaceProps {
  promptInput: string;
  setPromptInput: (value: string) => void;
  isGenerating: boolean;
  studioError: string | null;
  lastReply: string;
  studioDraft: StudioDraftSnapshot | null;
  draftPath: string;
  draftShareId: string;
  canUndo: boolean;
  hasDraft: boolean;
  isLoggedIn: boolean;
  starterPrompts: string[];
  onCreateDraft: () => Promise<void>;
  onRefineDraft: () => Promise<void>;
  onUndoDraft: () => void;
  onSaveDraft: () => Promise<unknown>;
  onPublishDraft: () => Promise<unknown>;
  onCloseStudio: () => void;
  onUpdateMetadata: (
    updates: Partial<Pick<StudioDraftSnapshot, "title" | "icon" | "name">>
  ) => void;
}

export function RyoStudioWorkspace({
  promptInput,
  setPromptInput,
  isGenerating,
  studioError,
  lastReply,
  studioDraft,
  draftPath,
  draftShareId,
  canUndo,
  hasDraft,
  isLoggedIn,
  starterPrompts,
  onCreateDraft,
  onRefineDraft,
  onUndoDraft,
  onSaveDraft,
  onPublishDraft,
  onCloseStudio,
  onUpdateMetadata,
}: RyoStudioWorkspaceProps) {
  const primaryAction = hasDraft ? onRefineDraft : onCreateDraft;
  const primaryLabel = hasDraft ? "Refine Draft" : "Create Draft";

  const handlePromptKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>
  ) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void primaryAction();
    }
  };

  return (
    <div className="h-full w-full bg-neutral-100">
      <div className="flex h-full flex-col lg:flex-row">
        <div className="flex w-full max-w-[360px] flex-col border-b border-neutral-300 bg-white lg:h-full lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
                Ryo Studio
              </div>
              <div className="text-sm font-semibold text-neutral-900">
                Build a tiny tool with Ryo
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={onCloseStudio}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              Back
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 px-4 py-3">
            <Badge variant="secondary">
              {hasDraft ? "Draft loaded" : "No draft yet"}
            </Badge>
            {draftPath ? <Badge variant="outline">{draftPath}</Badge> : null}
            {draftShareId ? <Badge variant="outline">Published</Badge> : null}
            {!isLoggedIn ? (
              <Badge variant="outline">Log in to publish</Badge>
            ) : null}
          </div>

          <div className="space-y-3 px-4 pb-4">
            <Textarea
              value={promptInput}
              onChange={(event) => setPromptInput(event.target.value)}
              onKeyDown={handlePromptKeyDown}
              placeholder={
                hasDraft
                  ? "Ask Ryo to change this draft…"
                  : "Describe the tiny app you want to build…"
              }
              className="min-h-32 resize-none text-sm"
              disabled={isGenerating}
            />

            <div className="flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => setPromptInput(prompt)}
                  className="rounded-full border border-neutral-300 bg-neutral-50 px-3 py-1 text-left text-[11px] text-neutral-700 transition hover:bg-neutral-100"
                  disabled={isGenerating}
                >
                  {prompt}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              <Button onClick={() => void primaryAction()} disabled={isGenerating}>
                <Sparkle className="mr-1 h-4 w-4" />
                {isGenerating ? "Thinking…" : primaryLabel}
              </Button>
              <Button
                variant="secondary"
                onClick={onUndoDraft}
                disabled={!canUndo || isGenerating}
              >
                <ArrowCounterClockwise className="mr-1 h-4 w-4" />
                Undo
              </Button>
              <Button
                variant="secondary"
                onClick={() => void onSaveDraft()}
                disabled={!hasDraft || isGenerating}
              >
                <FloppyDisk className="mr-1 h-4 w-4" />
                Save Draft
              </Button>
              <Button
                variant="secondary"
                onClick={() => void onPublishDraft()}
                disabled={!hasDraft || isGenerating}
              >
                <UploadSimple className="mr-1 h-4 w-4" />
                {draftShareId ? "Update Store Version" : "Publish"}
              </Button>
            </div>

            <div className="text-[11px] text-neutral-500">
              {isGenerating
                ? "Ryo is generating your applet draft…"
                : "Tip: press Ctrl/Cmd + Enter to submit quickly."}
            </div>
          </div>

          {studioError ? (
            <div className="mx-4 mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {studioError}
            </div>
          ) : null}

          {lastReply ? (
            <div className="mx-4 mb-4 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
              {lastReply}
            </div>
          ) : null}

          {studioDraft ? (
            <div className="space-y-3 border-t border-neutral-200 px-4 py-4">
              <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-neutral-500">
                Draft metadata
              </div>
              <div className="grid grid-cols-[72px_1fr] items-center gap-2">
                <label className="text-xs text-neutral-600">Title</label>
                <Input
                  value={studioDraft.title}
                  onChange={(event) =>
                    onUpdateMetadata({ title: event.target.value })
                  }
                  className="h-8 text-sm"
                />
                <label className="text-xs text-neutral-600">Icon</label>
                <Input
                  value={studioDraft.icon}
                  onChange={(event) =>
                    onUpdateMetadata({ icon: event.target.value })
                  }
                  className="h-8 text-sm"
                />
                <label className="text-xs text-neutral-600">File Name</label>
                <Input
                  value={studioDraft.name}
                  onChange={(event) =>
                    onUpdateMetadata({ name: event.target.value })
                  }
                  className="h-8 text-sm"
                />
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex min-h-0 flex-1 flex-col bg-neutral-200">
          <div className="border-b border-neutral-300 bg-white px-4 py-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">
              Live preview
            </div>
            <div className="text-sm text-neutral-700">
              {studioDraft
                ? "Preview updates as you iterate with Ryo."
                : "Create a draft to see your new applet here."}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            {studioDraft ? (
              <HtmlPreview
                htmlContent={studioDraft.html}
                appletTitle={studioDraft.title}
                appletIcon={studioDraft.icon}
                minHeight="420px"
                maxHeight="100%"
                className="h-full"
              />
            ) : (
              <div className="flex h-full min-h-[420px] items-center justify-center rounded-lg border border-dashed border-neutral-400 bg-white/70 p-8 text-center text-sm text-neutral-600">
                Describe what you want to build and Ryo Studio will generate the
                first draft here.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

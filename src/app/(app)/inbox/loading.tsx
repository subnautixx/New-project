import { Skeleton } from "@/components/ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="flex min-h-0 flex-1">
      <div className="w-full shrink-0 border-r border-border bg-surface md:w-[320px] lg:w-[360px]">
        <div className="flex h-14 items-center border-b border-border px-4">
          <Skeleton className="h-8 w-full rounded-md" />
        </div>
        <div className="space-y-px p-2">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="flex items-start gap-3 rounded-md p-2.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3 w-[55%]" />
                <Skeleton className="h-2.5 w-[80%]" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* A conversa só aparece depois que uma é escolhida — aqui fica o vazio. */}
      <div className="chat-canvas hidden min-w-0 flex-1 md:block" />
    </div>
  );
}

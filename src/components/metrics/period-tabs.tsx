"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PERIOD_OPTIONS, type Period } from "@/lib/data/metrics";
import { cn } from "@/lib/utils";

/** Seleção de período. O estado vive na URL, então recarregar mantém a visão. */
export function PeriodTabs({ period }: { period: Period }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [showCustom, setShowCustom] = useState(period.key === "custom");

  function hrefFor(key: string): string {
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodo", key);
    params.delete("de");
    params.delete("ate");
    return `${pathname}?${params.toString()}`;
  }

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
        {PERIOD_OPTIONS.map((option) => (
          <Link
            key={option.key}
            href={hrefFor(option.key)}
            className={cn(
              "rounded px-2.5 py-1 text-xs transition-colors",
              period.key === option.key
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </Link>
        ))}
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className={cn(
            "rounded px-2.5 py-1 text-xs transition-colors",
            period.key === "custom"
              ? "bg-secondary font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          Personalizado
        </button>
      </div>

      {showCustom ? (
        <form method="get" action={pathname} className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label htmlFor="de">De</Label>
            <Input id="de" name="de" type="date" className="h-8 w-auto text-xs" required />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ate">Até</Label>
            <Input id="ate" name="ate" type="date" className="h-8 w-auto text-xs" />
          </div>
          <Button type="submit" size="sm" variant="secondary">
            Aplicar
          </Button>
        </form>
      ) : null}
    </div>
  );
}

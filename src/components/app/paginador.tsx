import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

interface PaginadorProps {
  page: number;          // 1-indexed
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}

export function Paginador({
  page,
  pageSize,
  total,
  onChange,
  pageSizeOptions = [25, 50, 100, 250],
  onPageSizeChange,
}: PaginadorProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const isFirst = page <= 1;
  const isLast = page >= totalPages;

  return (
    <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-secondary/20 text-[11.5px]">
      <div className="flex items-center gap-3 text-ink-muted">
        <span>
          <span className="font-medium text-foreground">{from}-{to}</span> de{" "}
          <span className="font-medium text-foreground">{total}</span>
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5">
            <span className="text-ink-subtle">·</span>
            <span>Por página:</span>
            <select
              value={pageSize}
              onChange={(e) => onPageSizeChange(Number(e.target.value))}
              className="bg-secondary border-0 rounded px-1.5 py-0.5 text-[11px] ring-1 ring-border cursor-pointer focus:ring-brand/30 outline-none"
            >
              {pageSizeOptions.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => onChange(1)}
          disabled={isFirst}
          title="Primera"
          aria-label="Primera página"
          className="p-1.5 rounded hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronsLeft className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(page - 1)}
          disabled={isFirst}
          title="Anterior"
          aria-label="Página anterior"
          className="p-1.5 rounded hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronLeft className="size-3.5" />
        </button>
        <span className="px-3 font-mono text-[11px] text-foreground">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => onChange(page + 1)}
          disabled={isLast}
          title="Siguiente"
          aria-label="Página siguiente"
          className="p-1.5 rounded hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronRight className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(totalPages)}
          disabled={isLast}
          title="Última"
          aria-label="Última página"
          className="p-1.5 rounded hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
        >
          <ChevronsRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

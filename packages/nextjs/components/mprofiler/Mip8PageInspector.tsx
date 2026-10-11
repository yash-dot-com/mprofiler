"use client";

import { useEffect, useMemo, useState } from "react";
import type { Mip8Analysis, Mip8SlotCell } from "~~/lib/mprofiler/mip8";

type Props = {
  mip8: Mip8Analysis;
  selectedSlot: string | null;
  onSelectSlot: (slot: string | null) => void;
  onSelectCall?: (callIndex: number) => void;
};

const shortHash = (value: string) => `${value.slice(0, 10)}…${value.slice(-8)}`;

export function Mip8PageInspector({ mip8, selectedSlot, onSelectSlot, onSelectCall }: Props) {
  const pages = useMemo(() => mip8.pages ?? [], [mip8.pages]);
  const [selectedPageKey, setSelectedPageKey] = useState<string>(pages[0]?.pageKey ?? "");
  const [activeCell, setActiveCell] = useState<Mip8SlotCell | null>(null);

  const currentPage = useMemo(() => {
    return pages.find(page => page.pageKey === selectedPageKey) ?? pages[0] ?? null;
  }, [pages, selectedPageKey]);

  // Map 128 offsets (0..127) for the selected page
  const offsetMap = useMemo(() => {
    const map = new Map<number, Mip8SlotCell>();
    if (!currentPage) return map;
    for (const cell of currentPage.offsets) {
      map.set(cell.offset, cell);
    }
    return map;
  }, [currentPage]);

  // When selectedSlot changes externally, auto-select its page
  useEffect(() => {
    if (!selectedSlot) return;
    const lower = selectedSlot.toLowerCase();
    for (const page of pages) {
      const match = page.offsets.find(c => c.slot.toLowerCase() === lower);
      if (match) {
        setSelectedPageKey(page.pageKey);
        setActiveCell(match);
        break;
      }
    }
  }, [selectedSlot, pages]);

  if (!currentPage || pages.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
        No storage page accesses observed in this run.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Selector & Summary Banner */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <label htmlFor="page-select" className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Selected 4 KB Page:
          </label>
          <select
            id="page-select"
            value={currentPage.pageKey}
            onChange={e => {
              setSelectedPageKey(e.target.value);
              setActiveCell(null);
            }}
            className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 font-mono text-xs font-semibold text-slate-900 focus:border-blue-500 focus:outline-none"
          >
            {pages.map((page, index) => (
              <option key={page.pageKey} value={page.pageKey}>
                Page #{index + 1}: {page.pageIndex} ({page.distinctSlotsCount} slots, {page.totalTouches} touches)
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-xs font-medium text-slate-600">
          <div>
            Contract: <span className="font-mono text-slate-900">{shortHash(currentPage.contractAddress)}</span>
          </div>
          <div>
            Page Index: <span className="font-mono font-bold text-blue-700">{currentPage.pageIndex}</span>
          </div>
          <div>
            Distinct Slots: <span className="font-bold text-slate-900">{currentPage.distinctSlotsCount}</span> / 128
          </div>
          <div>
            Touches: <span className="font-bold text-slate-900">{currentPage.totalTouches}</span>
          </div>
        </div>
      </div>

      {/* 128-Slot Visual Grid */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <h3 className="m-0 text-sm font-bold text-slate-900">128-Slot Page Layout (Offsets 0 to 127)</h3>
            <p className="mb-0 mt-0.5 text-xs text-slate-500">
              Each cell represents a 32-byte slot in this 4,096-byte logical page ($pageIndex = slot \gg 7$).
            </p>
          </div>

          {/* Color Legend */}
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm border border-slate-200 bg-slate-50" />
              Untouched
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-blue-500" />
              SLOAD (Read)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-emerald-500" />
              SSTORE (Write)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 rounded-sm bg-purple-600" />
              Mixed Read/Write
            </span>
          </div>
        </div>

        {/* 128-Cell Grid Container: 16 columns x 8 rows */}
        <div className="mt-4 grid grid-cols-8 gap-1 sm:grid-cols-16">
          {Array.from({ length: 128 }, (_, offset) => {
            const cell = offsetMap.get(offset);
            const isTouched = Boolean(cell);
            const isSelected =
              (activeCell && activeCell.offset === offset) ||
              (selectedSlot && cell?.slot.toLowerCase() === selectedSlot.toLowerCase());

            let bgClass = "bg-slate-50 text-slate-400 hover:bg-slate-100 border-slate-200";
            if (cell) {
              if (cell.reads > 0 && cell.writes > 0) {
                bgClass = "bg-purple-600 text-white font-bold hover:bg-purple-700 shadow-sm";
              } else if (cell.writes > 0) {
                bgClass = "bg-emerald-600 text-white font-bold hover:bg-emerald-700 shadow-sm";
              } else if (cell.reads > 0) {
                bgClass = "bg-blue-600 text-white font-bold hover:bg-blue-700 shadow-sm";
              }
            }

            return (
              <button
                key={offset}
                type="button"
                onClick={() => {
                  if (cell) {
                    setActiveCell(cell);
                    onSelectSlot(cell.slot);
                  } else {
                    setActiveCell(null);
                    onSelectSlot(null);
                  }
                }}
                className={`relative flex aspect-square flex-col items-center justify-center rounded border p-0 text-[10px] transition-all ${bgClass} ${
                  isSelected ? "ring-2 ring-blue-500 ring-offset-1 z-10 scale-105" : ""
                }`}
                title={`Offset ${offset}${cell ? `: ${cell.touches} touches (${cell.reads}R, ${cell.writes}W)` : " (Untouched)"}`}
              >
                <span>{offset}</span>
                {isTouched && <span className="text-[8px] opacity-90">{cell?.touches}</span>}
              </button>
            );
          })}
        </div>

        {/* Active Cell Inspector Detail Card */}
        {activeCell ? (
          <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-700 px-2 py-0.5 font-mono text-xs font-bold text-white">
                  Offset #{activeCell.offset}
                </span>
                <span className="font-mono text-xs font-semibold text-slate-800">{activeCell.slot}</span>
              </div>
              <button
                type="button"
                onClick={() => onSelectSlot(activeCell.slot)}
                className="rounded border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
              >
                Highlight in Dependencies →
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-white p-2.5 shadow-xs">
                <p className="m-0 text-[10px] font-semibold uppercase text-slate-500">Total Touches</p>
                <p className="mb-0 mt-1 text-lg font-bold text-slate-900">{activeCell.touches}</p>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-xs">
                <p className="m-0 text-[10px] font-semibold uppercase text-slate-500">Reads (SLOAD)</p>
                <p className="mb-0 mt-1 text-lg font-bold text-blue-700">{activeCell.reads}</p>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-xs">
                <p className="m-0 text-[10px] font-semibold uppercase text-slate-500">Writes (SSTORE)</p>
                <p className="mb-0 mt-1 text-lg font-bold text-emerald-700">{activeCell.writes}</p>
              </div>
              <div className="rounded-lg bg-white p-2.5 shadow-xs">
                <p className="m-0 text-[10px] font-semibold uppercase text-slate-500">Accessing Calls</p>
                <div className="mb-0 mt-1 flex flex-wrap gap-1">
                  {activeCell.callIndexes.map(callIdx => (
                    <button
                      key={callIdx}
                      type="button"
                      onClick={() => onSelectCall?.(callIdx)}
                      className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-800 hover:bg-blue-100 hover:text-blue-800"
                    >
                      Call #{callIdx}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <p className="mb-0 mt-3 text-center text-xs text-slate-500">
            Click any active cell above to inspect its 256-bit storage slot key, access breakdown, and participating
            calls.
          </p>
        )}
      </div>
    </div>
  );
}

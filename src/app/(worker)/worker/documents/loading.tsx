import React from 'react';

export default function WorkerDocumentsLoading() {
  return (
    <div className="p-6 space-y-6 max-w-lg mx-auto animate-pulse">
      <div className="space-y-2">
        <div className="h-7 w-48 rounded-lg bg-slate-200" />
        <div className="h-4 w-64 rounded-lg bg-slate-100" />
      </div>
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-3xl bg-white p-5 shadow-sm border border-slate-100 space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-slate-200" />
              <div className="space-y-1.5 flex-1">
                <div className="h-4 w-40 rounded bg-slate-200" />
                <div className="h-3 w-56 rounded bg-slate-100" />
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <div className="h-6 w-24 rounded-full bg-slate-100" />
              <div className="h-9 w-24 rounded-xl bg-slate-200" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Apple, Play } from "lucide-react";

/**
 * Two "download the app" CTAs for the home hero. The apps aren't published yet,
 * so clicking either reveals a friendly "coming soon" notice instead of linking
 * to a store. Swap the onClick for real store URLs once the apps are live.
 */
export function AppDownloadButtons() {
  const [showNotice, setShowNotice] = useState(false);

  const buttonClass =
    "focus-ring inline-flex items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-bold text-surface transition hover:opacity-90";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setShowNotice(true)} className={buttonClass}>
          <Apple className="h-4 w-4" />
          App Store
        </button>
        <button type="button" onClick={() => setShowNotice(true)} className={buttonClass}>
          <Play className="h-4 w-4" />
          Google Play
        </button>
      </div>
      {showNotice ? (
        <p role="status" className="mt-3 text-sm font-medium text-ink">
          🚀 Our iOS &amp; Android apps are about to be deployed — coming very soon!
        </p>
      ) : null}
    </div>
  );
}

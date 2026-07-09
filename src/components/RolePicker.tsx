"use client";

import { useEffect, useState } from "react";

export function RolePicker({ onSaved }: { onSaved?: () => void }) {
  const [titles, setTitles] = useState<string[]>([]);
  const [locations, setLocations] = useState<string[]>([]);
  const [titleInput, setTitleInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [threshold, setThreshold] = useState(95);
  const [autoApplyEnabled, setAutoApplyEnabled] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/roles")
      .then((r) => r.json())
      .then((d) => {
        setTitles(d.titles ?? []);
        setLocations(d.locations ?? []);
        setRemoteOnly(d.remoteOnly ?? false);
        setThreshold(d.autoApplyThreshold ?? 95);
        setAutoApplyEnabled(d.autoApplyEnabled ?? false);
      });
  }, []);

  // case-insensitive dedupe: "remote" and "Remote" are the same preference
  function addTitle() {
    const t = titleInput.trim();
    if (t && !titles.some((x) => x.toLowerCase() === t.toLowerCase())) setTitles([...titles, t]);
    setTitleInput("");
  }
  function addLocation() {
    const l = locationInput.trim();
    if (l && !locations.some((x) => x.toLowerCase() === l.toLowerCase()))
      setLocations([...locations, l]);
    setLocationInput("");
  }

  async function save() {
    setSaving(true);
    await fetch("/api/roles", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titles, locations, remoteOnly, autoApplyThreshold: threshold, autoApplyEnabled }),
    });
    setSaving(false);
    setSaved(true);
    onSaved?.();
  }

  return (
    <div className="space-y-5">
      <div>
        <label className="label">Roles / titles you want (press Enter to add)</label>
        <input
          className="input"
          placeholder="e.g. Product Manager"
          value={titleInput}
          onChange={(e) => setTitleInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addTitle())}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {titles.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-ink-700 px-3 py-1 text-sm">
              {t}
              <button
                className="text-slate-400 hover:text-red-400"
                onClick={() => setTitles(titles.filter((x) => x !== t))}
              >
                ×
              </button>
            </span>
          ))}
          {titles.length === 0 && <p className="text-xs text-slate-500">No titles yet — the job search needs at least one.</p>}
        </div>
      </div>

      <div>
        <label className="label">Preferred locations (optional)</label>
        <input
          className="input"
          placeholder="e.g. New York, Remote"
          value={locationInput}
          onChange={(e) => setLocationInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addLocation())}
        />
        <div className="mt-2 flex flex-wrap gap-2">
          {locations.map((l) => (
            <span key={l} className="flex items-center gap-1 rounded-full bg-ink-700 px-3 py-1 text-sm">
              {l}
              <button
                className="text-slate-400 hover:text-red-400"
                onClick={() => setLocations(locations.filter((x) => x !== l))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} />
        Remote roles only
      </label>

      <div className="card !bg-ink-800">
        <label className="flex items-center gap-2 text-sm font-medium text-white">
          <input
            type="checkbox"
            checked={autoApplyEnabled}
            onChange={(e) => setAutoApplyEnabled(e.target.checked)}
          />
          Enable auto-apply
        </label>
        <p className="mt-1 text-xs text-slate-400">
          When enabled, the agent applies on your behalf to selected jobs whose match score is at or
          above your threshold, using your stored resume and answers.
        </p>
        <div className="mt-3">
          <label className="label">Auto-apply when match ≥ {threshold}%</label>
          <input
            type="range"
            min={50}
            max={100}
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="w-full"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving} className="btn-primary">
          {saving ? "Saving…" : "Save preferences"}
        </button>
        {saved && <span className="text-sm text-green-400">Saved ✓</span>}
      </div>
    </div>
  );
}

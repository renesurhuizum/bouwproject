"use client";

// Fasering: de juiste volgorde met afhankelijkheden + taken per fase.

import { useState } from "react";
import { Lock, Check, Plus } from "lucide-react";
import { useProject, usePhases, useTasks } from "@/lib/hooks";
import { analyzePhases, type PhaseStatusInfo } from "@/lib/phases";
import { create, update, remove } from "@/lib/db/repo";
import type { Phase, PhaseStatus, TaskItem } from "@/lib/domain/types";
import { PHASE_STATUS_LABEL } from "@/lib/domain/constants";

export default function FasesPage() {
  const project = useProject();
  const phases = usePhases(project?.id) ?? [];
  const tasks = useTasks(project?.id) ?? [];
  const analysis = analyzePhases(phases);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-3 p-4 pb-8">
        <header className="px-1">
          <h1 className="text-xl font-bold text-ink-900">Fasering</h1>
          <p className="text-sm text-ink-500">
            De juiste volgorde. Een fase opent pas als de voorwaarden klaar zijn.
          </p>
        </header>

        {analysis.map((info) => (
          <PhaseCard
            key={info.phase.id}
            info={info}
            tasks={tasks.filter((t) => t.phaseId === info.phase.id)}
            projectId={project?.id ?? ""}
          />
        ))}
      </div>
    </div>
  );
}

function PhaseCard({
  info,
  tasks,
  projectId,
}: {
  info: PhaseStatusInfo;
  tasks: TaskItem[];
  projectId: string;
}) {
  const { phase, blocked, blockedBy, ready } = info;
  const [newTask, setNewTask] = useState("");

  const STATUSES: PhaseStatus[] = ["todo", "in-progress", "done"];

  async function addTask() {
    const title = newTask.trim();
    if (!title || !projectId) return;
    await create<TaskItem>("tasks", {
      projectId,
      phaseId: phase.id,
      title,
      done: false,
    });
    setNewTask("");
  }

  return (
    <section
      className="rounded-card border bg-paper-raised p-4"
      style={{ borderColor: ready ? "#ea580c55" : "#ddd7ca" }}
    >
      <div className="flex items-start gap-3">
        <span
          className="mt-1 h-3 w-3 shrink-0 rounded-full"
          style={{ background: phase.color ?? "#78716c" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="tabular text-[11px] text-ink-300">
              {String(phase.order).padStart(2, "0")}
            </span>
            <h2 className="text-base font-semibold text-ink-900">{phase.name}</h2>
          </div>
          {phase.note && <p className="mt-0.5 text-xs text-ink-500">{phase.note}</p>}

          {blocked && (
            <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-paper-sunken px-2.5 py-1.5 text-[11px] text-ink-700">
              <Lock size={13} className="mt-0.5 shrink-0 text-warn" />
              <span>
                Wacht op:{" "}
                <span className="font-medium">
                  {blockedBy.map((p) => p.name).join(", ")}
                </span>
              </span>
            </div>
          )}
          {ready && (
            <div className="mt-2 inline-block rounded-lg bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent">
              Kan nu starten
            </div>
          )}
        </div>
      </div>

      {/* Status */}
      <div className="mt-3 flex gap-1">
        {STATUSES.map((st) => (
          <button
            key={st}
            onClick={() => update<Phase>("phases", phase.id, { status: st })}
            className={`flex-1 rounded-lg py-1.5 text-xs font-medium transition-colors ${
              phase.status === st
                ? "bg-ink-900 text-paper-raised"
                : "bg-paper-sunken text-ink-500"
            }`}
          >
            {PHASE_STATUS_LABEL[st]}
          </button>
        ))}
      </div>

      {/* Taken */}
      <ul className="mt-3 space-y-1">
        {tasks.map((t) => (
          <li key={t.id} className="flex items-center gap-2">
            <button
              onClick={() => update<TaskItem>("tasks", t.id, { done: !t.done })}
              className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                t.done ? "border-ok bg-ok text-white" : "border-line-strong text-transparent"
              }`}
              aria-label={t.done ? "Afvinken ongedaan" : "Afvinken"}
            >
              {t.done && <Check size={13} />}
            </button>
            <span
              className={`flex-1 text-sm ${
                t.done ? "text-ink-300 line-through" : "text-ink-700"
              }`}
            >
              {t.title}
            </span>
            <button
              onClick={() => remove("tasks", t.id)}
              className="text-xs text-ink-300 hover:text-danger"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* Taak toevoegen */}
      <div className="mt-2 flex gap-2">
        <input
          value={newTask}
          onChange={(e) => setNewTask(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addTask()}
          placeholder="Taak toevoegen…"
          className="flex-1 rounded-lg border border-line bg-paper px-3 py-1.5 text-sm text-ink-900 placeholder:text-ink-300"
        />
        <button
          onClick={addTask}
          className="flex items-center justify-center rounded-lg bg-ink-900 px-3 text-paper-raised"
          aria-label="Taak toevoegen"
        >
          <Plus size={16} />
        </button>
      </div>
    </section>
  );
}

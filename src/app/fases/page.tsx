"use client";

// Fasering: de juiste volgorde met afhankelijkheden + taken per fase.

import { useState } from "react";
import { Lock, Check, Plus, ListPlus, ListChecks, CalendarRange } from "lucide-react";
import { useProject, usePhases, useTasks, useProjectRooms } from "@/lib/hooks";
import { analyzePhases, type PhaseStatusInfo } from "@/lib/phases";
import { create, update, remove } from "@/lib/db/repo";
import type { Phase, PhaseStatus, Room, TaskItem } from "@/lib/domain/types";
import { PHASE_STATUS_LABEL, PHASE_TASK_TEMPLATES } from "@/lib/domain/constants";
import { GanttChart } from "@/components/fases/GanttChart";

export default function FasesPage() {
  const project = useProject();
  const phases = usePhases(project?.id) ?? [];
  const tasks = useTasks(project?.id) ?? [];
  const rooms = useProjectRooms(project?.id) ?? [];
  const analysis = analyzePhases(phases);
  const [tab, setTab] = useState<"taken" | "tijdlijn">("taken");

  const hasAnyTasks = tasks.length > 0;

  async function generateAll() {
    if (!project) return;
    for (const p of phases) {
      const tmpl = PHASE_TASK_TEMPLATES[p.order] ?? [];
      const existing = new Set(
        tasks.filter((t) => t.phaseId === p.id).map((t) => t.title.toLowerCase()),
      );
      for (const title of tmpl) {
        if (existing.has(title.toLowerCase())) continue;
        await create<TaskItem>("tasks", {
          projectId: project.id,
          phaseId: p.id,
          title,
          done: false,
        });
      }
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-3 p-4 pb-8">
        <header className="px-1">
          <h1 className="text-xl font-bold text-ink-900">Fasering</h1>
          <p className="text-sm text-ink-500">
            De juiste volgorde. Een fase opent pas als de voorwaarden klaar zijn.
          </p>
        </header>

        {/* Tabs */}
        <div className="flex gap-1 rounded-card bg-paper-sunken p-1">
          <button
            onClick={() => setTab("taken")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === "taken" ? "bg-paper-raised text-ink-900 shadow-sm" : "text-ink-500"
            }`}
          >
            <ListChecks size={16} /> Taken
          </button>
          <button
            onClick={() => setTab("tijdlijn")}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition-colors ${
              tab === "tijdlijn" ? "bg-paper-raised text-ink-900 shadow-sm" : "text-ink-500"
            }`}
          >
            <CalendarRange size={16} /> Tijdlijn
          </button>
        </div>

        {tab === "taken" ? (
          <>
            {!hasAnyTasks && (
              <button
                onClick={generateAll}
                className="flex w-full items-center justify-center gap-2 rounded-card border border-accent/40 bg-accent-soft py-3 text-sm font-medium text-accent"
              >
                <ListPlus size={18} /> Genereer volledig stappenplan
              </button>
            )}

            {analysis.map((info) => (
              <PhaseCard
                key={info.phase.id}
                info={info}
                tasks={tasks.filter((t) => t.phaseId === info.phase.id)}
                projectId={project?.id ?? ""}
                rooms={rooms}
              />
            ))}
          </>
        ) : (
          <div className="space-y-2">
            {phases.length === 0 ? (
              <p className="py-8 text-center text-sm text-ink-400">
                Nog geen fases om te plannen.
              </p>
            ) : (
              <>
                <p className="px-1 text-xs text-ink-400">
                  Planning op basis van afhankelijkheden. Sleep de rechterrand van een balk
                  om de duur aan te passen.
                </p>
                <GanttChart phases={phases} projectStartDate={project?.startDate} />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PhaseCard({
  info,
  tasks,
  projectId,
  rooms,
}: {
  info: PhaseStatusInfo;
  tasks: TaskItem[];
  projectId: string;
  rooms: Room[];
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

  const template = PHASE_TASK_TEMPLATES[phase.order] ?? [];
  const existingTitles = new Set(tasks.map((t) => t.title.toLowerCase()));
  const missing = template.filter((t) => !existingTitles.has(t.toLowerCase()));
  const doneCount = tasks.filter((t) => t.done).length;

  async function addTemplate() {
    if (!projectId) return;
    for (const title of missing) {
      await create<TaskItem>("tasks", { projectId, phaseId: phase.id, title, done: false });
    }
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
            {tasks.length > 0 && (
              <span className="tabular ml-auto rounded-full bg-paper-sunken px-2 py-0.5 text-[10px] text-ink-500">
                {doneCount}/{tasks.length}
              </span>
            )}
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
            {rooms.length > 0 && (
              <select
                value={t.roomId ?? ""}
                onChange={(e) =>
                  update<TaskItem>("tasks", t.id, { roomId: e.target.value || undefined })
                }
                className={`max-w-24 shrink-0 truncate rounded-md border-0 px-1.5 py-0.5 text-[10px] ${
                  t.roomId
                    ? "bg-blueprint-soft font-medium text-blueprint"
                    : "bg-paper-sunken text-ink-400"
                }`}
                title="Koppel aan ruimte (voor voortgang op de plattegrond)"
              >
                <option value="">— ruimte</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => remove("tasks", t.id)}
              className="text-xs text-ink-300 hover:text-danger"
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {/* Standaardstappen */}
      {missing.length > 0 && (
        <button
          onClick={addTemplate}
          className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg bg-paper-sunken py-1.5 text-xs font-medium text-ink-700"
        >
          <ListPlus size={14} /> Standaardstappen toevoegen ({missing.length})
        </button>
      )}

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

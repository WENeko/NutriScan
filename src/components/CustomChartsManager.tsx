import React, { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Plus, Trash2, Pencil, RefreshCw, GripVertical } from "lucide-react";
import type { ResolvedMicroGoal } from "@/utils/nutrition-logic";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface CustomChartConfig {
  id: string;
  title: string;
  micros: string[];
  color: string;
  chart_type: "line" | "bar";
  show_dots?: boolean;
}


export const CHART_COLORS = [
  { name: "Cyan", value: "#06B6D4" },
  { name: "Émeraude", value: "#10B981" },
  { name: "Violet", value: "#8B5CF6" },
  { name: "Ambre", value: "#F59E0B" },
  { name: "Rose", value: "#F43F5E" },
  { name: "Bleu royal", value: "#3B82F6" },
  { name: "Magenta", value: "#EC4899" },
  { name: "Teal", value: "#14B8A6" },
];

interface Props {
  userId: string;
  charts: CustomChartConfig[];
  onChange: (next: CustomChartConfig[]) => void;
  resolvedMicros: ResolvedMicroGoal[];
}

const uuid = () =>
  (globalThis.crypto?.randomUUID?.() as string) ||
  `chart-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const SortableChip: React.FC<{
  chart: CustomChartConfig;
  onEdit: (c: CustomChartConfig) => void;
  onRemove: (id: string) => void;
}> = ({ chart, onEdit, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: chart.id,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-1 bg-card rounded-full pl-1.5 pr-1 py-1 shadow-card ${
        isDragging ? "opacity-80 ring-2 ring-primary z-50" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1 rounded-full text-muted-foreground touch-none cursor-grab active:cursor-grabbing"
        aria-label="Réordonner"
      >
        <GripVertical size={12} />
      </button>
      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: chart.color }} />
      <span className="text-xs font-medium px-1">{chart.title}</span>
      <button
        onClick={() => onEdit(chart)}
        className="p-1.5 rounded-full hover:bg-muted transition"
        aria-label="Modifier"
      >
        <Pencil size={12} />
      </button>
      <button
        onClick={() => onRemove(chart.id)}
        className="p-1.5 rounded-full hover:bg-destructive/20 text-destructive transition"
        aria-label="Supprimer"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
};


const CustomChartsManager: React.FC<Props> = ({ userId, charts, onChange, resolvedMicros }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomChartConfig | null>(null);
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 8 } }),
  );

  const emptyDraft = (): CustomChartConfig => ({
    id: uuid(),
    title: "",
    micros: [],
    color: CHART_COLORS[0].value,
    chart_type: "bar",
    show_dots: true,
  });
  const [draft, setDraft] = useState<CustomChartConfig>(emptyDraft());


  const microsByKey = useMemo(() => {
    const map: Record<string, ResolvedMicroGoal> = {};
    resolvedMicros.forEach((m) => (map[m.key] = m));
    return map;
  }, [resolvedMicros]);

  const openCreate = () => {
    setEditing(null);
    setDraft(emptyDraft());
    setOpen(true);
  };
  const openEdit = (c: CustomChartConfig) => {
    setEditing(c);
    setDraft({ ...c });
    setOpen(true);
  };
  const close = () => {
    setOpen(false);
    setEditing(null);
  };

  const persist = async (next: CustomChartConfig[]) => {
    onChange(next);
    await supabase.from("profiles").update({ custom_charts: next as any }).eq("user_id", userId);
  };

  const save = async () => {
    if (!draft.title.trim() || draft.micros.length === 0) return;
    setSaving(true);
    const cleaned: CustomChartConfig = { ...draft, title: draft.title.trim() };
    const next = editing
      ? charts.map((c) => (c.id === editing.id ? cleaned : c))
      : [...charts, cleaned];
    await persist(next);
    setSaving(false);
    close();
  };

  const remove = async (id: string) => {
    if (!confirm("Supprimer ce graphique ?")) return;
    await persist(charts.filter((c) => c.id !== id));
  };

  const toggleMicro = (key: string) => {
    setDraft((d) =>
      d.micros.includes(key)
        ? { ...d, micros: d.micros.filter((k) => k !== key) }
        : { ...d, micros: [...d.micros, key] },
    );
  };

  return (
    <>
      <div className="flex items-center justify-between px-1">
        <h2 className="font-display font-bold text-lg">Mes graphiques</h2>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 bg-primary text-primary-foreground rounded-xl px-3 py-2 text-xs font-semibold shadow-card active:scale-95 transition"
        >
          <Plus size={14} /> Ajouter un graphique
        </button>
      </div>

      {charts.length > 0 && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToParentElement]}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={charts.map((c) => c.id)} strategy={rectSortingStrategy}>
            <div className="flex flex-wrap gap-2 px-1">
              {charts.map((c) => (
                <SortableChip key={c.id} chart={c} onEdit={openEdit} onRemove={remove} />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}


      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={close}
        >
          <div
            className="bg-card w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-card z-10 flex items-center justify-between p-4 border-b border-border">
              <h3 className="font-display font-bold text-base">
                {editing ? "Modifier le graphique" : "Nouveau graphique"}
              </h3>
              <button onClick={close} className="p-1.5 rounded-full hover:bg-muted">
                <X size={18} />
              </button>
            </div>

            <div className="p-4 space-y-5">
              {/* Titre */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Titre
                </label>
                <input
                  value={draft.title}
                  onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                  placeholder="Ex : Suivi Magnésium"
                  className="w-full bg-muted rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Micronutriments */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Micronutriments à suivre ({draft.micros.length} sélectionné
                  {draft.micros.length > 1 ? "s" : ""})
                </label>
                <div className="max-h-64 overflow-y-auto bg-muted/40 rounded-xl p-2 space-y-1">
                  {resolvedMicros.map((m) => {
                    const selected = draft.micros.includes(m.key);
                    return (
                      <button
                        key={m.key}
                        onClick={() => toggleMicro(m.key)}
                        className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-left transition ${
                          selected ? "bg-primary/20 ring-1 ring-primary" : "hover:bg-muted"
                        }`}
                      >
                        <span className="text-xs font-medium">{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {m.isLimit ? "Max" : "Min"} {m.goal} {m.unit}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Couleur */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Couleur
                </label>
                <div className="flex flex-wrap gap-2">
                  {CHART_COLORS.map((c) => (
                    <button
                      key={c.value}
                      onClick={() => setDraft({ ...draft, color: c.value })}
                      className={`w-9 h-9 rounded-full transition ${
                        draft.color === c.value
                          ? "ring-2 ring-offset-2 ring-offset-card ring-white scale-110"
                          : "opacity-70 hover:opacity-100"
                      }`}
                      style={{ backgroundColor: c.value }}
                      aria-label={c.name}
                    />
                  ))}
                </div>
              </div>

              {/* Type */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-1.5 block">
                  Format
                </label>
                <div className="flex gap-2">
                  {(["bar", "line"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setDraft({ ...draft, chart_type: t })}
                      className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition ${
                        draft.chart_type === t
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {t === "bar" ? "Barres" : "Courbe"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={close}
                  className="flex-1 py-3 rounded-xl bg-muted text-sm font-semibold"
                >
                  Annuler
                </button>
                <button
                  onClick={save}
                  disabled={saving || !draft.title.trim() || draft.micros.length === 0}
                  className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {saving && <RefreshCw size={14} className="animate-spin" />}
                  {editing ? "Enregistrer" : "Créer"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CustomChartsManager;

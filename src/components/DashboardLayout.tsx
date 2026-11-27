import React from "react";
import { DndContext, PointerSensor, KeyboardSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, useSortable, sortableKeyboardCoordinates, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Eye, EyeOff, Columns2, RectangleHorizontal, RotateCcw, FolderPlus, FolderMinus, Folder, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { canHideWidget, canUseHalfWidth, segmentLayout, type DashboardWidgetId, type LayoutSurface, type WidgetLayout } from "@/lib/dashboardLayout";

interface WidgetProps { id: DashboardWidgetId; title: string; children: React.ReactNode }
export function DashboardWidget({ children }: WidgetProps) { return <>{children}</>; }

function SortableWidget({ widget, config, editing, toggleHidden, toggleWidth, group, ungroup, rename, first, canGroup }: {
  widget: React.ReactElement<WidgetProps>; config: WidgetLayout; editing: boolean; first: boolean; canGroup: boolean;
  toggleHidden: (id: DashboardWidgetId) => void; toggleWidth: (id: DashboardWidgetId) => void;
  group: (id: DashboardWidgetId) => void; ungroup: (id: DashboardWidgetId) => void; rename: (from: string, to: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: config.id, disabled: !editing });
  if (config.hidden && !editing) return null;
  const title = widget.props.title;
  return (
    <div ref={setNodeRef} data-widget-id={config.id}
      className={`${config.half ? "col-span-1" : "col-span-2"} min-w-0 ${editing ? "rounded-lg border border-dashed border-primary/50 p-2" : ""} ${isDragging ? "relative z-20 bg-background shadow-card" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}>
      {editing && <div className="mb-2">
        {config.folder && first && <input aria-label="Nom du dossier" defaultValue={config.folder} maxLength={40}
          onBlur={e => { if (e.target.value.trim() && e.target.value !== config.folder) rename(config.folder!, e.target.value); }}
          className="mb-1 w-full rounded border bg-background px-2 py-1 text-xs" />}
        {config.folder && !first && <div className="text-[11px] text-muted-foreground mb-1 flex items-center gap-1"><Folder className="h-3 w-3" />{config.folder}</div>}
        <div className="text-xs font-semibold break-words mb-1">{title}</div>
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="ghost" size="icon" className="touch-none shrink-0" title={`Déplacer ${title}`} aria-label={`Déplacer ${title}`} {...attributes} {...listeners}><GripVertical /></Button>
          {canUseHalfWidth(config.id) && <Button variant="ghost" size="icon" title={config.half ? "Pleine largeur" : "Demi-largeur"} aria-label={`Largeur ${title}`} aria-pressed={config.half} onClick={() => toggleWidth(config.id)}>{config.half ? <RectangleHorizontal /> : <Columns2 />}</Button>}
          {canHideWidget(config.id) && <Button variant="ghost" size="icon" title={config.hidden ? `Afficher ${title}` : `Masquer ${title}`} aria-label={`Visibilité ${title}`} aria-pressed={!config.hidden} onClick={() => toggleHidden(config.id)}>{config.hidden ? <EyeOff /> : <Eye />}</Button>}
          {config.folder ? <Button variant="ghost" size="icon" title="Sortir du dossier" aria-label={`Sortir ${title} du dossier`} onClick={() => ungroup(config.id)}><FolderMinus /></Button>
            : canGroup && <Button variant="ghost" size="icon" title="Grouper avec la carte précédente" aria-label={`Grouper ${title} avec la carte précédente`} onClick={() => group(config.id)}><FolderPlus /></Button>}
        </div>
      </div>}
      {config.hidden ? <p className="text-xs text-muted-foreground py-2">Masqué</p> :
        <div ref={node => { if (node) node.inert = editing; }} className={editing ? "pointer-events-none" : ""}>{widget.props.children}</div>}
    </div>
  );
}

export default function DashboardLayout({ userId, editing, children, surface = "dashboard" }: { userId: string; editing: boolean; children: React.ReactNode; surface?: LayoutSurface }) {
  const { layout, move, toggleHidden, toggleWidth, reset, group, ungroup, rename } = useDashboardLayout(userId, surface);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const widgets = React.Children.toArray(children).filter((child): child is React.ReactElement<WidgetProps> => React.isValidElement<WidgetProps>(child));
  const available = layout.filter(config => widgets.some(w => w.props.id === config.id));
  return <div className="space-y-3">
    {editing && <div className="flex justify-end"><Button variant="outline" size="sm" onClick={reset}><RotateCcw />Réinitialiser</Button></div>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over) move(String(active.id), String(over.id)); }}
      accessibility={{ screenReaderInstructions: { draggable: "Appuyez sur Espace pour déplacer, utilisez les flèches, puis Espace pour déposer ou Échap pour annuler." } }}>
      <SortableContext items={available.map(w => w.id)} strategy={rectSortingStrategy}>
        <div className="grid grid-cols-2 gap-3 items-start" aria-label={surface === "evolution" ? "Modules d’évolution" : "Modules de l’accueil"}>
          {editing ? available.map((config, i) => {
            const widget = widgets.find(w => w.props.id === config.id);
            return widget ? <SortableWidget key={config.id} widget={widget} config={config} editing first={!config.folder || available[i - 1]?.folder !== config.folder} canGroup={i > 0}
              toggleHidden={toggleHidden} toggleWidth={toggleWidth} group={group} ungroup={ungroup} rename={rename} /> : null;
          }) : segmentLayout(available.filter(c => !c.hidden)).map(seg => {
            const render = (config: WidgetLayout) => { const widget = widgets.find(w => w.props.id === config.id);
              return widget ? <SortableWidget key={config.id} widget={widget} config={config} editing={false} first canGroup={false}
                toggleHidden={toggleHidden} toggleWidth={toggleWidth} group={group} ungroup={ungroup} rename={rename} /> : null; };
            if (!seg.folder) return render(seg.items[0]);
            return <details key={`f-${seg.items[0].id}`} className="group col-span-2 rounded-lg border bg-card">
              <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-semibold">
                <Folder className="h-4 w-4 text-primary" /><span className="flex-1 break-words">{seg.folder}</span>
                <span className="text-xs font-normal text-muted-foreground">{seg.items.length} cartes</span>
                <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
              </summary>
              <div className="grid grid-cols-2 gap-3 items-start p-2 pt-0">{seg.items.map(render)}</div>
            </details>;
          })}
        </div>
      </SortableContext>
    </DndContext>
  </div>;
}
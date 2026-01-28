import { useMemo } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { LayoutItem, Widget } from '../../api/client';
import WidgetContainer from './WidgetContainer';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ReactGridLayout = GridLayout as any;

interface DashboardGridProps {
  layout: LayoutItem[];
  widgets: Widget[];
  widgetData: Record<string, unknown>;
  widgetLoading: Record<string, boolean>;
  widgetErrors: Record<string, string | undefined>;
  isEditMode: boolean;
  onLayoutChange: (layout: LayoutItem[]) => void;
  onRefreshWidget: (widgetId: string) => void;
  onConfigureWidget: (widgetId: string) => void;
  onRemoveWidget: (widgetId: string) => void;
  width: number;
}

const COLS = 12;
const ROW_HEIGHT = 60;
const MARGIN: [number, number] = [16, 16];

export default function DashboardGrid({
  layout,
  widgets,
  widgetData,
  widgetLoading,
  widgetErrors,
  isEditMode,
  onLayoutChange,
  onRefreshWidget,
  onConfigureWidget,
  onRemoveWidget,
  width,
}: DashboardGridProps) {
  // Convert LayoutItem[] to react-grid-layout format
  const gridLayout = useMemo(() => {
    return layout.map(item => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW || 2,
      minH: item.minH || 2,
      static: !isEditMode,
    }));
  }, [layout, isEditMode]);

  // Map widget data by ID
  const widgetMap = useMemo(() => {
    const map: Record<string, Widget> = {};
    widgets.forEach(w => { map[w.id] = w; });
    return map;
  }, [widgets]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLayoutChange = (newLayout: any[]) => {
    const updatedLayout: LayoutItem[] = newLayout.map(item => ({
      i: item.i,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      minW: item.minW,
      minH: item.minH,
    }));
    onLayoutChange(updatedLayout);
  };

  return (
    <ReactGridLayout
      className="dashboard-grid"
      layout={gridLayout}
      cols={COLS}
      rowHeight={ROW_HEIGHT}
      width={width}
      margin={MARGIN}
      isDraggable={isEditMode}
      isResizable={isEditMode}
      onLayoutChange={handleLayoutChange}
      draggableHandle=".drag-handle"
      compactType="vertical"
      preventCollision={false}
    >
      {layout.map(item => {
        const widget = widgetMap[item.i];
        if (!widget) return null;

        return (
          <div key={item.i}>
            <WidgetContainer
              widget={widget}
              data={widgetData[widget.id]}
              isLoading={widgetLoading[widget.id] || false}
              error={widgetErrors[widget.id]}
              isEditMode={isEditMode}
              onRefresh={() => onRefreshWidget(widget.id)}
              onConfigure={() => onConfigureWidget(widget.id)}
              onRemove={() => onRemoveWidget(widget.id)}
            />
          </div>
        );
      })}
    </ReactGridLayout>
  );
}

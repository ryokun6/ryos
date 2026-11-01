import "../../helpers/local-storage-stub";
import { beforeEach, describe, expect, test } from "bun:test";
import { ensureTestLocalStorage } from "../../setup";
import {
  deriveMobileOrder,
  migrateDashboardLayout,
  orderWidgetsForMobile,
  reconcileMobileOrder,
} from "../../../src/stores/dashboardLayout";
import {
  useDashboardStore,
  type DashboardWidget,
} from "../../../src/stores/useDashboardStore";

function widget(
  id: string,
  x: number,
  y: number,
): DashboardWidget {
  return {
    id,
    type: "clock",
    position: { x, y },
    size: { width: 100, height: 80 },
  };
}

const sampleWidgets = [
  widget("clock", 80, 120),
  widget("calendar", 300, 100),
  widget("weather", 580, 120),
];

describe("dashboard layout migration", () => {
  test("keeps desktop coordinates and derives mobile order by y then x", () => {
    const widgets = sampleWidgets.map((item) => ({ ...item, position: { ...item.position } }));
    const migrated = migrateDashboardLayout({ widgets }, 1);

    expect(migrated.widgets).toBe(widgets);
    expect(widgets.map((item) => item.position)).toEqual([
      { x: 80, y: 120 },
      { x: 300, y: 100 },
      { x: 580, y: 120 },
    ]);
    expect(migrated.mobileOrder).toEqual(["calendar", "clock", "weather"]);
  });

  test("a saved mobile order is kept and reconciled with new and removed widgets", () => {
    const widgets = [widget("a", 0, 0), widget("c", 10, 10)];
    const migrated = migrateDashboardLayout(
      { widgets, mobileOrder: ["b", "a", "a"] },
      2,
    );
    expect(migrated.mobileOrder).toEqual(["a", "c"]);
    expect((migrated.widgets as DashboardWidget[])[0].position).toEqual({ x: 0, y: 0 });
  });
});

describe("dashboard layout ordering", () => {
  test("reordering for mobile returns the same widget objects", () => {
    const widgets = [widget("a", 1, 2), widget("b", 3, 4)];
    const ordered = orderWidgetsForMobile(widgets, ["b", "a"]);
    expect(ordered.map((item) => item.id)).toEqual(["b", "a"]);
    expect(ordered[0]).toBe(widgets[1]);
    expect(ordered[1]).toBe(widgets[0]);
    expect(widgets[0].position).toEqual({ x: 1, y: 2 });
  });

  test("reconcile appends new ids and drops missing ones without sorting by position", () => {
    expect(reconcileMobileOrder(["b", "a"], ["a", "b", "c"])).toEqual([
      "b",
      "a",
      "c",
    ]);
    expect(deriveMobileOrder([widget("a", 5, 5), widget("b", 1, 0)])).toEqual([
      "b",
      "a",
    ]);
  });
});

describe("dashboard store layouts", () => {
  beforeEach(() => {
    ensureTestLocalStorage();
    useDashboardStore.setState({
      widgets: sampleWidgets,
      mobileOrder: ["clock", "calendar", "weather"],
    });
  });

  test("moving a widget updates desktop coordinates only", () => {
    const order = useDashboardStore.getState().mobileOrder;
    useDashboardStore.getState().moveWidget("clock", { x: 12, y: 34 });
    const state = useDashboardStore.getState();
    expect(state.mobileOrder).toBe(order);
    expect(state.widgets.find((item) => item.id === "clock")?.position).toEqual({
      x: 12,
      y: 34,
    });
    expect(state.widgets.find((item) => item.id === "calendar")?.position).toEqual({
      x: 300,
      y: 100,
    });
  });

  test("reordering mobile does not change desktop coordinates", () => {
    const widgets = useDashboardStore.getState().widgets;
    const positions = widgets.map((item) => ({ id: item.id, position: { ...item.position } }));
    useDashboardStore.getState().reorderMobileWidgets(["weather", "clock", "calendar"]);
    const state = useDashboardStore.getState();
    expect(state.mobileOrder).toEqual(["weather", "clock", "calendar"]);
    expect(state.widgets).toBe(widgets);
    expect(state.widgets.map((item) => ({ id: item.id, position: item.position }))).toEqual(
      positions,
    );
  });

  test("adding and removing a widget updates both layouts", () => {
    const id = useDashboardStore.getState().addWidget({
      type: "stocks",
      position: { x: 40, y: 50 },
      size: { width: 90, height: 70 },
    });
    let state = useDashboardStore.getState();
    expect(state.widgets.map((item) => item.id)).toContain(id);
    expect(state.mobileOrder.at(-1)).toBe(id);
    expect(state.widgets.find((item) => item.id === "clock")?.position).toEqual({
      x: 80,
      y: 120,
    });

    useDashboardStore.getState().removeWidget(id);
    state = useDashboardStore.getState();
    expect(state.widgets.some((item) => item.id === id)).toBe(false);
    expect(state.mobileOrder).not.toContain(id);
    expect(state.mobileOrder).toEqual(["clock", "calendar", "weather"]);
  });

  test("an identical mobile reorder does not write state", () => {
    const before = useDashboardStore.getState();
    useDashboardStore.getState().reorderMobileWidgets([...before.mobileOrder]);
    expect(useDashboardStore.getState()).toBe(before);
  });
});

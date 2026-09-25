import "../../helpers/local-storage-stub";
import { beforeEach, describe, expect, test } from "bun:test";
import type { SavedPlace } from "../../../src/apps/maps/utils/types";
import { useMapsStore } from "../../../src/stores/useMapsStore";

function place(id: string, name = id): SavedPlace {
  return {
    id,
    name,
    latitude: 25.033,
    longitude: 121.565,
  };
}

describe("useMapsStore home / work assignment", () => {
  beforeEach(() => {
    useMapsStore.setState({
      home: null,
      work: null,
      favorites: [],
      recents: [],
      selectedPlace: null,
      updatedAt: 0,
    });
  });

  test("setHome replaces the previous Home place", () => {
    const first = place("cafe", "Cafe");
    const second = place("park", "Park");

    useMapsStore.getState().setHome(first);
    expect(useMapsStore.getState().home).toMatchObject({ id: "cafe" });

    useMapsStore.getState().setHome(second);
    expect(useMapsStore.getState().home).toMatchObject({ id: "park", name: "Park" });
    expect(useMapsStore.getState().work).toBeNull();
  });

  test("setWork replaces the previous Work place", () => {
    useMapsStore.getState().setWork(place("office-a", "Office A"));
    useMapsStore.getState().setWork(place("office-b", "Office B"));

    expect(useMapsStore.getState().work).toMatchObject({
      id: "office-b",
      name: "Office B",
    });
    expect(useMapsStore.getState().home).toBeNull();
  });

  test("setHome(null) unsets Home and leaves Work alone", () => {
    useMapsStore.getState().setHome(place("home"));
    useMapsStore.getState().setWork(place("work"));

    useMapsStore.getState().setHome(null);

    expect(useMapsStore.getState().home).toBeNull();
    expect(useMapsStore.getState().work).toMatchObject({ id: "work" });
  });

  test("setWork(null) unsets Work and leaves Home alone", () => {
    useMapsStore.getState().setHome(place("home"));
    useMapsStore.getState().setWork(place("work"));

    useMapsStore.getState().setWork(null);

    expect(useMapsStore.getState().work).toBeNull();
    expect(useMapsStore.getState().home).toMatchObject({ id: "home" });
  });

  test("unsetting twice stays cleared", () => {
    useMapsStore.getState().setHome(place("home"));
    useMapsStore.getState().setHome(null);
    useMapsStore.getState().setHome(null);
    expect(useMapsStore.getState().home).toBeNull();
  });
});

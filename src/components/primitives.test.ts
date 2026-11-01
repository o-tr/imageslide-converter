import { describe, expect, it } from "vitest";
import { type TableColumn, nextSorters } from "./primitives";

type Row = { a: string; b: string };
const column = (
  key: string,
  sortOrder: TableColumn<Row>["sortOrder"] = null,
): TableColumn<Row> => ({
  title: key,
  key,
  sorter: { multiple: 1 },
  sortOrder,
});

describe("nextSorters", () => {
  it("cycles a column through ascend, descend and unsorted", () => {
    const states: TableColumn<Row>["sortOrder"][] = [null];
    for (let i = 0; i < 3; i++) {
      const columns = [column("a", states[i]), column("b")];
      const next = nextSorters(columns, columns[0]).find(
        (s) => s.columnKey === "a",
      );
      states.push(next ? next.order : null);
    }
    expect(states).toEqual([null, "ascend", "descend", null]);
  });

  it("keeps other active columns while clearing one", () => {
    const columns = [column("a", "ascend"), column("b", "descend")];
    expect(nextSorters(columns, columns[1])).toEqual([
      { columnKey: "a", order: "ascend" },
    ]);
    expect(nextSorters(columns, columns[0])).toEqual([
      { columnKey: "b", order: "descend" },
      { columnKey: "a", order: "descend" },
    ]);
  });
});

import { describe, expect, it } from "bun:test"
import { addDaysToDateOnly, formatDateOnly, getDateOnlyRange, parseDateOnly } from "./date-only"

describe("date-only helpers", () => {
  it("formats local dates without shifting into UTC", () => {
    expect(formatDateOnly(new Date(2026, 5, 2, 23, 30))).toBe("2026-06-02")
  })

  it("keeps June 2, 2026 on Tuesday in generated week dates", () => {
    const weekDates = getDateOnlyRange("2026-06-01", 7)

    expect(weekDates[1]).toBe("2026-06-02")
    expect(addDaysToDateOnly("2026-06-01", 1)).toBe("2026-06-02")
    expect(
      parseDateOnly(weekDates[1]).toLocaleDateString("en-US", { weekday: "short" })
    ).toBe("Tue")
  })
})

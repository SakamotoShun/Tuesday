import "@/test/setup"
import { describe, it, expect } from "bun:test"
import { useEffect } from "react"
import { act, render } from "@testing-library/react"
import { useDebounce } from "./use-debounce"

function DebounceProbe({
  value,
  delay,
  onChange,
}: {
  value: string
  delay: number
  onChange: (value: string) => void
}) {
  const debounced = useDebounce(value, delay)

  useEffect(() => {
    onChange(debounced)
  }, [debounced, onChange])

  return null
}

describe("useDebounce", () => {
  it("should delay updates until the timeout", async () => {
    const updates: string[] = []
    const handleChange = (value: string) => updates.push(value)

    const { rerender } = render(
      <DebounceProbe value="alpha" delay={25} onChange={handleChange} />
    )

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })

    act(() => {
      rerender(<DebounceProbe value="beta" delay={25} onChange={handleChange} />)
    })

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(updates[updates.length - 1]).toBe("alpha")

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30))
    })
    expect(updates[updates.length - 1]).toBe("beta")
  })
})

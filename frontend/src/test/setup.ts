import "@testing-library/jest-dom"
import { cleanup } from "@testing-library/react"
import { afterEach } from "bun:test"
import { Window } from "happy-dom"

if (typeof globalThis.document === "undefined") {
  const window = new Window()
  globalThis.window = window as unknown as Window & typeof globalThis.window
  globalThis.document = window.document as unknown as Document
  globalThis.navigator = window.navigator as unknown as Navigator
}

await import("@testing-library/dom")

afterEach(() => {
  cleanup()
})

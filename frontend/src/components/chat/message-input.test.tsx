import "@/test/setup"
import React from "react"
import { beforeEach, describe, expect, it, mock } from "bun:test"

let uploadFileImpl = async (_file: File) => ({
  id: "file-1",
  originalName: "notes.txt",
  mimeType: "text/plain",
  sizeBytes: 12,
  createdAt: new Date().toISOString(),
  uploadedBy: "user-1",
  url: "/files/file-1",
})

mock.module("@/api/files", () => ({
  uploadFile: (file: File) => uploadFileImpl(file),
  deleteFile: async () => undefined,
}))

const { fireEvent, render, waitFor } = await import("@testing-library/react")
const { MessageInput } = await import("./message-input")

describe("MessageInput", () => {
  beforeEach(() => {
    uploadFileImpl = async (_file: File) => ({
      id: "file-1",
      originalName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 12,
      createdAt: new Date().toISOString(),
      uploadedBy: "user-1",
      url: "/files/file-1",
    })

    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    }) as typeof globalThis.requestAnimationFrame
  })

  it("shows upload progress and then renders the uploaded attachment", async () => {
    let resolveUpload: ((value: Awaited<ReturnType<typeof uploadFileImpl>>) => void) | null = null

    uploadFileImpl = (_file: File) =>
      new Promise((resolve) => {
        resolveUpload = resolve
      })

    const view = render(
      <MessageInput onSend={async () => undefined} onTyping={() => undefined} />
    )

    const input = view.container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["hello world"], "notes.txt", { type: "text/plain" })

    fireEvent.change(input, {
      target: { files: [file] },
    })

    expect(view.getByText("Uploading attachments...")).toBeDefined()
    expect(resolveUpload).not.toBeNull()

    resolveUpload?.({
      id: "file-1",
      originalName: "notes.txt",
      mimeType: "text/plain",
      sizeBytes: 11,
      createdAt: new Date().toISOString(),
      uploadedBy: "user-1",
      url: "/files/file-1",
    })

    await waitFor(() => {
      expect(view.getByText("notes.txt")).toBeDefined()
    })

    await waitFor(() => {
      expect(view.queryByText("Uploading attachments...")).toBeNull()
    })
  })
})

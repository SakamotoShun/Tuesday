import "@/test/setup"
import { describe, expect, it } from "bun:test"
import {
  filterReferencedWhiteboardFiles,
  getWhiteboardSceneKey,
  mergeWhiteboardScene,
} from "./whiteboard-scene"

describe("whiteboard scene helpers", () => {
  it("detects finalized binary data under an existing file ID", () => {
    const pending = {
      elements: [{ id: "image-1", version: 1, versionNonce: 10, fileId: "file-1" }],
      files: { "file-1": { id: "file-1", dataURL: "data:image/png;base64," } },
    }
    const finalized = {
      ...pending,
      files: { "file-1": { id: "file-1", dataURL: "data:image/png;base64,AQID" } },
    }

    expect(getWhiteboardSceneKey(finalized)).not.toBe(getWhiteboardSceneKey(pending))
  })

  it("unions file maps and uses version nonce to resolve equal versions", () => {
    const merged = mergeWhiteboardScene(
      {
        elements: [{ id: "image-1", version: 2, versionNonce: 100, fileId: "file-1", x: 10 }],
        files: { "file-1": { id: "file-1", dataURL: "first" } },
      },
      {
        elements: [
          { id: "image-1", version: 2, versionNonce: 50, fileId: "file-1", x: 20 },
          { id: "image-2", version: 1, versionNonce: 1, fileId: "file-2" },
        ],
        files: { "file-2": { id: "file-2", dataURL: "second" } },
      }
    )

    expect(merged.elements).toEqual([
      { id: "image-1", version: 2, versionNonce: 100, fileId: "file-1", x: 10 },
      { id: "image-2", version: 1, versionNonce: 1, fileId: "file-2" },
    ])
    expect(merged.files).toEqual({
      "file-1": { id: "file-1", dataURL: "first" },
      "file-2": { id: "file-2", dataURL: "second" },
    })
  })

  it("keeps only files referenced by live elements", () => {
    expect(filterReferencedWhiteboardFiles(
      [
        { id: "live", fileId: "file-1" },
        { id: "deleted", fileId: "file-2", isDeleted: true },
      ],
      {
        "file-1": { dataURL: "keep" },
        "file-2": { dataURL: "deleted" },
        "file-3": { dataURL: "orphan" },
      }
    )).toEqual({ "file-1": { dataURL: "keep" } })
  })
})

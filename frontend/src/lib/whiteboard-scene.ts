export type WhiteboardElement = {
  id: string
  version?: number
  versionNonce?: number
  isDeleted?: boolean
  fileId?: string
  [key: string]: unknown
}

export type WhiteboardFiles = Record<string, unknown>

export type WhiteboardScene = {
  elements: readonly WhiteboardElement[]
  files?: WhiteboardFiles
}

export const blankWhiteboardScene: WhiteboardScene = {
  elements: [],
  files: {},
}

export const isWhiteboardScene = (value: unknown): value is WhiteboardScene => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false
  const scene = value as { elements?: unknown; files?: unknown }
  if (!Array.isArray(scene.elements)) return false
  if (!scene.elements.every((element) => (
    typeof element === "object"
    && element !== null
    && !Array.isArray(element)
    && typeof (element as { id?: unknown }).id === "string"
  ))) return false
  return scene.files === undefined || (
    typeof scene.files === "object" && scene.files !== null && !Array.isArray(scene.files)
  )
}

export const mergeWhiteboardElements = (
  base: WhiteboardScene["elements"],
  incoming: WhiteboardScene["elements"]
) => {
  const merged = new Map(base.map((element) => [element.id, element]))

  for (const element of incoming) {
    const current = merged.get(element.id)
    const currentVersion = current?.version ?? 0
    const nextVersion = element.version ?? 0
    const currentVersionNonce = current?.versionNonce ?? 0
    const nextVersionNonce = element.versionNonce ?? 0

    if (
      !current
      || nextVersion > currentVersion
      || (nextVersion === currentVersion && nextVersionNonce >= currentVersionNonce)
    ) {
      merged.set(element.id, element)
    }
  }

  return Array.from(merged.values())
}

export const mergeWhiteboardScene = (
  base: WhiteboardScene,
  incoming: WhiteboardScene
): WhiteboardScene => ({
  elements: mergeWhiteboardElements(base.elements, incoming.elements),
  files: { ...(base.files ?? {}), ...(incoming.files ?? {}) },
})

export const filterReferencedWhiteboardFiles = (
  elements: WhiteboardScene["elements"],
  files: WhiteboardFiles = {}
) => {
  const filtered: WhiteboardFiles = {}

  for (const element of elements) {
    if (element.isDeleted || typeof element.fileId !== "string") continue
    if (files[element.fileId] !== undefined) {
      filtered[element.fileId] = files[element.fileId]
    }
  }

  return filtered
}

const hashString = (value: string) => {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export const getWhiteboardSceneKey = (scene: WhiteboardScene) => {
  const elementSignature = scene.elements
    .map((element) => (
      `${element.id}:${element.version ?? 0}:${element.versionNonce ?? 0}:${element.isDeleted ? 1 : 0}`
    ))
    .join("|")
  const fileSignature = Object.entries(scene.files ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([fileId, file]) => `${fileId}:${hashString(JSON.stringify(file) ?? "")}`)
    .join("|")

  return `${elementSignature}::${fileSignature}`
}

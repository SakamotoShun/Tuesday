import data from "@emoji-mart/data"
import Picker from "@emoji-mart/react"

interface EmojiPickerProps {
  onSelect: (emoji: string) => void
  theme?: "light" | "dark"
}

type EmojiSelectData = {
  native?: string
}

export function EmojiPicker({ onSelect, theme = "light" }: EmojiPickerProps) {
  return (
    <Picker
      data={data}
      onEmojiSelect={(emoji: EmojiSelectData) => {
        if (emoji.native) {
          onSelect(emoji.native)
        }
      }}
      previewPosition="none"
      skinTonePosition="none"
      theme={theme}
    />
  )
}

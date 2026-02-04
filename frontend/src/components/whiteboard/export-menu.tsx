import { Button } from "@/components/ui/button"

interface ExportMenuProps {
  onExportPng: () => void
  onExportSvg: () => void
}

export function ExportMenu({ onExportPng, onExportSvg }: ExportMenuProps) {
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={onExportPng}>
        Export PNG
      </Button>
      <Button variant="outline" size="sm" onClick={onExportSvg}>
        Export SVG
      </Button>
    </div>
  )
}

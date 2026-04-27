import { PrismAsyncLight } from "react-syntax-highlighter"
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash"
import json from "react-syntax-highlighter/dist/esm/languages/prism/json"
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown"
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql"
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript"
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript"
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx"
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx"
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml"
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism"

PrismAsyncLight.registerLanguage("bash", bash)
PrismAsyncLight.registerLanguage("sh", bash)
PrismAsyncLight.registerLanguage("shell", bash)
PrismAsyncLight.registerLanguage("json", json)
PrismAsyncLight.registerLanguage("markdown", markdown)
PrismAsyncLight.registerLanguage("md", markdown)
PrismAsyncLight.registerLanguage("sql", sql)
PrismAsyncLight.registerLanguage("typescript", typescript)
PrismAsyncLight.registerLanguage("ts", typescript)
PrismAsyncLight.registerLanguage("javascript", javascript)
PrismAsyncLight.registerLanguage("js", javascript)
PrismAsyncLight.registerLanguage("jsx", jsx)
PrismAsyncLight.registerLanguage("tsx", tsx)
PrismAsyncLight.registerLanguage("yaml", yaml)
PrismAsyncLight.registerLanguage("yml", yaml)

interface CodeBlockProps {
  code: string
  language: string
  isDark: boolean
}

export function CodeBlock({ code, language, isDark }: CodeBlockProps) {
  return (
    <PrismAsyncLight
      language={language}
      style={isDark ? oneDark : oneLight}
      customStyle={{ margin: 0, borderRadius: "0.375rem", fontSize: "13px" }}
      codeTagProps={{ className: "font-mono" }}
    >
      {code}
    </PrismAsyncLight>
  )
}

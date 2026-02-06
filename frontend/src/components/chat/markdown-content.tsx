import { Children, isValidElement, useEffect, useMemo, useState, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism"
import remarkGfm from "remark-gfm"
import { useUIStore } from "@/store/ui-store"

interface MarkdownContentProps {
  content: string
}

const mentionRegex = /(@[a-zA-Z0-9._-]+)/g

const highlightMentions = (text: string) => {
  const parts = text.split(mentionRegex)
  return parts.map((part, index) => {
    if (part.startsWith("@")) {
      return (
        <span key={`${part}-${index}`} className="text-primary font-semibold">
          {part}
        </span>
      )
    }
    return <span key={`${part}-${index}`}>{part}</span>
  })
}

const renderMentions = (children: ReactNode) =>
  Children.map(children, (child) => {
    if (typeof child === "string") {
      return highlightMentions(child)
    }
    if (isValidElement(child)) {
      if (child.type === "code" || child.type === "pre") {
        return child
      }
      return child
    }
    return child
  })

const getMarkdownComponents = (isDark: boolean): Components => ({
  p: ({ children }) => <p className="mb-1 last:mb-0">{renderMentions(children)}</p>,
  strong: ({ children }) => <strong className="font-semibold">{renderMentions(children)}</strong>,
  em: ({ children }) => <em className="italic">{renderMentions(children)}</em>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline break-all hover:no-underline"
    >
      {renderMentions(children)}
    </a>
  ),
  ul: ({ children }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li>{renderMentions(children)}</li>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-muted-foreground/30 pl-3 my-1 text-muted-foreground italic">
      {renderMentions(children)}
    </blockquote>
  ),
  h1: ({ children }) => <h1 className="text-base font-semibold">{renderMentions(children)}</h1>,
  h2: ({ children }) => <h2 className="text-sm font-semibold">{renderMentions(children)}</h2>,
  h3: ({ children }) => <h3 className="text-sm font-medium">{renderMentions(children)}</h3>,
  h4: ({ children }) => <h4 className="text-sm font-medium">{renderMentions(children)}</h4>,
  h5: ({ children }) => <h5 className="text-sm font-medium">{renderMentions(children)}</h5>,
  h6: ({ children }) => <h6 className="text-sm font-medium">{renderMentions(children)}</h6>,
  code: (props) => {
    const { inline, className, children } = props as {
      inline?: boolean
      className?: string
      children?: ReactNode
    }

    if (inline) {
      return <code className="bg-muted px-1 py-0.5 rounded text-[13px] font-mono">{children}</code>
    }

    const languageMatch = /language-([\w-]+)/.exec(className ?? "")
    const language = languageMatch?.[1] ?? "text"
    const code = String(children ?? "").replace(/\n$/, "")

    return (
      <SyntaxHighlighter
        language={language}
        style={isDark ? oneDark : oneLight}
        customStyle={{ margin: 0, borderRadius: "0.375rem", fontSize: "13px" }}
        codeTagProps={{ className: "font-mono" }}
      >
        {code}
      </SyntaxHighlighter>
    )
  },
  pre: ({ children }) => <>{children}</>,
  hr: () => <hr className="border-t border-border my-2" />,
  img: ({ alt, ...props }) => <img alt={alt ?? ""} className="max-w-full rounded my-1" {...props} />,
  table: ({ children }) => (
    <div className="my-1 overflow-x-auto">
      <table className="w-full text-xs border border-border border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-muted/50">{children}</thead>,
  th: ({ children }) => (
    <th className="border border-border px-2 py-1 text-left font-semibold">{renderMentions(children)}</th>
  ),
  td: ({ children }) => (
    <td className="border border-border px-2 py-1 align-top">{renderMentions(children)}</td>
  ),
})

export function MarkdownContent({ content }: MarkdownContentProps) {
  const themePreference = useUIStore((state) => state.theme)
  const [resolvedTheme, setResolvedTheme] = useState<"light" | "dark">("light")

  useEffect(() => {
    if (themePreference === "system") {
      const media = window.matchMedia("(prefers-color-scheme: dark)")
      const updateTheme = () => setResolvedTheme(media.matches ? "dark" : "light")
      updateTheme()
      media.addEventListener("change", updateTheme)
      return () => media.removeEventListener("change", updateTheme)
    }

    setResolvedTheme(themePreference)
    return undefined
  }, [themePreference])

  const markdownComponents = useMemo(
    () => getMarkdownComponents(resolvedTheme === "dark"),
    [resolvedTheme]
  )

  return (
    <div className="text-sm text-foreground leading-normal">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

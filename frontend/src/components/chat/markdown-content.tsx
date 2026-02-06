import { Children, isValidElement, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

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

const markdownComponents: Components = {
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
    const { inline, children } = props as { inline?: boolean; children?: ReactNode }
    return inline ? (
      <code className="bg-muted px-1 py-0.5 rounded text-[13px] font-mono">{children}</code>
    ) : (
      <code className="text-[13px] font-mono">{children}</code>
    )
  },
  pre: ({ children }) => <pre className="bg-muted p-3 rounded-md overflow-x-auto my-1">{children}</pre>,
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
}

export function MarkdownContent({ content }: MarkdownContentProps) {
  return (
    <div className="text-sm text-foreground leading-normal">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {content}
      </ReactMarkdown>
    </div>
  )
}

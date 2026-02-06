import { ChatView } from "@/components/chat/chat-view"

export function ChatPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-72px-4rem)] min-h-0 gap-6 overflow-hidden">
      <h1 className="font-serif text-[32px] font-bold flex-shrink-0">Chat</h1>
      <div className="flex flex-1 min-h-0">
        <ChatView />
      </div>
    </div>
  )
}

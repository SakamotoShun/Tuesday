import { ChatView } from "@/components/chat/chat-view"

export function ChatPage() {
  return (
    <div className="flex flex-col flex-1 min-h-0 gap-6">
      <h1 className="font-serif text-[32px] font-bold">Chat</h1>
      <div className="flex flex-1 min-h-0">
        <ChatView />
      </div>
    </div>
  )
}

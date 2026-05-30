import { useState } from "react"
import { useMcpTokens } from "@/hooks/use-mcp-tokens"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Separator } from "@/components/ui/separator"
import { Trash, Plus, CopySimple, Check } from "@/lib/icons"
import type { McpScope, CreateMcpTokenInput } from "@/api/types"

const ALL_SCOPES: McpScope[] = [
  "projects:read",
  "tasks:read",
  "tasks:write",
  "docs:read",
  "docs:write",
  "meetings:read",
  "meetings:write",
  "time:read",
  "time:write",
  "search:read",
]

const SCOPE_LABELS: Record<McpScope, string> = {
  "projects:read": "Read projects",
  "tasks:read": "Read tasks",
  "tasks:write": "Create/update tasks",
  "docs:read": "Read docs",
  "docs:write": "Create/update docs",
  "meetings:read": "Read meetings",
  "meetings:write": "Create/update meetings",
  "time:read": "Read time entries",
  "time:write": "Log time entries",
  "search:read": "Search workspace",
}

function CreatedTokenDisplay({
  rawToken,
  onClose,
}: {
  rawToken: string
  onClose: () => void
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rawToken)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Your new MCP token</Label>
        <div className="flex gap-2">
          <Input value={rawToken} readOnly className="font-mono text-xs" />
          <Button size="icon" variant="outline" onClick={handleCopy}>
            {copied ? <Check className="h-4 w-4 text-green-500" /> : <CopySimple className="h-4 w-4" />}
          </Button>
        </div>
        <p className="text-sm text-destructive font-medium">
          Copy this token now. It will not be shown again.
        </p>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium">Example client config</p>
        <pre className="text-xs bg-muted p-3 rounded-md overflow-x-auto">
{`mcp_servers:
  tuesday:
    url: "https://your-tuesday.example.com/api/mcp"
    headers:
      Authorization: "Bearer ${rawToken}"`}
        </pre>
      </div>

      <Button onClick={onClose} className="w-full">
        I've saved my token
      </Button>
    </div>
  )
}

export function McpTokenSection() {
  const { tokens, isLoading, createToken, revokeToken } = useMcpTokens()
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState("")
  const [selectedScopes, setSelectedScopes] = useState<Set<McpScope>>(new Set())
  const [createdToken, setCreatedToken] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newName.trim() || selectedScopes.size === 0) return

    try {
      const result = await createToken.mutateAsync({
        name: newName.trim(),
        scopes: Array.from(selectedScopes),
      })
      setCreatedToken(result.rawToken)
      setNewName("")
      setSelectedScopes(new Set())
    } catch {
      // error handled by mutation
    }
  }

  const toggleScope = (scope: McpScope) => {
    const next = new Set(selectedScopes)
    if (next.has(scope)) next.delete(scope)
    else next.add(scope)
    setSelectedScopes(next)
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>MCP Access Tokens</CardTitle>
          <Button size="sm" variant="outline" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />
            Create token
          </Button>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            MCP tokens allow AI agents to access Tuesday as a tool server. Each token is scoped to specific capabilities.
          </p>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading tokens...</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No tokens created yet. Create one to let an AI agent access Tuesday.
            </p>
          ) : (
            <div className="space-y-3">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between p-3 border rounded-md"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{token.name}</span>
                      {token.revokedAt && <Badge variant="destructive">Revoked</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {token.scopes.map((s) => (
                        <Badge key={s} variant="secondary" className="text-xs">
                          {SCOPE_LABELS[s] ?? s}
                        </Badge>
                      ))}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Created {new Date(token.createdAt).toLocaleDateString()}
                      {token.lastUsedAt && (
                        <span> · Last used {new Date(token.lastUsedAt).toLocaleDateString()}</span>
                      )}
                      {token.expiresAt && (
                        <span> · Expires {new Date(token.expiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>
                  {!token.revokedAt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive shrink-0 ml-2"
                      onClick={() => revokeToken.mutate(token.id)}
                    >
                      <Trash className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-md">
          {createdToken ? (
            <CreatedTokenDisplay
              rawToken={createdToken}
              onClose={() => {
                setCreatedToken(null)
                setShowCreate(false)
                setNewName("")
              }}
            />
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create MCP Token</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="token-name">Token name</Label>
                  <Input
                    id="token-name"
                    placeholder="e.g., Claude Desktop"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <Label>Scopes</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {ALL_SCOPES.map((scope) => (
                      <label
                        key={scope}
                        className="flex items-center gap-2 text-sm cursor-pointer py-1"
                      >
                        <input
                          type="checkbox"
                          checked={selectedScopes.has(scope)}
                          onChange={() => toggleScope(scope)}
                          className="rounded"
                        />
                        {SCOPE_LABELS[scope]}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreate(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={!newName.trim() || selectedScopes.size === 0 || createToken.isPending}
                >
                  {createToken.isPending ? "Creating..." : "Create token"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
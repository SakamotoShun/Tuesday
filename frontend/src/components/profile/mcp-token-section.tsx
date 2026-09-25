import { useId, useState } from "react"
import { ApiErrorResponse } from "@/api/client"
import { useMcpTokens } from "@/hooks/use-mcp-tokens"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Trash, Plus, CopySimple, Check } from "@/lib/icons"
import type { McpScope, McpTokenListItem } from "@/api/types"

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

const READ_SCOPE_FOR_WRITE: Partial<Record<McpScope, McpScope>> = {
  "tasks:write": "tasks:read",
  "docs:write": "docs:read",
  "meetings:write": "meetings:read",
  "time:write": "time:read",
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
    url: "https://your-tuesday.example.com/mcp"
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
  const [tokenToDelete, setTokenToDelete] = useState<McpTokenListItem | null>(null)
  const deleteDialogId = useId()
  const deleteError = revokeToken.isError
    ? revokeToken.error instanceof ApiErrorResponse
      ? revokeToken.error.message
      : "Failed to delete token. Please try again."
    : null

  const handleDelete = () => {
    if (!tokenToDelete || revokeToken.isPending) return

    revokeToken.mutate(tokenToDelete.id, {
      onSuccess: () => setTokenToDelete(null),
    })
  }

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
    if (next.has(scope)) {
      next.delete(scope)
      for (const [writeScope, readScope] of Object.entries(READ_SCOPE_FOR_WRITE) as [McpScope, McpScope][]) {
        if (readScope === scope) next.delete(writeScope)
      }
    } else {
      next.add(scope)
      const readScope = READ_SCOPE_FOR_WRITE[scope]
      if (readScope) next.add(readScope)
    }
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

          {deleteError && !tokenToDelete && (
            <p role="alert" className="text-sm text-destructive mb-4">{deleteError}</p>
          )}

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading tokens...</p>
          ) : tokens.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No access tokens. Create one to let an AI agent access Tuesday.
            </p>
          ) : (
            <div className="space-y-3">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-3 border rounded-md"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{token.name}</span>
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive shrink-0 self-start sm:self-center"
                    aria-label={`Delete token ${token.name}`}
                    disabled={revokeToken.isPending}
                    onClick={() => {
                      revokeToken.reset()
                      setTokenToDelete(token)
                    }}
                  >
                    <Trash className="h-4 w-4 mr-1" aria-hidden="true" />
                    Delete token
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={tokenToDelete !== null} onOpenChange={(open) => {
        if (!open) setTokenToDelete(null)
      }}>
        <DialogContent
          className="max-w-md space-y-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${deleteDialogId}-title`}
          aria-describedby={`${deleteDialogId}-description`}
        >
          <DialogHeader>
            <DialogTitle id={`${deleteDialogId}-title`}>Delete token</DialogTitle>
            <DialogDescription id={`${deleteDialogId}-description`}>
              Delete <strong>{tokenToDelete?.name}</strong>? This immediately revokes its access
              and removes it from this list. Any clients using it will need a new token.
            </DialogDescription>
          </DialogHeader>
          {deleteError && (
            <p role="alert" className="text-sm text-destructive">{deleteError}</p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setTokenToDelete(null)} disabled={revokeToken.isPending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={revokeToken.isPending}>
              {revokeToken.isPending ? "Deleting..." : "Delete token"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

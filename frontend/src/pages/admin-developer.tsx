import { useEffect, useState } from "react"
import { Link } from "react-router-dom"
import { useAuth } from "@/hooks/use-auth"
import { useAdminSettings } from "@/hooks/use-admin"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { BotManagement } from "@/components/admin/bot-management"
import { ApiErrorResponse } from "@/api/client"

export function AdminDeveloperPage() {
  const { user } = useAuth()
  const { settings, isLoading, updateSettings, sendTestEmail } = useAdminSettings()

  const [openaiApiKey, setOpenaiApiKey] = useState("")
  const [openrouterApiKey, setOpenrouterApiKey] = useState("")
  const [siteUrl, setSiteUrl] = useState("")
  const [jaasEnabled, setJaasEnabled] = useState(false)
  const [jaasAppId, setJaasAppId] = useState("")
  const [jaasDomain, setJaasDomain] = useState("8x8.vc")
  const [jaasDefaultProvider, setJaasDefaultProvider] = useState(true)
  const [jaasKeyId, setJaasKeyId] = useState("")
  const [jaasPrivateKey, setJaasPrivateKey] = useState("")
  const [jaasMessage, setJaasMessage] = useState<string | null>(null)
  const [jaasError, setJaasError] = useState<string | null>(null)
  const [smtpHost, setSmtpHost] = useState("")
  const [smtpPort, setSmtpPort] = useState("587")
  const [smtpUser, setSmtpUser] = useState("")
  const [smtpPass, setSmtpPass] = useState("")
  const [smtpFrom, setSmtpFrom] = useState("")
  const [smtpSecure, setSmtpSecure] = useState(false)
  const [smtpMessage, setSmtpMessage] = useState<string | null>(null)
  const [smtpError, setSmtpError] = useState<string | null>(null)

  useEffect(() => {
    setSiteUrl(settings?.siteUrl ?? "")
  }, [settings?.siteUrl])

  useEffect(() => {
    setJaasEnabled(settings?.jaasEnabled ?? false)
  }, [settings?.jaasEnabled])

  useEffect(() => {
    setJaasAppId(settings?.jaasAppId ?? "")
  }, [settings?.jaasAppId])

  useEffect(() => {
    setJaasDomain(settings?.jaasDomain ?? "8x8.vc")
  }, [settings?.jaasDomain])

  useEffect(() => {
    setJaasDefaultProvider(settings?.jaasDefaultProvider ?? true)
  }, [settings?.jaasDefaultProvider])

  useEffect(() => {
    setJaasKeyId(settings?.jaasKeyId ?? "")
  }, [settings?.jaasKeyId])

  useEffect(() => {
    setSmtpHost(settings?.smtpHost ?? "")
  }, [settings?.smtpHost])

  useEffect(() => {
    setSmtpPort(String(settings?.smtpPort ?? 587))
  }, [settings?.smtpPort])

  useEffect(() => {
    setSmtpUser(settings?.smtpUser ?? "")
  }, [settings?.smtpUser])

  useEffect(() => {
    setSmtpFrom(settings?.smtpFrom ?? "")
  }, [settings?.smtpFrom])

  useEffect(() => {
    setSmtpSecure(settings?.smtpSecure ?? false)
  }, [settings?.smtpSecure])

  if (user?.role !== "admin") {
    return <div className="p-6 text-sm text-muted-foreground">Admin access required.</div>
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading developer settings...</div>
  }

  const hasOpenAiApiKey = Boolean(settings?.openaiApiKey)
  const hasOpenRouterApiKey = Boolean(settings?.openrouterApiKey)
  const hasSmtpPassword = Boolean(settings?.smtpPass)
  const hasJaasPrivateKey = Boolean(settings?.jaasPrivateKey)

  const handleSaveSmtp = () => {
    const parsedPort = Number.parseInt(smtpPort, 10)
    if (!Number.isInteger(parsedPort) || parsedPort <= 0 || parsedPort > 65535) {
      setSmtpError("SMTP port must be a number between 1 and 65535")
      setSmtpMessage(null)
      return
    }

    setSmtpError(null)
    setSmtpMessage(null)
    updateSettings.mutate(
      {
        siteUrl: siteUrl.trim(),
        smtpHost: smtpHost.trim(),
        smtpPort: parsedPort,
        smtpUser: smtpUser.trim(),
        smtpPass: smtpPass.trim() || undefined,
        smtpFrom: smtpFrom.trim(),
        smtpSecure,
      },
      {
        onSuccess: () => {
          setSmtpPass("")
          setSmtpMessage("SMTP settings saved")
        },
        onError: (error) => {
          if (error instanceof ApiErrorResponse) {
            setSmtpError(error.message)
          } else {
            setSmtpError("Failed to save SMTP settings")
          }
        },
      }
    )
  }

  const handleSendTestEmail = () => {
    setSmtpError(null)
    setSmtpMessage(null)
    sendTestEmail.mutate(undefined, {
      onSuccess: () => {
        setSmtpMessage("Test email sent to your account email")
      },
      onError: (error) => {
        if (error instanceof ApiErrorResponse) {
          setSmtpError(error.message)
        } else {
          setSmtpError("Failed to send test email")
        }
      },
    })
  }

  const handleSaveJaas = () => {
    if (jaasEnabled && !jaasAppId.trim()) {
      setJaasError("JaaS App ID is required when JaaS is enabled")
      setJaasMessage(null)
      return
    }

    setJaasError(null)
    setJaasMessage(null)
    updateSettings.mutate(
      {
        jaasEnabled,
        jaasAppId: jaasAppId.trim(),
        jaasDomain: jaasDomain.trim() || "8x8.vc",
        jaasDefaultProvider,
        jaasKeyId: jaasKeyId.trim(),
        jaasPrivateKey: jaasPrivateKey.trim() || undefined,
      },
      {
        onSuccess: () => {
          setJaasPrivateKey("")
          setJaasMessage("JaaS settings saved")
        },
        onError: (error) => {
          if (error instanceof ApiErrorResponse) {
            setJaasError(error.message)
          } else {
            setJaasError("Failed to save JaaS settings")
          }
        },
      }
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-[32px] font-bold">Developer Settings</h1>
          <p className="text-sm text-muted-foreground">Configure integrations, API keys, and SMTP delivery.</p>
        </div>
        <Button asChild variant="outline">
          <Link to="/admin">Back to Admin</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>SMTP Email</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {smtpError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{smtpError}</div>}
          {smtpMessage && <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">{smtpMessage}</div>}

          <div className="space-y-2">
            <Label htmlFor="site-url">Site URL</Label>
            <div className="text-sm text-muted-foreground">
              Public URL used for webhook links and password reset URLs.
            </div>
            <Input
              id="site-url"
              value={siteUrl}
              onChange={(event) => setSiteUrl(event.target.value)}
              placeholder="https://workhub.example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-host">SMTP host</Label>
            <Input
              id="smtp-host"
              value={smtpHost}
              onChange={(event) => setSmtpHost(event.target.value)}
              placeholder="smtp.example.com"
            />
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="smtp-port">SMTP port</Label>
              <Input
                id="smtp-port"
                value={smtpPort}
                onChange={(event) => setSmtpPort(event.target.value)}
                placeholder="587"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="smtp-user">SMTP username</Label>
              <Input
                id="smtp-user"
                value={smtpUser}
                onChange={(event) => setSmtpUser(event.target.value)}
                placeholder="noreply@example.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-pass">SMTP password</Label>
            <Input
              id="smtp-pass"
              type="password"
              value={smtpPass}
              onChange={(event) => setSmtpPass(event.target.value)}
              placeholder={hasSmtpPassword ? "Enter new password to replace" : "SMTP password"}
            />
            {hasSmtpPassword && (
              <div className="text-xs text-muted-foreground">An SMTP password is currently configured.</div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="smtp-from">From address</Label>
            <Input
              id="smtp-from"
              value={smtpFrom}
              onChange={(event) => setSmtpFrom(event.target.value)}
              placeholder="WorkHub <noreply@example.com>"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="smtp-secure" className="flex flex-col gap-1">
              <span>Use secure SMTP (TLS/SSL)</span>
              <span className="font-normal text-sm text-muted-foreground">Enable for providers that require port 465 TLS.</span>
            </Label>
            <Switch id="smtp-secure" checked={smtpSecure} onCheckedChange={setSmtpSecure} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={handleSaveSmtp} disabled={updateSettings.isPending || sendTestEmail.isPending}>
              {updateSettings.isPending ? "Saving..." : "Save Developer Settings"}
            </Button>
            {hasSmtpPassword && (
              <Button
                variant="outline"
                disabled={updateSettings.isPending || sendTestEmail.isPending}
                onClick={() => updateSettings.mutate({ smtpPass: "" })}
              >
                Remove SMTP Password
              </Button>
            )}
            <Button variant="outline" onClick={handleSendTestEmail} disabled={updateSettings.isPending || sendTestEmail.isPending}>
              {sendTestEmail.isPending ? "Sending test email..." : "Send Test Email"}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI Provider API Keys</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="openai-api-key">OpenAI API Key</Label>
            <div className="text-sm text-muted-foreground">
              Required for AI bots using OpenAI.
              {hasOpenAiApiKey && <span className="ml-1 font-medium text-foreground">Current key: {settings?.openaiApiKey}</span>}
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                id="openai-api-key"
                type="password"
                value={openaiApiKey}
                onChange={(event) => setOpenaiApiKey(event.target.value)}
                placeholder={hasOpenAiApiKey ? "Enter new key to replace" : "sk-..."}
              />
              <Button
                onClick={() => {
                  updateSettings.mutate({ openaiApiKey: openaiApiKey.trim() })
                  setOpenaiApiKey("")
                }}
                disabled={updateSettings.isPending || !openaiApiKey.trim()}
              >
                Save
              </Button>
              {hasOpenAiApiKey && (
                <Button
                  variant="outline"
                  onClick={() => {
                    updateSettings.mutate({ openaiApiKey: "" })
                    setOpenaiApiKey("")
                  }}
                  disabled={updateSettings.isPending}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="openrouter-api-key">OpenRouter API Key</Label>
            <div className="text-sm text-muted-foreground">
              Required for AI bots using OpenRouter.
              {hasOpenRouterApiKey && (
                <span className="ml-1 font-medium text-foreground">Current key: {settings?.openrouterApiKey}</span>
              )}
            </div>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                id="openrouter-api-key"
                type="password"
                value={openrouterApiKey}
                onChange={(event) => setOpenrouterApiKey(event.target.value)}
                placeholder={hasOpenRouterApiKey ? "Enter new key to replace" : "sk-or-..."}
              />
              <Button
                onClick={() => {
                  updateSettings.mutate({ openrouterApiKey: openrouterApiKey.trim() })
                  setOpenrouterApiKey("")
                }}
                disabled={updateSettings.isPending || !openrouterApiKey.trim()}
              >
                Save
              </Button>
              {hasOpenRouterApiKey && (
                <Button
                  variant="outline"
                  onClick={() => {
                    updateSettings.mutate({ openrouterApiKey: "" })
                    setOpenrouterApiKey("")
                  }}
                  disabled={updateSettings.isPending}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Jitsi as a Service</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {jaasError && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{jaasError}</div>}
          {jaasMessage && <div className="rounded-md bg-emerald-500/10 p-3 text-sm text-emerald-700">{jaasMessage}</div>}

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="jaas-enabled" className="flex flex-col gap-1">
              <span>Enable JaaS meetings</span>
              <span className="font-normal text-sm text-muted-foreground">Allow Tuesday to create JaaS meeting links for scheduled meetings.</span>
            </Label>
            <Switch id="jaas-enabled" checked={jaasEnabled} onCheckedChange={setJaasEnabled} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jaas-app-id">JaaS App ID</Label>
            <div className="text-sm text-muted-foreground">
              Use the tenant prefix from your JaaS account, for example <span className="font-medium text-foreground">vpaas-magic-cookie-...</span>.
            </div>
            <Input
              id="jaas-app-id"
              value={jaasAppId}
              onChange={(event) => setJaasAppId(event.target.value)}
              placeholder="vpaas-magic-cookie-..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jaas-domain">JaaS domain</Label>
            <div className="text-sm text-muted-foreground">JaaS uses 8x8.vc, not meet.jit.si.</div>
            <Input
              id="jaas-domain"
              value={jaasDomain}
              onChange={(event) => setJaasDomain(event.target.value)}
              placeholder="8x8.vc"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jaas-key-id">JaaS Key ID</Label>
            <div className="text-sm text-muted-foreground">
              Use the API key ID from JaaS. Either the short key ID or full <span className="font-medium text-foreground">appId/keyId</span> value is accepted.
            </div>
            <Input
              id="jaas-key-id"
              value={jaasKeyId}
              onChange={(event) => setJaasKeyId(event.target.value)}
              placeholder="key-id"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jaas-private-key">JaaS private key</Label>
            <Textarea
              id="jaas-private-key"
              value={jaasPrivateKey}
              onChange={(event) => setJaasPrivateKey(event.target.value)}
              placeholder={hasJaasPrivateKey ? "Enter a new private key to replace the current one" : "-----BEGIN PRIVATE KEY-----"}
              rows={5}
            />
            {hasJaasPrivateKey && <div className="text-xs text-muted-foreground">A JaaS private key is currently configured.</div>}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <Label htmlFor="jaas-default-provider" className="flex flex-col gap-1">
              <span>Use JaaS by default</span>
              <span className="font-normal text-sm text-muted-foreground">New meetings will use JaaS unless a user selects a custom link or no video.</span>
            </Label>
            <Switch id="jaas-default-provider" checked={jaasDefaultProvider} onCheckedChange={setJaasDefaultProvider} />
          </div>

          <Button onClick={handleSaveJaas} disabled={updateSettings.isPending}>
            {updateSettings.isPending ? "Saving..." : "Save JaaS Settings"}
          </Button>
          {hasJaasPrivateKey && (
            <Button variant="outline" onClick={() => updateSettings.mutate({ jaasPrivateKey: "" })} disabled={updateSettings.isPending}>
              Remove JaaS Private Key
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bots</CardTitle>
        </CardHeader>
        <CardContent>
          <BotManagement />
        </CardContent>
      </Card>
    </div>
  )
}

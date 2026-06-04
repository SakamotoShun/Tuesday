import { and, eq, gt, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import {
  oauthAccessTokens,
  oauthAuthorizationCodes,
  oauthClients,
  oauthConsents,
  oauthRefreshTokens,
  type NewOauthAccessToken,
  type NewOauthAuthorizationCode,
  type NewOauthClient,
  type NewOauthConsent,
  type NewOauthRefreshToken,
  type OauthAccessToken,
  type OauthAuthorizationCode,
  type OauthClient,
  type OauthConsent,
  type OauthRefreshToken,
} from '../db/schema';

export class OauthRepository {
  async createClient(data: NewOauthClient): Promise<OauthClient> {
    const [client] = await db.insert(oauthClients).values(data).returning();
    return client;
  }

  async findClient(clientId: string): Promise<OauthClient | null> {
    const client = await db.query.oauthClients.findFirst({
      where: and(eq(oauthClients.clientId, clientId), isNull(oauthClients.revokedAt)),
    });
    return client ?? null;
  }

  async createAuthorizationCode(data: NewOauthAuthorizationCode): Promise<OauthAuthorizationCode> {
    const [code] = await db.insert(oauthAuthorizationCodes).values(data).returning();
    return code;
  }

  async findActiveAuthorizationCode(codeHash: string): Promise<OauthAuthorizationCode | null> {
    const code = await db.query.oauthAuthorizationCodes.findFirst({
      where: and(
        eq(oauthAuthorizationCodes.codeHash, codeHash),
        isNull(oauthAuthorizationCodes.usedAt),
        gt(oauthAuthorizationCodes.expiresAt, new Date()),
      ),
    });
    return code ?? null;
  }

  async markAuthorizationCodeUsed(id: string): Promise<boolean> {
    const result = await db
      .update(oauthAuthorizationCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(oauthAuthorizationCodes.id, id), isNull(oauthAuthorizationCodes.usedAt), gt(oauthAuthorizationCodes.expiresAt, new Date())))
      .returning({ id: oauthAuthorizationCodes.id });
    return result.length > 0;
  }

  async upsertConsent(data: NewOauthConsent): Promise<OauthConsent> {
    const [consent] = await db
      .insert(oauthConsents)
      .values(data)
      .onConflictDoUpdate({
        target: [oauthConsents.userId, oauthConsents.clientId],
        set: {
          scopes: data.scopes,
          revokedAt: null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return consent;
  }

  async createAccessToken(data: NewOauthAccessToken): Promise<OauthAccessToken> {
    const [token] = await db.insert(oauthAccessTokens).values(data).returning();
    return token;
  }

  async createRefreshToken(data: NewOauthRefreshToken): Promise<OauthRefreshToken> {
    const [token] = await db.insert(oauthRefreshTokens).values(data).returning();
    return token;
  }

  async findActiveRefreshToken(tokenHash: string): Promise<(OauthRefreshToken & {
    user?: { id: string; isDisabled: boolean } | null;
  }) | null> {
    const token = await db.query.oauthRefreshTokens.findFirst({
      where: and(
        eq(oauthRefreshTokens.tokenHash, tokenHash),
        isNull(oauthRefreshTokens.revokedAt),
        gt(oauthRefreshTokens.expiresAt, new Date()),
      ),
      with: {
        user: {
          columns: { id: true, isDisabled: true },
        },
      },
    });
    return token ?? null;
  }

  async revokeRefreshToken(id: string): Promise<boolean> {
    const result = await db
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthRefreshTokens.id, id), isNull(oauthRefreshTokens.revokedAt)))
      .returning({ id: oauthRefreshTokens.id });
    return result.length > 0;
  }

  async revokeRefreshTokenByHash(tokenHash: string, clientId: string): Promise<boolean> {
    const result = await db
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthRefreshTokens.tokenHash, tokenHash), eq(oauthRefreshTokens.clientId, clientId), isNull(oauthRefreshTokens.revokedAt)))
      .returning({ id: oauthRefreshTokens.id });
    return result.length > 0;
  }

  async findActiveAccessToken(tokenHash: string): Promise<(OauthAccessToken & {
    user?: { id: string; name: string; email: string; role: string; isDisabled: boolean } | null;
  }) | null> {
    const token = await db.query.oauthAccessTokens.findFirst({
      where: and(
        eq(oauthAccessTokens.tokenHash, tokenHash),
        isNull(oauthAccessTokens.revokedAt),
        gt(oauthAccessTokens.expiresAt, new Date()),
      ),
      with: {
        user: {
          columns: { id: true, name: true, email: true, role: true, isDisabled: true },
        },
      },
    });
    return token ?? null;
  }

  async markAccessTokenUsed(id: string): Promise<void> {
    await db.update(oauthAccessTokens).set({ lastUsedAt: new Date() }).where(eq(oauthAccessTokens.id, id));
  }

  async revokeAccessTokenByHash(tokenHash: string, clientId: string): Promise<boolean> {
    const result = await db
      .update(oauthAccessTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(oauthAccessTokens.tokenHash, tokenHash), eq(oauthAccessTokens.clientId, clientId), isNull(oauthAccessTokens.revokedAt)))
      .returning({ id: oauthAccessTokens.id });
    return result.length > 0;
  }
}

export const oauthRepository = new OauthRepository();

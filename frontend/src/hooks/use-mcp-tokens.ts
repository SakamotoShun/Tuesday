import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mcpTokensApi } from '@/api/mcp-tokens';
import type { CreateMcpTokenInput, McpTokenListItem } from '@/api/types';

export function useMcpTokens() {
  const queryClient = useQueryClient();

  const tokens = useQuery({
    queryKey: ['mcp-tokens'],
    queryFn: () => mcpTokensApi.list(),
    select: (items) => items.filter((token) => !token.revokedAt),
  });

  const createToken = useMutation({
    mutationFn: (input: CreateMcpTokenInput) => mcpTokensApi.create(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['mcp-tokens'] });
    },
  });

  const revokeToken = useMutation({
    mutationFn: (tokenId: string) => mcpTokensApi.revoke(tokenId),
    onSuccess: async (_, tokenId) => {
      await queryClient.cancelQueries({ queryKey: ['mcp-tokens'] });
      queryClient.setQueryData<McpTokenListItem[]>(['mcp-tokens'], (items) =>
        items?.filter((token) => token.id !== tokenId)
      );
      void queryClient.invalidateQueries({ queryKey: ['mcp-tokens'] });
    },
  });

  return {
    tokens: tokens.data ?? [],
    isLoading: tokens.isLoading,
    error: tokens.error,
    createToken,
    revokeToken,
  };
}

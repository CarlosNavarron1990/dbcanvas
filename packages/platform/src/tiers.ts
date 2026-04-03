export interface TierConfig {
  name: string;
  price: number; // USD/month, 0 = free
  stripePriceId: string;
  maxProjects: number;
  maxTables: number;
  seats: number;
  tools: {
    free: string[];    // Always available
    gated: string[];   // Requires this tier or higher
  };
}

export const TIERS: Record<string, TierConfig> = {
  free: {
    name: 'Free',
    price: 0,
    stripePriceId: '',
    maxProjects: 1,
    maxTables: 10,
    seats: 1,
    tools: {
      free: [
        'test_connection',
        'get_effective_config',
        'get_sp_definition',
        'get_table_schema',
        'query_data',
        'find_object',
        'sync_discovery',
        'get_discovery_graph',
        'list_projects',
      ],
      gated: [],
    },
  },
  pro: {
    name: 'Pro',
    price: 19,
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || '',
    maxProjects: -1, // unlimited
    maxTables: -1,
    seats: 1,
    tools: {
      free: [], // inherits free
      gated: [
        'explore_and_anchor_sp',
        'capture_sp_data',
        'simulate_sp',
        'get_capture',
        'trace_lineage',
        'sp_diff',
        'annotate',
        'get_annotation',
        'analyze',
      ],
    },
  },
  team: {
    name: 'Team',
    price: 49,
    stripePriceId: process.env.STRIPE_TEAM_PRICE_ID || '',
    maxProjects: -1,
    maxTables: -1,
    seats: 5,
    tools: {
      free: [],
      gated: [], // same as Pro, but with shared features
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: 0, // custom
    stripePriceId: '',
    maxProjects: -1,
    maxTables: -1,
    seats: -1,
    tools: {
      free: [],
      gated: [],
    },
  },
};

/** Get all tools available for a tier (cumulative) */
export function getToolsForTier(tier: string): string[] {
  const free = TIERS.free.tools.free;
  if (tier === 'free') return free;

  const proTools = [...free, ...TIERS.pro.tools.gated];
  if (tier === 'pro') return proTools;

  // team and enterprise get everything
  return proTools;
}

/** Check if a tool is allowed for a tier */
export function isToolAllowed(toolName: string, tier: string): boolean {
  return getToolsForTier(tier).includes(toolName);
}

/** Get the minimum tier required for a tool */
export function getRequiredTier(toolName: string): string {
  if (TIERS.free.tools.free.includes(toolName)) return 'free';
  if (TIERS.pro.tools.gated.includes(toolName)) return 'pro';
  return 'free'; // unknown tools default to free
}

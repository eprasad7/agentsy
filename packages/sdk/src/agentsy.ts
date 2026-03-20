import type {
  AgentConfig,
  ProjectConfig,
  ToolDefinition,
  NativeToolDefinition,
  McpToolDefinition,
  EvolutionDefinition,
} from './types.js';
import {
  agentConfigSchema,
  projectConfigSchema,
  nativeToolDefinitionSchema,
  mcpToolDefinitionSchema,
} from './validation.js';

/**
 * Primary SDK API object. Used in agentsy.config.ts to define agents, tools, and projects.
 */
export const agentsy = {
  /**
   * Define a single agent. Validates config with Zod and returns a frozen object.
   */
  defineAgent(config: AgentConfig): Readonly<AgentConfig> {
    agentConfigSchema.parse(config);
    return Object.freeze({ ...config });
  },

  /**
   * Define a native tool with Zod input/output schemas.
   */
  defineTool<TInput, TOutput>(
    definition: NativeToolDefinition<TInput, TOutput>,
  ): ToolDefinition {
    nativeToolDefinitionSchema.parse(definition);
    return Object.freeze({ ...definition }) as ToolDefinition;
  },

  /**
   * Define an MCP tool server connection.
   */
  defineMcpTool(definition: McpToolDefinition): ToolDefinition {
    mcpToolDefinitionSchema.parse(definition);
    return Object.freeze({ ...definition }) as ToolDefinition;
  },

  /**
   * Define a multi-agent project with shared defaults.
   */
  defineProject(config: ProjectConfig): Readonly<ProjectConfig> {
    projectConfigSchema.parse(config);
    return Object.freeze({ ...config });
  },

  /**
   * Define an evolution configuration (post-beta).
   */
  defineEvolution(config: EvolutionDefinition): Readonly<EvolutionDefinition> {
    if (!config.metric?.dataset) throw new Error('Evolution metric.dataset is required');
    if (!config.mutable?.length) throw new Error('Evolution mutable fields are required');
    return Object.freeze({ ...config });
  },
} as const;

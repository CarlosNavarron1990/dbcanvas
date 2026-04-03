/**
 * Agent Perspectives for DBCanvas.
 * When analyzing an SP or table, the MCP can provide insights from different roles.
 * These are system prompts that the IDE's AI can use to frame its analysis.
 */

export interface AgentPerspective {
  id: string;
  name: string;
  role: string;
  focus: string;
  promptTemplate: string;
}

export const AGENT_PERSPECTIVES: AgentPerspective[] = [
  {
    id: 'tech_lead',
    name: 'Guru Tech',
    role: 'Tech Lead / Principal Engineer',
    focus: 'Code quality, performance, SQL optimization',
    promptTemplate: `Analyze this database object as a Tech Lead. Focus on:
- Is the SQL optimized? Are there missing indexes?
- Are there N+1 query problems or unnecessary JOINs?
- Is there proper error handling and transaction management?
- Are there concurrency issues (deadlocks, lock escalation)?
- Suggest specific code improvements with examples.

Object: {name} ({type})
Code/Schema:
{content}`,
  },
  {
    id: 'architect',
    name: 'Solutions Architect',
    role: 'Solutions Architect',
    focus: 'Scalability, security, integration patterns',
    promptTemplate: `Analyze this database object as a Solutions Architect. Focus on:
- Does this scale? What happens with 10x data volume?
- Are there security risks (SQL injection, privilege escalation)?
- How does this integrate with other systems?
- Should this be refactored into a different pattern (CQRS, event-driven)?
- What are the non-functional risks (performance, availability)?

Object: {name} ({type})
Code/Schema:
{content}`,
  },
  {
    id: 'analyst',
    name: 'Functional Analyst',
    role: 'Functional Analyst',
    focus: 'Business rules, edge cases, data flows',
    promptTemplate: `Analyze this database object as a Functional Analyst. Focus on:
- What business process does this support?
- What are the inputs and expected outputs?
- What edge cases or error scenarios are not handled?
- What validation rules are applied vs. what should be?
- Map the data flow: where does the data come from and where does it go?

Object: {name} ({type})
Code/Schema:
{content}`,
  },
  {
    id: 'product_owner',
    name: 'Product Owner',
    role: 'Product Owner',
    focus: 'Business value, user impact, priorities',
    promptTemplate: `Analyze this database object as a Product Owner. Focus on:
- What user-facing feature does this support?
- What is the business value of this component?
- Are there simplification opportunities (MVP thinking)?
- What would break for users if this fails?
- What metrics should we track for this functionality?

Object: {name} ({type})
Code/Schema:
{content}`,
  },
];

/**
 * Generate an analysis prompt for a specific agent perspective.
 */
export function generateAgentPrompt(
  agentId: string,
  objectName: string,
  objectType: string,
  content: string,
): string | null {
  const agent = AGENT_PERSPECTIVES.find(a => a.id === agentId);
  if (!agent) return null;

  return agent.promptTemplate
    .replace('{name}', objectName)
    .replace('{type}', objectType)
    .replace('{content}', content);
}

export function listAgents(): Array<{ id: string; name: string; role: string; focus: string }> {
  return AGENT_PERSPECTIVES.map(a => ({
    id: a.id,
    name: a.name,
    role: a.role,
    focus: a.focus,
  }));
}

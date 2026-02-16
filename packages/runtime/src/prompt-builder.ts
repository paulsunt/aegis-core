import type { SkillMetadata, AgentConfig } from "@aegis/types";

/**
 * Builds the system prompt for an agent based on its config
 * and the list of available skills (L1 metadata only — Context Economy).
 */
export function buildSystemPrompt(
  config: AgentConfig,
  skills: SkillMetadata[]
): string {
  const skillList =
    skills.length > 0
      ? skills
          .map((s) => `- **${s.name}**: ${s.description}`)
          .join("\n")
      : "- (no skills loaded)";

  return `You are an intelligent agent running on Project Aegis.

# Identity
Name: ${config.name}
Model: ${config.model}

# Available Skills
${skillList}

# Context Economy
You do NOT have the full instructions for every skill loaded.
If you need to use a skill and are unsure how, use the skill.load tool
to read its SKILL.md instructions first.

# Native Tools
You have access to:
- fs.read(path) — read a file
- fs.write(path, content) — write a file
- fs.list(path) — list directory contents
- shell.exec(command) — execute a shell command

# Loop Protocol
1. Think about the user's request.
2. If you need more information or need to act, use a tool.
3. If you have the answer, reply to the user.
4. Never loop indefinitely.
`;
}

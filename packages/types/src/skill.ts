import type { SkillId } from "./foundational.js";

/**
 * L1 — Always available in agent context.
 * Extracted from SKILL.md YAML frontmatter.
 *
 * SKILL.md format:
 * ```
 * ---
 * name: github
 * description: "Interact with GitHub using the gh CLI..."
 * ---
 * # GitHub Skill
 * ...instructions...
 * ```
 */
export interface SkillMetadata {
  readonly id: SkillId;
  /** Human-readable name, from frontmatter `name` field. */
  readonly name: string;
  /** Trigger description, from frontmatter `description` field. */
  readonly description: string;
  /** Absolute path to the skill directory. */
  readonly path: string;
  /** Whether the skill has bundled scripts. */
  readonly hasScripts: boolean;
  /** Whether the skill has reference documents. */
  readonly hasReferences: boolean;
  /** Whether the skill has asset files. */
  readonly hasAssets: boolean;
}

/**
 * L2 — Loaded when the skill triggers.
 * Includes the full SKILL.md markdown body.
 */
export interface SkillDefinition extends SkillMetadata {
  /** The full markdown body of SKILL.md (below frontmatter). */
  readonly instructions: string;
  /** Inventory of available resources (not their contents). */
  readonly resources: ReadonlyArray<SkillResourceInfo>;
}

/**
 * Describes a bundled resource without loading its content.
 */
export interface SkillResourceInfo {
  /** Relative path within the skill directory, e.g. "scripts/rotate.py" */
  readonly relativePath: string;
  readonly type: "script" | "reference" | "asset";
  readonly sizeBytes: number;
}

/**
 * L3 — Loaded on demand.
 * The actual content of a skill resource.
 */
export interface SkillResource {
  readonly info: SkillResourceInfo;
  /** File content. Text for scripts/references, base64 for binary assets. */
  readonly content: string;
  readonly encoding: "utf-8" | "base64";
}

/**
 * Skill discovery and loading service.
 */
export interface SkillRegistry {
  /**
   * Index all skills from the configured skill directories.
   * Called once at startup.
   */
  index(skillDirs: string[]): Promise<void>;

  /**
   * Get all indexed skill metadata (L1).
   */
  listAll(): SkillMetadata[];

  /**
   * Search skills by query (matches against name + description).
   */
  search(query: string): SkillMetadata[];

  /**
   * Load a skill's full definition (L2).
   */
  load(id: SkillId): Promise<SkillDefinition>;

  /**
   * Load a specific resource from a skill (L3).
   */
  loadResource(id: SkillId, relativePath: string): Promise<SkillResource>;
}

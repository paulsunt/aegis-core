import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import type {
  SkillId,
  SkillMetadata,
  SkillDefinition,
  SkillResource,
  SkillResourceInfo,
  SkillRegistry,
} from "@aegis/types";

// ─── Skill Loader (file-system based) ───────────────────────

/**
 * Parse a SKILL.md file into its frontmatter and body.
 */
function parseSkillMd(
  raw: string,
  skillDir: string
): { meta: { name: string; description: string }; body: string } {
  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    throw new Error(`Invalid SKILL.md in ${skillDir}: missing frontmatter`);
  }
  const meta = yaml.load(match[1]) as { name: string; description: string };
  return { meta, body: match[2].trim() };
}

/**
 * Scan a single skill directory and return L1 metadata.
 */
async function loadSkillMetadata(
  skillDir: string
): Promise<SkillMetadata | null> {
  const skillMdPath = path.join(skillDir, "SKILL.md");
  try {
    await fs.access(skillMdPath);
  } catch {
    return null; // No SKILL.md → not a skill
  }

  const raw = await fs.readFile(skillMdPath, "utf-8");
  const { meta } = parseSkillMd(raw, skillDir);

  // Check for optional subdirectories
  const hasDir = async (name: string) => {
    try {
      const stat = await fs.stat(path.join(skillDir, name));
      return stat.isDirectory();
    } catch {
      return false;
    }
  };

  return {
    id: meta.name as SkillId,
    name: meta.name,
    description: meta.description,
    path: skillDir,
    hasScripts: await hasDir("scripts"),
    hasReferences: await hasDir("references"),
    hasAssets: await hasDir("assets"),
  };
}

// ─── Skill Registry Implementation ─────────────────────────

/**
 * File-system-backed implementation of the `SkillRegistry` interface
 * from `@aegis/types`.
 */
export class FileSystemSkillRegistry implements SkillRegistry {
  private indexed = new Map<SkillId, SkillMetadata>();

  /** Index all skill directories under `skillDirs`. */
  async index(skillDirs: string[]): Promise<void> {
    this.indexed.clear();
    for (const dir of skillDirs) {
      let entries: string[];
      try {
        entries = await fs.readdir(dir).then((e) =>
          e.map((name) => path.join(dir, name))
        );
      } catch {
        continue; // skip missing directories
      }
      for (const skillDir of entries) {
        const stat = await fs.stat(skillDir);
        if (!stat.isDirectory()) continue;
        const meta = await loadSkillMetadata(skillDir);
        if (meta) {
          this.indexed.set(meta.id, meta);
        }
      }
    }
  }

  /** Return all indexed L1 metadata. */
  listAll(): SkillMetadata[] {
    return [...this.indexed.values()];
  }

  /** Simple substring search on name + description. */
  search(query: string): SkillMetadata[] {
    const q = query.toLowerCase();
    return this.listAll().filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
  }

  /** Load L2 definition (full SKILL.md body + resource inventory). */
  async load(id: SkillId): Promise<SkillDefinition> {
    const meta = this.indexed.get(id);
    if (!meta) throw new Error(`Skill not found: ${id}`);

    const raw = await fs.readFile(path.join(meta.path, "SKILL.md"), "utf-8");
    const { body } = parseSkillMd(raw, meta.path);

    const resources: SkillResourceInfo[] = [];
    for (const subdir of ["scripts", "references", "assets"] as const) {
      const full = path.join(meta.path, subdir);
      try {
        const files = await fs.readdir(full);
        for (const file of files) {
          const stat = await fs.stat(path.join(full, file));
          if (stat.isFile()) {
            resources.push({
              relativePath: `${subdir}/${file}`,
              type: subdir === "scripts"
                ? "script"
                : subdir === "references"
                  ? "reference"
                  : "asset",
              sizeBytes: stat.size,
            });
          }
        }
      } catch {
        // directory doesn't exist, skip
      }
    }

    return {
      ...meta,
      instructions: body,
      resources,
    };
  }

  /** Load L3 resource content. */
  async loadResource(
    id: SkillId,
    relativePath: string
  ): Promise<SkillResource> {
    const meta = this.indexed.get(id);
    if (!meta) throw new Error(`Skill not found: ${id}`);

    const fullPath = path.join(meta.path, relativePath);
    // Security: ensure path stays within skill dir
    if (!fullPath.startsWith(meta.path)) {
      throw new Error(`Path traversal denied: ${relativePath}`);
    }

    const stat = await fs.stat(fullPath);
    const isBinary = relativePath.match(/\.(png|jpg|gif|wasm|zip)$/i);
    const content = isBinary
      ? (await fs.readFile(fullPath)).toString("base64")
      : await fs.readFile(fullPath, "utf-8");

    return {
      info: {
        relativePath,
        type: relativePath.startsWith("scripts/")
          ? "script"
          : relativePath.startsWith("references/")
            ? "reference"
            : "asset",
        sizeBytes: stat.size,
      },
      content,
      encoding: isBinary ? "base64" : "utf-8",
    };
  }
}

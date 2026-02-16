import fs from "node:fs";
import type {
  Gateway,
  GatewayConfig,
  EventBus,
  AgentRegistry,
  SkillRegistry,
  AgentResponse,
  AgentConfig,
  SessionId,
  SkillMetadata,
  SkillId,
  SkillDefinition,
  SkillResource,
} from "@aegis/types";
import { InMemoryEventBus } from "./bus.js";

class InMemoryAgentRegistry implements AgentRegistry {
  private agents = new Map<string, unknown>();

  async register(agent: AgentConfig): Promise<void> {
     this.agents.set(agent.id, agent);
  }
  async unregister(agentId: string): Promise<void> {
    this.agents.delete(agentId);
  }
  get(agentId: string): unknown | undefined {
    return this.agents.get(agentId);
  }
  list(): unknown[] {
    return Array.from(this.agents.values());
  }
}

class InMemorySkillRegistry implements SkillRegistry {
  async index(skillDirs: string[]): Promise<void> {
    // Stub
  }
  listAll(): SkillMetadata[] {
    return [];
  }
  search(query: string): SkillMetadata[] {
    return [];
  }
  async load(id: SkillId): Promise<SkillDefinition> {
    throw new Error("Method not implemented.");
  }
  async loadResource(id: SkillId, relativePath: string): Promise<SkillResource> {
    throw new Error("Method not implemented.");
  }
}

export class CoreGateway implements Gateway {
  readonly bus: EventBus;
  readonly agents: AgentRegistry;
  readonly skills: SkillRegistry;
  private config?: GatewayConfig;

  constructor() {
    this.bus = new InMemoryEventBus();
    this.agents = new InMemoryAgentRegistry();
    this.skills = new InMemorySkillRegistry();
  }

  async start(config: GatewayConfig): Promise<void> {
    this.config = config;
    
    // Structured log
    console.log(JSON.stringify({
      level: "info",
      message: "Gateway starting",
      timestamp: new Date().toISOString(),
      data: {
        bind: config.bind,
        port: config.port,
        agentCount: config.agents.length
      }
    }));

    // TODO: bind HTTP server
  }

  async stop(): Promise<void> {
    console.log(JSON.stringify({
      level: "info",
      message: "Gateway stopping",
      timestamp: new Date().toISOString()
    }));
  }

  async handleMessage(message: string, sessionId?: SessionId): Promise<AgentResponse> {
    throw new Error("Method not implemented.");
  }
}

/**
 * Helper to load config from yaml file
 */
export async function loadGatewayConfig(path: string): Promise<GatewayConfig> {
  // Config stub - returning default for now as we don't want to add yaml parsing complexity yet
  // or use 'yaml' package if installed.
  // We installed 'yaml' in package.json.
  // But for the smoke test we can manually construct config.
  
  if (fs.existsSync(path)) {
     // TODO: implement real YAML loading
     console.log(`[Gateway] Loading config from ${path} (stub)`);
  }

  return {
    bind: "127.0.0.1",
    port: 3000,
    skillDirs: [],
    agents: [],
    security: {
      defaultToolPolicy: {},
      defaultSandbox: {
        mode: "workspace",
        workspaceAccess: "rw",
        workspaceRoot: "/tmp/aegis/workspaces",
      },
      defaultResourceLimits: {
        maxSpawnDepth: 5,
        maxConcurrentChildren: 10,
        runTimeoutMs: 300000
      },
      maxSpawnDepth: 5
    },
    tracing: {
      enabled: true,
      exporter: "console"
    }
  };
}

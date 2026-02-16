import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { v7 as uuidv7 } from 'uuid';

import { InMemoryEventBus, createEvent, createTraceContext } from '@aegis/core';
import { AgentLoop, MockModelAdapter, type NativeToolRegistry, type NativeTool } from '@aegis/runtime';
import { FileSystemSkillRegistry, FsTool } from '@aegis/skills';
import type { AgentId, AgentConfig, AegisEvent } from '@aegis/types';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const WORKSPACE_DIR = path.resolve(__dirname, 'workspace-test');

describe('Hello World Agent', () => {
  let bus: InMemoryEventBus;
  let skills: FileSystemSkillRegistry;
  let agent: AgentLoop;

  beforeEach(async () => {
    await fs.mkdir(WORKSPACE_DIR, { recursive: true });

    bus = new InMemoryEventBus();
    skills = new FileSystemSkillRegistry();
    await skills.index([]); // No skill dirs for this test

    const fsTool = new FsTool(WORKSPACE_DIR);

    // Build native tool registry
    const nativeTools: NativeToolRegistry = {
      get(toolName: string): NativeTool | undefined {
        if (toolName === 'fs.write') {
          return {
            async execute(args: Record<string, unknown>) {
              const result = await fsTool.write({
                path: args.path as string,
                content: args.content as string,
              });
              return result;
            },
          };
        }
        if (toolName === 'fs.read') {
          return {
            async execute(args: Record<string, unknown>) {
              return fsTool.read({ path: args.path as string });
            },
          };
        }
        return undefined;
      },
    };

    const config: AgentConfig = {
      id: 'agent-test' as AgentId,
      name: 'TestAgent',
      systemPrompt: '',
      model: 'mock',
      toolPolicy: { allow: ['fs.read', 'fs.write', 'fs.list', 'shell.exec'] },
      sandbox: {},
      resourceLimits: {},
    };

    agent = new AgentLoop(bus, new MockModelAdapter(), skills, config, nativeTools);
    await agent.start();
  });

  afterEach(async () => {
    await fs.rm(WORKSPACE_DIR, { recursive: true, force: true });
  });

  it('should write a file when requested', async () => {
    const trace = createTraceContext();

    // Listen for agent.complete
    let completed = false;
    let completedMessage = '';
    const completePromise = new Promise<void>((resolve) => {
      bus.subscribe(
        { topics: ['agent.complete'] },
        (event: AegisEvent) => {
          completed = true;
          completedMessage = (event.payload as { message: string }).message;
          resolve();
        }
      );
    });

    // Send a turn event targeted at the agent
    const turnEvent = createEvent(
      'agent.turn',
      { message: "Write 'Hello Aegis' to hello.txt" },
      trace,
      undefined,
      'agent-test'
    );
    await bus.publish(turnEvent);

    // Wait for agent to complete (with timeout)
    await Promise.race([
      completePromise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Agent timed out')), 5000)
      ),
    ]);

    expect(completed).toBe(true);
    expect(completedMessage).toBe('Done');

    // Check file was written
    const content = await fs.readFile(path.join(WORKSPACE_DIR, 'hello.txt'), 'utf8');
    expect(content).toBe('Hello Aegis');
  });
});

# Project Aegis 🛡️
> A Stateful, Event-Driven Agent Orchestration Platform

Project Aegis is a modern, monorepo-based framework for building and orchestrating AI agents. It goes beyond simple script-based agents by providing a robust **Event Bus**, **Stateful Memory**, and a **Sandboxed Skill System**.

Inspired by the scalability and safety principles of [OpenClaw](https://github.com/openclaw), Aegis is designed for long-running, multi-turn AI interactions that survive restarts and can be integrated into any communication channel (Telegram, Discord, Web).

---

## ✨ Key Features

- 🧠 **Deep Memory (Phase 4)**: Built-in SQLite persistence. Agents remember your name, context, and previous tasks even after a full system reboot.
- 📡 **Event-Driven Architecture**: All communication flows through a central `EventBus`. This enables decoupled scaling, easy observability, and RPC-style interactions.
- 🛠️ **Sandboxed Skills**: A clean system for defining agent capabilities (Tools) with built-in safety checks (path traversal protection, shell execution boundaries).
- 🔄 **Autonomous Agent Loop**: A mature think-tool-think cycle that handles complex, multi-step tasks autonomously.
- 🏗️ **Strictly Typed**: Developed in TypeScript with a heavy focus on interface safety (Branded IDs, Zod validation).

---

## 📦 Monorepo Structure

| Package | Purpose |
| :--- | :--- |
| [`@aegis/core`](packages/core) | Core Gateway, Infrastructure, and Event Bus implementation. |
| [`@aegis/types`](packages/types) | The "Source of Truth" for all shared interfaces and domain types. |
| [`@aegis/runtime`](packages/runtime) | The Agent execution loop and LLM model adapters. |
| [`@aegis/skills`](packages/skills) | Skill Registry and implementation of native tools (FS, Shell). |
| [`@aegis/persistence`](packages/persistence) | SQLite-based storage for sessions and immutable event logs. |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v20+ 
- **pnpm**: v9+ (for monorepo management)
- **SQLite**: (Included via `better-sqlite3`)

### Installation

```bash
# Clone the repository
git clone https://github.com/paulsunt/aegis-core.git
cd aegis-core

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run integration tests
pnpm test
```

---

## 🗺️ How it Works

Aegis follows the **"Append-Only Ledger"** principle:

1. **User Message** → Published to the Event Bus.
2. **Gateway** → Intercepts, assigns/hydrates a **Session**.
3. **Agent Loop** → Replays session history from SQLite to recover "thought state".
4. **Execution** → Agent "thinks", calls tools (FS, Shell), and "speaks".
5. **Persistence** → Every thought and action is written to the immutable event log.

---

## 🤖 Building Your First Integration (e.g. Telegram Bot)

Aegis is designed to be head-less. You can connect it to a Telegram bot in just 10 lines:

```typescript
import { CoreGateway } from '@aegis/core';

const gateway = new CoreGateway();
await gateway.start(config);

bot.on('text', async (ctx) => {
  const sessionId = `telegram:${ctx.chat.id}`;
  const response = await gateway.handleMessage(ctx.message.text, sessionId);
  await ctx.reply(response.message);
});
```

---

## 🛣️ Roadmap

- [x] Phase 1-4: Core Architecture, Skills, Persistence.
- [ ] **Phase 5: Real LLM Adapters** (Ollama, OpenAI, Anthropic).
- [ ] **Phase 6: Advanced Tool Calling** (Dynamic Skill Discovery).
- [ ] **Phase 7: Web UI** (Admin Dashboard for monitoring agents).

---

## ⚖️ License

MIT

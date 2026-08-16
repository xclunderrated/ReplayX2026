# Feature Wizard Extension Implementation Plan

> **REQUIRED SUB-SKILL:** Use the executing-plans skill to implement this plan task-by-task.

**Goal:** Create a Pi extension that intercepts user prompts, generates a plan, shows it to the user for keyboard-driven review, then hands off to the agent. After coding completes, suggests follow-up features.

**Architecture:** Extension subscribes to `input` event to intercept prompts. Uses custom TUI via `ctx.ui.custom()` for keyboard-driven plan review and suggestions. Stores state in session via `pi.appendEntry()`.

**Tech Stack:** TypeScript, Pi Extension API, @mariozechner/pi-tui for custom UI components

---

## Task 1: Create Extension Skeleton

**Files:**
- Create: `~/.pi/agent/extensions/feature-wizard/index.ts`
- Create: `~/.pi/agent/extensions/feature-wizard/package.json`

**Step 1: Create package.json**

```json
{
  "name": "feature-wizard",
  "version": "1.0.0",
  "pi": {
    "extensions": ["./index.ts"]
  }
}
```

**Step 2: Create index.ts with basic structure**

```typescript
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    ctx.ui.notify("Feature Wizard loaded!", "info");
  });

  pi.on("input", async (event, ctx) => {
    console.log("User input:", event.text);
    return { action: "continue" };
  });
}
```

**Step 3: Test extension loads**

Run: `pi -e ~/.pi/agent/extensions/feature-wizard/index.ts`
Expected: Shows "Feature Wizard loaded!" notification

---

## Task 2: Implement Basic State Management

**Files:**
- Modify: `~/.pi/agent/extensions/feature-wizard/index.ts`

**Step 1: Add state types and storage**

```typescript
interface PlanItem {
  id: string;
  description: string;
  enabled: boolean;
  category: string;
}

interface WizardState {
  phase: "idle" | "planning" | "coding" | "suggesting";
  originalPrompt: string;
  plan: PlanItem[];
  questions: { id: string; text: string; options: string[]; selected: string }[];
  suggestions: { id: string; label: string; description: string; enabled: boolean }[];
  selectedIndex: number;
}

let state: WizardState = {
  phase: "idle",
  originalPrompt: "",
  plan: [],
  questions: [],
  suggestions: [],
  selectedIndex: 0,
};
```

**Step 2: Add session restoration**

```typescript
pi.on("session_start", async (_event, ctx) => {
  // Restore state from session
  for (const entry of ctx.sessionManager.getEntries()) {
    if (entry.type === "custom" && entry.customType === "feature-wizard") {
      const saved = entry.data as WizardState;
      if (saved) state = { ...state, ...saved };
    }
  }
});
```

**Step 3: Add state persistence function**

```typescript
function saveState() {
  pi.appendEntry("feature-wizard", state);
}
```

**Step 4: Test state restoration**

Run: `pi -e ~/.pi/agent/extensions/feature-wizard/index.ts`
Expected: Extension loads without errors

---

## Task 3: Implement Input Interceptor & Plan Generator

**Files:**
- Modify: `~/.pi/agent/extensions/feature-wizard/index.ts`

**Step 1: Add input interception**

```typescript
pi.on("input", async (event, ctx) => {
  if (state.phase !== "idle") return { action: "continue" };
  
  const prompt = event.text.trim();
  if (!prompt || prompt.length < 3) return { action: "continue" };
  
  // Start planning phase
  state.phase = "planning";
  state.originalPrompt = prompt;
  saveState();
  
  return { action: "handled" }; // Block until plan is reviewed
});
```

**Step 2: Add basic plan generator**

```typescript
function generatePlan(prompt: string): { plan: PlanItem[]; questions: WizardState["questions"] } {
  const plan: PlanItem[] = [];
  const questions: WizardState["questions"] = [];
  
  const promptLower = prompt.toLowerCase();
  
  // Detect feature types and generate appropriate plan items
  if (promptLower.includes("login") || promptLower.includes("auth") || promptLower.includes("oauth")) {
    plan.push({
      id: "install-deps",
      description: "Install authentication dependencies",
      enabled: true,
      category: "config",
    });
    plan.push({
      id: "create-auth-module",
      description: "Create authentication module",
      enabled: true,
      category: "create",
    });
    plan.push({
      id: "add-routes",
      description: "Add authentication routes",
      enabled: true,
      category: "modify",
    });
    
    questions.push({
      id: "providers",
      text: "Which auth providers?",
      options: ["Email/Password", "Google", "GitHub", "Discord", "All"],
      selected: "Email/Password",
    });
  }
  
  if (promptLower.includes("api") || promptLower.includes("endpoint")) {
    plan.push({
      id: "create-api",
      description: "Create API endpoint",
      enabled: true,
      category: "create",
    });
  }
  
  if (promptLower.includes("test")) {
    plan.push({
      id: "write-tests",
      description: "Write unit tests",
      enabled: true,
      category: "create",
    });
  }
  
  // Default: just acknowledge the prompt as a custom task
  if (plan.length === 0) {
    plan.push({
      id: "custom-task",
      description: `Implement: ${prompt}`,
      enabled: true,
      category: "custom",
    });
  }
  
  return { plan, questions };
}
```

**Step 3: Add plan generation trigger**

```typescript
pi.on("input", async (event, ctx) => {
  if (state.phase !== "idle") return { action: "continue" };
  
  const prompt = event.text.trim();
  if (!prompt || prompt.length < 3) return { action: "continue" };
  
  state.phase = "planning";
  state.originalPrompt = prompt;
  state.selectedIndex = 0;
  
  // Generate plan
  const { plan, questions } = generatePlan(prompt);
  state.plan = plan;
  state.questions = questions;
  
  saveState();
  
  return { action: "handled" };
});
```

**Step 4: Test plan generation**

Run pi with extension, type "Add OAuth login"
Expected: Input is handled (agent doesn't start), state is saved

---

## Task 4: Implement Plan Review UI (Custom TUI)

**Files:**
- Modify: `~/.pi/agent/extensions/feature-wizard/index.ts`

**Step 1: Add TUI imports**

```typescript
import { Box, Text, Border, Component } from "@mariozechner/pi-tui";
```

**Step 2: Create plan review UI function**

```typescript
async function showPlanReviewUI(ctx: ExtensionContext): Promise<boolean> {
  return new Promise((resolve) => {
    const ui = ctx.ui.custom({
      title: "Plan Review",
      width: 80,
      height: 20,
    });
    
    let selectedIndex = 0;
    let plan = [...state.plan];
    let questions = [...state.questions];
    let questionIndex = 0;
    let inQuestions = false;
    
    function render() {
      const lines: string[] = [];
      
      lines.push(`📋 Plan: ${state.originalPrompt}`);
      lines.push("─".repeat(70));
      
      if (!inQuestions) {
        lines.push("");
        for (let i = 0; i < plan.length; i++) {
          const item = plan[i];
          const prefix = item.enabled ? "☑" : "☐";
          const marker = i === selectedIndex ? "▶" : " ";
          lines.push(`${marker} ${prefix} ${item.description}`);
        }
        
        if (questions.length > 0) {
          lines.push("");
          lines.push("─".repeat(70));
          lines.push("Press → to answer questions, or Enter to confirm");
        }
      } else {
        // Show questions
        const q = questions[questionIndex];
        lines.push(`Question ${questionIndex + 1}/${questions.length}: ${q.text}`);
        lines.push("─".repeat(70));
        
        for (let i = 0; i < q.options.length; i++) {
          const opt = q.options[i];
          const marker = q.selected === opt ? "▶" : " ";
          const mark = q.selected === opt ? "●" : "○";
          lines.push(`${marker} ${mark} ${opt}`);
        }
        
        lines.push("");
        lines.push("← Back  |  [↑↓] Select option  |  [Enter] Confirm");
      }
      
      ui.setContent(lines.join("\n"));
    }
    
    ui.onKey((key) => {
      if (inQuestions) {
        // Question navigation
        const q = questions[questionIndex];
        if (key === "escape") {
          inQuestions = false;
        } else if (key === "arrowleft") {
          inQuestions = false;
        } else if (key === "arrowup") {
          const idx = q.options.indexOf(q.selected);
          if (idx > 0) q.selected = q.options[idx - 1];
        } else if (key === "arrowdown") {
          const idx = q.options.indexOf(q.selected);
          if (idx < q.options.length - 1) q.selected = q.options[idx + 1];
        } else if (key === "enter") {
          if (questionIndex < questions.length - 1) {
            questionIndex++;
          } else {
            // Done with questions, resolve
            state.plan = plan;
            state.questions = questions;
            saveState();
            ui.close();
            resolve(true);
          }
        }
      } else {
        // Plan navigation
        if (key === "arrowup" && selectedIndex > 0) {
          selectedIndex--;
        } else if (key === "arrowdown" && selectedIndex < plan.length - 1) {
          selectedIndex++;
        } else if (key === " ") {
          // Toggle item
          plan[selectedIndex].enabled = !plan[selectedIndex].enabled;
        } else if (key === "enter") {
          // Confirm plan
          if (questions.length > 0) {
            inQuestions = true;
            questionIndex = 0;
          } else {
            state.plan = plan;
            saveState();
            ui.close();
            resolve(true);
          }
        } else if (key === "arrowright" && questions.length > 0) {
          inQuestions = true;
          questionIndex = 0;
        } else if (key === "escape") {
          // Cancel
          state.phase = "idle";
          saveState();
          ui.close();
          resolve(false);
        }
      }
      
      render();
    });
    
    render();
  });
}
```

**Step 3: Wire up UI in input handler**

```typescript
pi.on("input", async (event, ctx) => {
  if (state.phase !== "idle") return { action: "continue" };
  
  const prompt = event.text.trim();
  if (!prompt || prompt.length < 3) return { action: "continue" };
  
  // Generate plan first
  state.phase = "planning";
  state.originalPrompt = prompt;
  state.selectedIndex = 0;
  const { plan, questions } = generatePlan(prompt);
  state.plan = plan;
  state.questions = questions;
  
  // Show UI
  const confirmed = await showPlanReviewUI(ctx);
  
  if (confirmed) {
    // Inject plan into system prompt
    const planText = state.plan
      .filter(p => p.enabled)
      .map(p => `- ${p.description}`)
      .join("\n");
    
    return {
      action: "transform",
      text: `${state.originalPrompt}\n\n**Plan:**\n${planText}`,
    };
  } else {
    // User cancelled, continue normally
    state.phase = "idle";
    return { action: "continue" };
  }
});
```

**Step 4: Test plan UI**

Run pi with extension, type "Add OAuth login"
Expected: Custom UI shows plan with checkboxes, keyboard navigation works

---

## Task 5: Add TypeScript Types Import

**Files:**
- Modify: `~/.pi/agent/extensions/feature-wizard/index.ts`

**Step 1: Add ExtensionContext import**

```typescript
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
```

**Step 2: Verify compilation**

Check for TypeScript errors in the extension file

---

## Task 6: Implement Post-Coding Suggestions

**Files:**
- Modify: `~/.pi/agent/extensions/feature-wizard/index.ts`

**Step 1: Add suggestion generator**

```typescript
function generateSuggestions(): WizardState["suggestions"] {
  const suggestions: WizardState["suggestions"] = [
    {
      id: "tests",
      label: "Add unit tests",
      description: "Write tests for the new functionality",
      enabled: false,
    },
    {
      id: "error-handling",
      label: "Add error handling",
      description: "Add proper error handling and edge cases",
      enabled: false,
    },
    {
      id: "docs",
      label: "Add documentation",
      description: "Document the new feature in README or code comments",
      enabled: false,
    },
    {
      id: "types",
      label: "Add TypeScript types",
      description: "Ensure proper typing for TypeScript projects",
      enabled: false,
    },
    {
      id: "logging",
      label: "Add logging",
      description: "Add logging for debugging and monitoring",
      enabled: false,
    },
  ];
  
  return suggestions;
}
```

**Step 2: Add agent_end detection**

```typescript
pi.on("agent_end", async (event, ctx) => {
  if (state.phase !== "planning") return;
  
  // Check if we're done with the planned task
  // For now, automatically show suggestions after agent completes
  state.phase = "suggesting";
  state.suggestions = generateSuggestions();
  state.selectedIndex = 0;
  saveState();
  
  // Show suggestions UI
  await showSuggestionsUI(ctx);
});
```

**Step 3: Create suggestions UI**

```typescript
async function showSuggestionsUI(ctx: ExtensionContext): Promise<void> {
  return new Promise((resolve) => {
    const ui = ctx.ui.custom({
      title: "What's Next?",
      width: 80,
      height: 18,
    });
    
    let selectedIndex = 0;
    let suggestions = [...state.suggestions];
    
    function render() {
      const lines: string[] = [];
      
      lines.push(`✨ Feature implemented: ${state.originalPrompt}`);
      lines.push("─".repeat(70));
      lines.push("");
      lines.push("Select additional features to add:");
      lines.push("");
      
      for (let i = 0; i < suggestions.length; i++) {
        const item = suggestions[i];
        const prefix = item.enabled ? "☑" : "☐";
        const marker = i === selectedIndex ? "▶" : " ";
        lines.push(`${marker} ${prefix} ${item.label}`);
        if (item.description) {
          lines.push(`   ${item.description}`);
        }
      }
      
      lines.push("");
      lines.push("─".repeat(70));
      lines.push("[↑↓] Navigate  [Space] Toggle  [Enter] Proceed  [Esc] Done");
      
      ui.setContent(lines.join("\n"));
    }
    
    ui.onKey((key) => {
      if (key === "arrowup" && selectedIndex > 0) {
        selectedIndex--;
      } else if (key === "arrowdown" && selectedIndex < suggestions.length - 1) {
        selectedIndex++;
      } else if (key === " ") {
        suggestions[selectedIndex].enabled = !suggestions[selectedIndex].enabled;
      } else if (key === "enter") {
        state.suggestions = suggestions;
        
        // Send selected suggestions as follow-up prompts
        const selected = suggestions.filter(s => s.enabled);
        if (selected.length > 0) {
          const followUp = selected.map(s => s.label).join(", ");
          pi.sendUserMessage(`Also add: ${followUp}`, { deliverAs: "followUp" });
        }
        
        state.phase = "idle";
        saveState();
        ui.close();
        resolve();
      } else if (key === "escape") {
        state.phase = "idle";
        saveState();
        ui.close();
        resolve();
      }
      
      render();
    });
    
    render();
  });
}
```

**Step 4: Test suggestions flow**

After agent completes work, verify suggestions UI appears

---

## Task 7: Add Package Installation Helper

**Files:**
- Modify: `~/.pi/agent/extensions/feature-wizard/index.ts`

**Step 1: Add dependency installer**

```typescript
async function installDependencies(deps: string[], ctx: ExtensionContext) {
  ctx.ui.notify(`Installing: ${deps.join(", ")}`, "info");
  
  for (const dep of deps) {
    const result = await pi.exec("npm", ["install", dep], { timeout: 120000 });
    if (result.code !== 0) {
      ctx.ui.notify(`Failed to install ${dep}`, "error");
    }
  }
}
```

**Step 2: Integrate into plan execution**

In the input handler, after plan is confirmed:
- Check for "install" items in plan
- Run installation before continuing

---

## Task 8: Add Settings & Configuration

**Files:**
- Modify: `~/.pi/agent/extensions/feature-wizard/index.ts`

**Step 1: Add settings support**

```typescript
interface WizardSettings {
  enabled: boolean;
  autoSuggest: boolean;
  suggestionCount: number;
}

const defaultSettings: WizardSettings = {
  enabled: true,
  autoSuggest: true,
  suggestionCount: 5,
};

function getSettings(): WizardSettings {
  // Could load from settings.json
  return defaultSettings;
}
```

**Step 2: Add settings-based enable/disable**

At the start of input handler:
```typescript
const settings = getSettings();
if (!settings.enabled) return { action: "continue" };
```

---

## Task 9: Add Help & Keyboard Shortcuts Display

**Files:**
- Modify: `~/.pi/agent/extensions/feature-wizard/index.ts`

**Step 1: Add help toggle in both UIs**

```typescript
let showHelp = false;

// In render function:
if (showHelp) {
  lines.push("");
  lines.push("┌─ Keyboard Shortcuts ─┐");
  lines.push("│ ↑↓  Navigate         │");
  lines.push("│ Space Toggle        │");
  lines.push("│ Enter Confirm       │");
  lines.push("│ Esc  Cancel/Done    │");
  lines.push("│ a    Add custom     │");
  lines.push("│ ?    This help      │");
  lines.push("└─────────────────────┘");
}
```

---

## Task 10: Final Testing & Polish

**Step 1: Run full test suite**

- Start pi with extension
- Type "Add login feature"
- Verify plan appears
- Toggle items with Space
- Confirm with Enter
- Let agent work
- Verify suggestions appear after
- Select suggestion, verify follow-up

**Step 2: Test edge cases**

- Empty prompt
- Cancel with Escape
- Session reload mid-flow
- Multiple features in one prompt

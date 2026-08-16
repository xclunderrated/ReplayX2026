# Feature Wizard Extension Design

## Overview

A Pi extension that adds an interactive "plan mode" before coding begins. After the user submits a prompt, the extension:

1. Intercepts the input and analyzes the task
2. Generates a plan with suggested steps
3. Shows the plan to the user for feedback (keyboard-driven)
4. Incorporates user changes and hands off to the agent
5. After coding completes, suggests follow-up features

## Architecture

```
User Prompt → Input Interceptor → Plan Generator → Plan UI → Agent → Suggestions UI → Follow-up
```

### Components

1. **InputInterceptor** - Catches `input` event, queues for processing
2. **PlanGenerator** - Analyzes codebase, generates structured plan
3. **PlanUI** - Custom TUI for reviewing/editing plan (keyboard-driven)
4. **SuggestionEngine** - Analyzes completed work, suggests next steps
5. **SuggestionUI** - Custom TUI for selecting suggestions

## Event Flow

### Pre-Coding Flow

1. User submits prompt (e.g., "Add OAuth login")
2. Extension's `input` handler fires
3. Extension reads relevant files (package.json, existing auth files)
4. PlanGenerator creates structured plan with questions
5. PlanUI displays plan + questions
6. User navigates with arrow keys, toggles items, adds custom
7. User confirms with Enter
8. Extension injects validated plan into system prompt
9. Agent proceeds with full context

### Post-Coding Flow

1. Agent completes work (detected via `agent_end`)
2. SuggestionEngine analyzes what was built
3. SuggestionUI shows relevant follow-ups
4. User selects suggestion(s)
5. Extension sends follow-up as new user message

## Data Structures

### WizardState

```typescript
interface WizardState {
  phase: "idle" | "planning" | "coding" | "suggesting";
  mode: "plan" | "suggestions";
  
  // Original user prompt
  originalPrompt: string;
  
  // Generated plan
  plan: PlanItem[];
  questions: Question[];
  
  // Suggestions after coding
  suggestions: SuggestionItem[];
  
  // UI state
  selectedIndex: number;
  cursorMode: "browse" | "edit";
  customInput: string;
}
```

### PlanItem

```typescript
interface PlanItem {
  id: string;
  description: string;
  files: FileChange[];
  enabled: boolean;
  category: "create" | "modify" | "delete" | "config";
}

interface FileChange {
  path: string;
  action: "create" | "modify" | "delete";
  summary: string;
}
```

### Question

```typescript
interface Question {
  id: string;
  text: string;
  type: "single" | "multi" | "text";
  options?: string[];
  selected: string[];
}
```

### SuggestionItem

```typescript
interface SuggestionItem {
  id: string;
  label: string;
  description: string;
  enabled: boolean;
  action: string; // Prompt to send if selected
}
```

## UI Specification

### Plan Review Screen

```
┌─────────────────────────────────────────────────────────────┐
│  Plan: Add OAuth Login                                     │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☑ Install passport-oauth20 and @types/passport-oauth20    │
│  ▶ Add OAuth routes in src/auth/oauth.ts                   │
│  ☐ Create user model for OAuth                             │
│  ☐ Add Google and GitHub provider config                   │
│  ☐ Add OAuth callback handler                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  Questions:                                                 │
│                                                             │
│  Which providers? [Google ▼]                               │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [↑↓] Navigate  [Space] Toggle  [a] Add  [Enter] Confirm   │
└─────────────────────────────────────────────────────────────┘
```

### Suggestion Screen

```
┌─────────────────────────────────────────────────────────────┐
│  What would you like to do next?                           │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ☑ Add unit tests for OAuth flow                          │
│  ☐ Add error handling for OAuth failures                  │
│  ☐ Add logout endpoint                                    │
│  ☐ Document OAuth flow in README                          │
│  ☐ Add password reset feature                             │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  [↑↓] Navigate  [Space] Toggle  [Enter] Proceed  [Esc] Done│
└─────────────────────────────────────────────────────────────┘
```

### Keyboard Controls

| Key | Action |
|-----|--------|
| `↑` / `↓` | Navigate items |
| `Space` | Toggle item on/off |
| `Enter` | Confirm / Select |
| `Esc` | Cancel / Done |
| `a` | Add custom item |
| `?` | Show help |

## Implementation Phases

### Phase 1: Core Extension Structure
- Set up extension with input interceptor
- Basic state management
- Session persistence

### Phase 2: Plan Generation
- Read relevant files (package.json, existing code)
- Generate structured plan
- Add questions for clarification

### Phase 3: Plan UI (Custom TUI)
- Full keyboard navigation
- Toggle items, answer questions
- Custom item input

### Phase 4: Post-Coding Suggestions
- Detect agent completion
- Analyze what was built
- Generate relevant suggestions

### Phase 5: Suggestion UI
- Display suggestions
- Handle selection
- Trigger follow-up

## Configuration

Settings stored in `settings.json`:

```json
{
  "featureWizard": {
    "enabled": true,
    "autoSuggest": true,
    "suggestionCount": 5,
    "questionCategories": ["providers", "styling", "testing", "docs"]
  }
}
```

## Edge Cases

1. **User cancels** - Return to normal agent flow
2. **Empty plan** - Allow user to write custom plan
3. **Very long plans** - Paginate or scroll
4. **No suggestions** - Skip suggestion UI gracefully
5. **Session reload** - Reconstruct state from session entries

## Future Enhancements

- Template-based plans for common features
- Learning from user preferences
- Multi-language support
- Plan history for similar tasks

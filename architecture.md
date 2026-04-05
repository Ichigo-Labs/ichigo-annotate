# Architecture

```
📦 ichigo-annotate.src
┣ 📂components: pure react components
┣ 📂hooks: common hooks
┣ 📂services: functionality with side effects
┣ 📂types: core app state and types
┣ 📂utils: pure functions
┗ app.tsx: entry point + state + orchestration
```

## components

Pure UI components consumed by `App`.  
These components must contain no internal state, except in rare scenarios (such as an animation spinner).

These components should take props as input, and communicate with the parent `App` via callback handlers.

These components handle _view_ concerns.

```tsx
// GOOD
<Sidebar
	width={appState.sidebarWidth}
	onResize={(newWidth) =>
		dispatch({ type: "set_sidebar_width", width: newWidth })
	}
/>

// BAD
<Sidebar />

// BAD
<Sidebar setWidth={...} />
```

## hooks

Module for shared hook components.

## services

Module for functionality that contains side effects including:

- Making web requests.
- Saving state to storage.

## types

Module for core domain objects, including the global app state spec (used by the `useAppReducer`).

# Overall Design

Pseudo-code demonstrating the overall app code design.

```tsx
// View
import { ... } from 'components/...';

// Actions
import { ... } from 'services/...';
import { ... } from 'hooks/...';

// Models + State
import { ... } from 'types/...';

function App() {
	// Handles:
	// - Initializing the app from storage.
	// - Orchestrating MVC.
	const [appState, dispatch] = useAppReducer({ initialState: ... });

	// All of the various handlers.
	const handleSidebarResize = () => {
		...
	};

	// ...

	// Pipe state + actions through to view components.
	return (
		<Container ..>
			<Sidebar .. />
			<Canvas .. />
		</Container>
	);
}
```

## State Design

Clearly separate UI state from general state.

UI state: `sidebarWidth`, `isSaveDialogOpen`, etc.  
General state: `exportFormat`.

Note, general state may still be consumed or displayed in the UI, but it is not inherent to the UI. For example, `exportFormat` would be applicable to a cli or a UI, while `sidebarWidth` is clearly not applicable to a cli.

All app state must live in `appState` and be modified via the `useAppState` reducer.

## Test Design

Publicly exported functions, hooks, components should have unit test.

- The tests should exercise the public interface.
- The tests should cover standard usage.
- The tests should cover edge cases.
- The tests must follow `Arrange-Act-Assert` structure.

## Code Design

**DO** reduce indentation.

- Use early returns.
- Factor out to helper functions.
- Push `if` and `try` blocks up or down the stack.

**DO** add concise summary comments over sections of code.

```tsx
// GOOD.
function makeRecipe() {
  // Set up the kitchen.
  turnOnOven(350);
  gatherIngredients(bread, mayo, salt, pepper, turkey, lettuce);

  // Make the sandwich.
  waitForOven().thenAdd(bread).thenWaitMinutes(5);
  const sandwich = combineIngredients(
    bread,
    mayo,
    salt,
    pepper,
    turkey,
    lettuce,
  );

  // Deliver the meal.
  handOffToRobot(sandwich);
  sendToRoom(robot);
}

// BAD.
function makeRecipe() {
  turnOnOven(350);
  gatherIngredients(bread, mayo, salt, pepper, turkey, lettuce);
  waitForOven().thenAdd(bread).thenWaitMinutes(5);
  const sandwich = combineIngredients(
    bread,
    mayo,
    salt,
    pepper,
    turkey,
    lettuce,
  );
  handOffToRobot(sandwich);
  sendToRoom(robot);
}
```

**DO NOT** allow modules to exceed 1200 lines of code. At this point, the module should be split and refactored.

# Code Quality Standards

## Naming and Documentation Consistency

When renaming functions, changing APIs, or refactoring modules, **always update all references**:

- **Variable names**: If a function is renamed (e.g., `searchDuckDuckGo` → `webSearch`), rename all variables that referenced the old name (e.g., `ddgResult` → `searchResult`)
- **Code comments**: Update inline comments that reference old names or old behavior
- **Doc comments**: Update JSDoc/TSDoc `@param`, `@returns`, and description text
- **Error messages**: Update user-facing or log error strings
- **File-level doc blocks**: Update the module description at the top of each file
- **Prop names**: If behavior changes (e.g., prop now hides a section, not just a heading), rename the prop to match

## Null Safety and Defensive Coding

**Always guard database query results** — never assume `rows[0]` exists:

```typescript
// BAD — throws if query returns no rows
const count = result.rows[0].cnt

// GOOD — safe access with fallback
const count = result.rows[0]?.cnt ?? 0
```

**Always guard config/options spread** — nested properties may be undefined:

```typescript
// BAD — throws if sourceCategories is undefined
const merged = { ...defaults, ...config?.sourceCategories }

// GOOD — fallback to empty object
const merged = { ...defaults, ...(config?.sourceCategories ?? {}) }
```

## DRY: Extract Before Duplicating

Before writing the same logic in two places (e.g., desktop and mobile views, multiple route handlers), extract it into a helper function or shared constant. Common cases:

- **Formatting helpers**: If the same data transformation appears in desktop table AND mobile card, extract a `formatX()` function
- **Shared test mocks**: If the same `vi.mock()` block appears across multiple test files, extract to a shared test helper
- **Validation logic**: If the same validation runs in multiple route handlers, extract to middleware or a shared function

## Accessibility Checklist

Every interactive element must be accessible:

- **Icon-only links/buttons**: Always include `aria-label` describing the action
- **Tap targets**: Minimum 44x44px for touch targets (add padding if icon is small)
- **Empty cells**: Don't use `aria-hidden="true"` as the only content — provide a screen-reader-friendly alternative
- **New interactive elements**: Add `data-testid` for testing

```tsx
// BAD — icon-only link with no label, tiny tap target
<Link to={url}><PencilIcon className="h-3.5 w-3.5" /></Link>

// GOOD — labeled, adequate tap target
<Link to={url} aria-label="Edit actor" className="inline-flex items-center justify-center rounded p-1.5 hover:bg-gray-100">
  <PencilIcon className="h-4 w-4" />
</Link>
```

## Type Safety

- **Database JSON columns**: `pg` auto-parses JSON — type as the parsed type (`MyType[]`), not `string`
- **Avoid `any`**: Use `unknown` and narrow with type guards instead
- **Optional vs required fields**: If a field is always returned by the API, don't mark it optional (`?`) on the frontend type. Only use `?` when some endpoints genuinely omit the field.

## AbortSignal Handling

When combining a caller-provided signal with a timeout, use `AbortSignal.any()` — never `??` which defeats the timeout:

```typescript
// BAD — caller signal disables timeout entirely
const signal = options?.signal ?? AbortSignal.timeout(30000)

// GOOD — both caller signal and timeout are enforced when a caller signal is provided
const timeoutSignal = AbortSignal.timeout(30000)
const signal = options?.signal
  ? AbortSignal.any([options.signal, timeoutSignal])
  : timeoutSignal
```

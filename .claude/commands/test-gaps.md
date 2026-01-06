# Test Gaps

Analyze files for missing test coverage based on project testing standards.

## Arguments

- `$ARGUMENTS` - File paths, directory, or "staged" to analyze git staged files. If empty, analyze files changed vs main branch.

## Instructions

### 1. Identify target files

Determine which source files to analyze:

- **If `$ARGUMENTS` is "staged"**: Run `git diff --cached --name-only` to get staged files
- **If `$ARGUMENTS` is a directory**: Find all `.ts`/`.tsx` files in that directory (excluding test files)
- **If `$ARGUMENTS` is a file path**: Analyze that specific file
- **If `$ARGUMENTS` is empty**: Run `git diff main --name-only` to get changed files

Filter to only source files:
- Frontend: `src/**/*.ts`, `src/**/*.tsx` (exclude `*.test.*`)
- Backend: `server/src/**/*.ts` (exclude `*.test.*`)

### 2. Find corresponding test files

For each source file, locate its test file:
- `src/components/Foo.tsx` → `src/components/Foo.test.tsx`
- `src/hooks/useFoo.ts` → `src/hooks/useFoo.test.ts` or `.test.tsx`
- `src/pages/FooPage.tsx` → `src/pages/FooPage.test.tsx`
- `server/src/routes/foo.ts` → `server/src/routes/foo.test.ts`
- `server/src/lib/foo.ts` → `server/src/lib/foo.test.ts`

### 3. Analyze for coverage gaps

For each source file, read both the source and its test file (if exists). Check for these required test categories per `.claude/rules/testing.md`:

#### Happy Path Tests
- Main function/component behavior works correctly
- Expected inputs produce expected outputs
- Default props render correctly

#### Error Handling Tests
- Database errors caught and handled (backend)
- API failures return appropriate status codes (backend)
- Error states display correctly (frontend)
- Invalid input rejected with proper messages

#### Edge Cases
- Empty results (empty arrays, null values)
- Pagination boundaries (page 1, last page, page out of range)
- Optional parameters missing/present
- Boundary values (min/max limits)

#### Conditional UI State Tests (React components)
- Each boolean prop state tested separately
- Toggle states (checked/unchecked, open/closed)
- Loading/error/success states
- Different data shapes (has data vs no data)

### 4. Report findings

For each analyzed file, report:

```
## src/components/Foo.tsx

Test file: src/components/Foo.test.tsx [EXISTS/MISSING]

Coverage gaps:
- Missing test file (create Foo.test.tsx)
- Missing happy path test for: main render
- Missing error handling test for: API failure state
- Missing edge case test for: empty data array
- Missing conditional state test for: isLoading=true
```

### 5. Offer to write tests

After reporting all gaps, ask:
> "Would you like me to write tests for any of these gaps? Specify which files or gaps to address."

## Example Test Patterns

### Backend Route Test (Vitest + Express mock)
```typescript
describe("getXxx", () => {
  it("returns data with pagination metadata", async () => {
    vi.mocked(db.getXxx).mockResolvedValueOnce({ items: [...], totalCount: 100 })
    await getXxx(mockReq as Request, mockRes as Response)
    expect(jsonSpy).toHaveBeenCalledWith(expect.objectContaining({...}))
  })

  it("parses query parameters correctly", async () => {...})
  it("returns 500 on database error", async () => {...})
  it("handles empty results", async () => {...})
})
```

### Frontend Component Test (Vitest + React Testing Library)
```typescript
it("renders correctly with default props", () => {
  render(<Component />)
  expect(screen.getByRole("heading")).toBeInTheDocument()
})

it("shows loading state when isLoading=true", () => {
  render(<Component isLoading={true} />)
  expect(screen.getByTestId("loading-spinner")).toBeInTheDocument()
})

it("shows error message when error occurs", () => {
  render(<Component error="Something went wrong" />)
  expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
})

it("shows empty state when data is empty", () => {
  render(<Component data={[]} />)
  expect(screen.getByText(/no results/i)).toBeInTheDocument()
})
```

### Frontend Hook Test (Vitest + React Testing Library + TanStack Query mock)
```typescript
it("returns data on successful fetch", async () => {
  server.use(http.get("/api/xxx", () => HttpResponse.json({...})))
  const { result } = renderHook(() => useXxx(), { wrapper: QueryWrapper })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(result.current.data).toEqual(expect.objectContaining({...}))
})
```

## Notes

- Per CLAUDE.md: "Test coverage is NEVER out of scope"
- Tests must import and test actual production code, not reimplementations
- Query preference order: `getByRole` > `getByLabelText` > `getByText` > `getByTestId`
- Never use CSS class selectors in tests
- Use `data-testid` for complex elements that lack accessible roles

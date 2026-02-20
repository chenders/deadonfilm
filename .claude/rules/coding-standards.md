# Code Quality Standards

## Naming and Documentation Consistency

When renaming functions, changing APIs, or refactoring modules, **always update all references**:

- **Variable names**: If a function is renamed (e.g., `searchDuckDuckGo` → `webSearch`), rename all variables that referenced the old name (e.g., `ddgResult` → `searchResult`)
- **Code comments**: Update inline comments that reference old names or old behavior
- **Doc comments**: Update JSDoc/TSDoc `@param`, `@returns`, and description text
- **Error messages**: Update user-facing or log error strings
- **File-level doc blocks**: Update the module description at the top of each file

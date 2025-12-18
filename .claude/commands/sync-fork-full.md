# Migration Plan: Full Sync from External Repository Comparison

**Objective**
Compare two external repositories and identify both improvements to integrated code AND new features that can be added to this project.

## Context

- This project has integrated a subset of features from an external repository
- We want to track improvements in that external repository (or its forks)
- We also want to identify new features added from scratch
- We DON'T want changes to features we deliberately didn't integrate

## Usage

Provide a GitHub compare URL in the format:

```
https://github.com/OWNER/REPO/compare/BASE...HEAD
```

**Example:**

```
https://github.com/zbeyens/sparka/compare/main...FranciscoMoretti:sparka:main
```

## Workflow

1. **Parse the compare URL** to extract:
   - Repository owner and name
   - Base branch
   - Head branch (may include fork reference)

2. **Fetch the diff** using GitHub CLI:

   ```bash
   gh api repos/OWNER/REPO/compare/BASE...HEAD --jq '.files[] | "\(.filename)\n\(.patch)\n"'
   ```

3. **Analyze changes** against this project:
   - Identify which files/features from the comparison exist in this project
   - Identify entirely new files/features (created from scratch)
   - Ignore changes to files/features that exist in external repo but not in this project

4. **Categorize changes into TWO sections**:

   ### Section A: Improvements to Integrated Features
   - Bug fixes (for code we have)
   - Performance improvements (for code we have)
   - Code quality improvements (for code we have)
   - Refactoring (for code we have)
   - Documentation updates (for features we have)

   ### Section B: New Features (From Scratch)
   - Entirely new components/files
   - New functionality that doesn't exist anywhere in this project
   - New capabilities added from scratch

   ### IGNORE:
   - Changes to features that exist in external repo but NOT in this project
   - Updates to files we deliberately didn't integrate

5. **Create a prioritized migration plan** with:
   - **Section A: Improvements to sync** (what to backport)
   - **Section B: New features to consider** (what to add)
   - Value and rationale for each change
   - Any potential conflicts or integration concerns
   - Recommended order of migration
   - File mappings (external repo → this project)

## Constraints

- **Section A**: Sync only improvements to features already in this project
- **Section B**: Include only features created from scratch (not updates to un-adopted features)
- **Exclude**: All changes to features that exist in external repo but not in this project
- Focus on keeping our integrated subset up-to-date AND identifying valuable additions
- Consider our project's specific architecture and patterns

## Key Distinction

- ✅ **Include**: New feature X created from scratch
- ✅ **Include**: Improvement to feature Y we already have
- ❌ **Exclude**: Change to feature Z that exists in external repo but we never integrated

---

**Please provide a GitHub compare URL to begin the analysis.**

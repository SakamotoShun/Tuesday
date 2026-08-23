# Tuesday Document Workflows

Tuesday documents store BlockNote blocks. The MCP supports creation, title updates, appends, targeted block edits, and deliberate whole-body replacement. It does not expose document deletion or database-document schema operations.

Prefer `edit_doc_blocks` for localized corrections. Use `write_doc_blocks` only when replacing the complete body is intentional.

## Discover and Read

1. Find a project with `list_projects` or `search_workspace`.
2. Find document metadata with `list_project_docs`.
3. Call `get_doc` before any edit. Record the `id`, `version`, content, and relevant block ID paths.

`list_project_docs` omits block content. Only `get_doc` provides the canonical content and current version needed for safe edits.

## Choose Source or Blocks

`create_doc` accepts zero or one of `source` and `blocks`. Supplying neither creates an empty document. `append_doc_blocks` requires exactly one of them. Never provide both.

Use `source` for simple content:

- Headings
- Paragraphs
- Flat bullet, numbered, and check lists
- Fenced code blocks

Set `sourceFormat` explicitly to `markdown`, `html`, or `text`; avoid `auto` when the format is known.

Source conversion is intentionally lossy. Inline styles and links are flattened, images become text, blockquotes become paragraphs, nested lists lose nesting, and heading levels 4-6 become level 3.

Use raw `blocks` for:

- Rendered tables
- Styled inline text
- Precise BlockNote structure
- Stable block IDs needed for later placement or retry verification

`create_doc` and `append_doc_blocks` accept partial BlockNote blocks and fill missing IDs, types, props, and children before persistence. `edit_doc_blocks` replacements and `write_doc_blocks` require every root and nested block to have a unique non-empty `id`, a non-empty `type`, object `props`, and array `children`. Type-specific content remains the caller's responsibility, so tool acceptance does not prove that a payload will render correctly. Verify mutations with `get_doc`.

Document block payloads are limited to 512 KiB of UTF-8 JSON, 10,000 total blocks, block depth 32, and JSON nesting depth 128. Edit calls allow at most 100 operations, 100 replacement roots per operation, and ID paths up to 32 levels. The MCP HTTP request limit is 1 MiB.

Historical documents remain readable. A targeted edit normalizes partial legacy blocks as part of a successful commit. If an old block has no ID, it cannot be named by the prior `get_doc` response; use one deliberate `write_doc_blocks` call with complete, unique IDs, then call `get_doc` again before targeted editing.

## Tables

Markdown and HTML tables do not become rendered tables. This Markdown:

```markdown
| Name | Status |
| --- | --- |
| API | Done |
```

becomes two paragraph blocks containing `Name | Status` and `API | Done`; the separator row is discarded. Use a raw BlockNote table block when a rendered table is required.

An inline BlockNote table is not a Tuesday database document. MCP can create inline tables, but it cannot create a database view or set `isDatabase`, `schema`, or row `properties`.

### Canonical two-column table

Use unique IDs, rectangular rows, complete cell props, and inline text runs inside cells. Omit `columnWidths` to let Tuesday size columns automatically, or provide concrete numeric widths when fixed sizing is useful. A widthless table may contain `null` entries when read back through JSON; those are normalized output values, not values to copy into a new input payload. Keep `colspan` and `rowspan` at `1`; Tuesday does not enable advanced table headers or merge/split behavior.

```json
[
  {
    "id": "agent-table-1",
    "type": "table",
    "props": {
      "textColor": "default"
    },
    "content": {
      "type": "tableContent",
      "columnWidths": [160, 160],
      "rows": [
        {
          "cells": [
            {
              "type": "tableCell",
              "props": {
                "backgroundColor": "default",
                "textColor": "default",
                "textAlignment": "left",
                "colspan": 1,
                "rowspan": 1
              },
              "content": [
                {
                  "type": "text",
                  "text": "Name",
                  "styles": { "bold": true }
                }
              ]
            },
            {
              "type": "tableCell",
              "props": {
                "backgroundColor": "default",
                "textColor": "default",
                "textAlignment": "left",
                "colspan": 1,
                "rowspan": 1
              },
              "content": [
                {
                  "type": "text",
                  "text": "Status",
                  "styles": { "bold": true }
                }
              ]
            }
          ]
        },
        {
          "cells": [
            {
              "type": "tableCell",
              "props": {
                "backgroundColor": "default",
                "textColor": "default",
                "textAlignment": "left",
                "colspan": 1,
                "rowspan": 1
              },
              "content": [
                { "type": "text", "text": "API", "styles": {} }
              ]
            },
            {
              "type": "tableCell",
              "props": {
                "backgroundColor": "default",
                "textColor": "default",
                "textAlignment": "left",
                "colspan": 1,
                "rowspan": 1
              },
              "content": [
                { "type": "text", "text": "Done", "styles": {} }
              ]
            }
          ]
        }
      ]
    },
    "children": []
  }
]
```

Cells contain inline text runs, not paragraph blocks. Do not omit rows, cells, props, `styles`, or the table's `children` array.

## Common Raw Blocks

### Paragraph

```json
{
  "id": "agent-paragraph-1",
  "type": "paragraph",
  "props": {
    "textColor": "default",
    "backgroundColor": "default",
    "textAlignment": "left"
  },
  "content": [
    { "type": "text", "text": "Project summary", "styles": {} }
  ],
  "children": []
}
```

### Heading

```json
{
  "id": "agent-heading-1",
  "type": "heading",
  "props": {
    "level": 2,
    "isToggleable": false,
    "textColor": "default",
    "backgroundColor": "default",
    "textAlignment": "left"
  },
  "content": [
    { "type": "text", "text": "Overview", "styles": {} }
  ],
  "children": []
}
```

Use unique root block IDs within a document. Stable IDs also let an agent detect whether an uncertain append already succeeded.

## Edit Existing Blocks

Use `edit_doc_blocks` for atomic targeted changes. Each operation addresses a block with an ID path. The first ID identifies a root block; each later ID must identify a direct child of the previous block.

```json
{
  "docId": "DOC_UUID",
  "expectedVersion": 8,
  "operations": [
    {
      "type": "delete",
      "path": ["obsolete-root-block"]
    },
    {
      "type": "replace",
      "path": ["section-root", "old-paragraph"],
      "blocks": [
        {
          "id": "old-paragraph",
          "type": "paragraph",
          "props": {
            "textColor": "default",
            "backgroundColor": "default",
            "textAlignment": "left"
          },
          "content": [
            { "type": "text", "text": "Corrected content", "styles": {} }
          ],
          "children": []
        }
      ]
    }
  ]
}
```

A one-block replacement that retains the target ID is the standard way to modify a block. A replacement may contain multiple blocks; they occupy the target's sibling position in the supplied order. Use `delete` rather than an empty replacement.

All paths resolve against the original document snapshot. Tuesday rejects duplicate targets, a parent and descendant edited in the same call, missing paths, malformed blocks, and duplicate IDs in the final document. The entire batch either commits once or does not change the document.

## Write the Complete Body

`write_doc_blocks` is analogous to overwriting a file. It replaces every existing body block with the supplied raw blocks. An empty array clears the body.

```json
{
  "docId": "DOC_UUID",
  "expectedVersion": 8,
  "blocks": [
    {
      "id": "replacement-heading",
      "type": "heading",
      "props": {
        "level": 1,
        "isToggleable": false,
        "textColor": "default",
        "backgroundColor": "default",
        "textAlignment": "left"
      },
      "content": [
        { "type": "text", "text": "Replacement document", "styles": {} }
      ],
      "children": []
    }
  ]
}
```

Do not use a full write merely to correct one table row or remove a few paragraphs. It is easy to omit content unintentionally; use `edit_doc_blocks` instead.

## Creation Recipes

### Complete Markdown document

```json
{
  "parent": { "type": "project", "id": "PROJECT_UUID" },
  "title": "Release notes",
  "source": "# Release notes\n\n- Added feature A\n- Fixed bug B",
  "sourceFormat": "markdown",
  "idempotencyKey": "doc:PROJECT_UUID:release-notes:2026-07-12"
}
```

Call `get_doc` with the returned ID because `create_doc` returns metadata, not content.

### Empty child document

```json
{
  "parent": { "type": "doc", "id": "PARENT_DOC_UUID" },
  "title": "Follow-up",
  "idempotencyKey": "doc:PARENT_DOC_UUID:follow-up:2026-07-12"
}
```

A project parent creates a project root document. A doc parent creates a child that inherits the parent's project. MCP does not create personal root documents.

## Append Recipes

Always call `get_doc` immediately before appending and pass its exact version.

### Append source at the end

```json
{
  "docId": "DOC_UUID",
  "source": "## Follow-up\n\nAdditional notes.",
  "sourceFormat": "markdown",
  "expectedVersion": 4,
  "position": { "type": "end" }
}
```

Omitting `position` also appends at the end. Use `{ "type": "start" }` to prepend.

### Append after a root block

```json
{
  "docId": "DOC_UUID",
  "blocks": [
    {
      "id": "agent-paragraph-follow-up-1",
      "type": "paragraph",
      "props": {
        "textColor": "default",
        "backgroundColor": "default",
        "textAlignment": "left"
      },
      "content": [
        { "type": "text", "text": "Inserted content", "styles": {} }
      ],
      "children": []
    }
  ],
  "expectedVersion": 4,
  "position": {
    "type": "after_block",
    "afterBlockId": "EXISTING_ROOT_BLOCK_ID"
  }
}
```

`after_block` finds root-level blocks only. It cannot target a nested child. Use start or end if no stable root ID is available. A call may append at most 100 blocks.

Tuesday rejects appends while browser collaborators are active. Wait for collaborators to disconnect, then call `get_doc` again before retrying.

## Conflict Recovery

If a title update, append, edit, or full write reports a version conflict:

1. Call `get_doc` again.
2. Inspect the new title and content, not only the version.
3. Decide whether the requested change is still needed and whether its placement remains correct.
4. Retry once with the newly read version if appropriate.

Do not replay a mutation merely by replacing `expectedVersion`; another edit may have made it redundant or changed the intended target.

If a content mutation reports durable collaborative edits that are not yet canonical, Tuesday has preserved browser-authored collaboration history and refused to overwrite it. Open the document in a writable browser session to trigger collaboration snapshotting, call `get_doc` again, and reassess the mutation. Re-reading may temporarily return the same version; do not retry until a current snapshot advances the canonical document.

## Ambiguous Append Recovery

`append_doc_blocks` has no idempotency key. A timeout or lost response may occur after the append committed, so a blind retry can duplicate content.

1. Call `get_doc` after an uncertain result.
2. Search the canonical root content for the unique IDs of the intended raw blocks.
3. For source appends without known IDs, inspect the expected location and text carefully.
4. If the content exists, treat the append as successful and use the document's current version.
5. Retry only when the intended content is absent, using the newly read version.

For reliable retries, prefer raw blocks with deterministic unique IDs over source when appending important structured content.

## Ambiguous Edit or Write Recovery

`edit_doc_blocks` and `write_doc_blocks` use optimistic concurrency. If a response is lost after commit, replaying the old `expectedVersion` cannot apply the mutation twice, but it will return a conflict.

1. Call `get_doc` after an uncertain result.
2. Inspect the current version and canonical content.
3. If the intended result is present, treat the mutation as successful.
4. If it is absent, reassess paths or the complete replacement body before retrying with the new version.

# Browser workflows and workbench comparison

The public app is a static, desktop-only editor. All project writes use IndexedDB transactions and expected revision checks. It does not connect to the optional loopback service, send photographs to a server, or call an AI provider.

| Workflow | Browser app |
| --- | --- |
| Local folders | Read-only directory picker, folder-input fallback, reconnect with hash checks; JPEG, PNG, WebP, HEIC/HEIF |
| RAW pairs | Paired RAW files are skipped; unpaired unsupported formats are reported, never deleted |
| HEIC | Native decoding first; lazy local CSP-compatible decoder fallback; unsupported/corrupt inputs remain errors |
| Library | Full-library search, source/selection/analysis/place/people filters, bounded rendering, previous/next, P/U/X/0 selection |
| Manual annotations | Individual and batch selection, place, people labels; project-only rotation; no automatic person identification |
| Analysis | Download ZIP with preview images, manifest, hashes and instructions; import results by source hash; history and independent acceptance |
| External culling | Import neutral hash-matched JSON, inspect reject references and similar groups; never apply external decisions automatically |
| Chapters | Create, rename, reorder, inspect members, add and move photos; existing spread edits/crops survive chapter moves |
| Independent drafts | Duplicate the complete project with cached media into an independent editing variant |
| New facing-page books | Default project mode; full spread editor, one-to-six-photo layouts, live placement editing and chapter openings |
| New single-page books | One-to-four-photo layouts, blank pages, order, titles, captions, add/remove/swap, crop/fit/zoom/pan, live preview and explicit save/cancel |
| Migrated spread books | Original one-to-six-photo layouts, chapter openings, cover/back/spine, title/closing matter, add/remove/replace/swap, live placement preview |
| Navigation | Overview, edit/preview, continuous drag/wheel filmstrip, keyboard focus; pending changes block navigation/export |
| Cover design | Full photo, inset photo or text cover; front/back photos, title toggle, subtitle, crop and spine text |
| Undo and reopen | Ten persisted project snapshots, atomic undo with revision checks; history is local and not included in backups |
| Backup | `.photobook` stores configuration, manual annotations, analysis, references and placements; restore forks project identity |
| PDF | 150 ppi cached-preview review; 300 ppi original/verified-derivative RGB raster export; body folio ranges, optional matter, wrap cover and separate spine |
| Print intentions | Book size and provisional spine; migrated books also retain editable supplier, stock, binding, bleed/safety intentions and paper preview |

The former workbench's SQLite mutation APIs, macOS `sips`, direct Excire database helper and authenticated export-job server are deliberately not hosted. Browser equivalents use local configuration, a decoder and download/import exchanges. Printer-certified PDF/X, ICC conversion, actual bleed/template generation and physical proof acceptance remain outside both implementations. Entering a bleed intention does not add bleed to the PDF.

## Analysis exchange

In **分析任务**, choose the next batch or select up to 48 photos and download a ZIP. Unpack it and provide its instructions, manifest and previews to your analyst. Viewing pictures through Codex may use its network-backed model; the website itself sends nothing.

Import a result JSON in **分析任务** or the library:

```json
{
  "analyst": "Codex",
  "model": "unknown",
  "results": [{
    "sourceHash": "64-character SHA-256 from the manifest",
    "relativePath": "folder/photo.jpg",
    "result": {
      "summary": "Visible subjects and setting",
      "composition": "Visible composition",
      "tags": ["warm light"],
      "bookRole": "Possible album use",
      "cautions": [],
      "uncertainties": [],
      "visualStudy": {}
    }
  }]
}
```

Use the actual hash. `relativePath` resolves duplicate-content ambiguity. Filenames alone are never accepted as identity. Imports append analyses without rewriting manual annotations, selection or pages. Accepting an analysis is separate from keeping a photograph.

## External culling exchange

**外部选片** accepts a neutral JSON file. Export/adapt existing tool data outside the public app; do not provide proprietary face vectors or identity databases.

```json
{
  "provider": "Existing selection",
  "entries": [{
    "sourceHash": "64-character SHA-256",
    "relativePath": "folder/photo.jpg",
    "flag": "exclude",
    "group": "similar-01"
  }]
}
```

Supported reference flags are `keep`, `exclude`, `pending` and `unknown`. A group is only a reference for comparison. Unknown or ambiguous hashes are reported and not guessed.

## Local data and recovery

- Existing browser projects migrate in place when the history store is added. If another tab holds the older database open, close that tab and reload.
- Browser storage is scoped to an origin. Moving from localhost to Pages or to a custom domain requires a backup or private migration bundle.
- A backup does not contain original photos, cached previews or undo history. Reconnect each source using **重新选择** after restoration. A migration bundle can reconnect its verified media.
- Selecting the same native directory handle reconnects it; the folder-input fallback cannot prove directory identity, so use the existing source's reconnect control.
- Duplicating a project copies its cached media references and available handles, allowing independent design variants. Deleting a project removes only that browser project's records/caches/history.
- 300 ppi exports need readable originals or the migrated book's verified high-resolution derivatives. A 150 ppi review can use cached previews after reopening.
- Large libraries and whole-book high-resolution exports need browser memory. A successful sample export is not a large-library performance or print-quality certification.

## Third-party code

The optional HEIC decoder is `heic-to` 1.6.6 (LGPL-3.0-or-later), loaded separately from the initial application. ZIP export uses `fflate` 0.8.3 (MIT). Distribution notices and replacement/source instructions are served in `licenses/NOTICE.txt`; dependency licensing is independent of this project's ISC license.

# Photo Book Studio

A desktop photo-book editor that works with local folders. No account, photo upload, API key or server is required for the browser app.

用本地照片制作影集：选片、标注、跨页编排、封面与书脊预览、项目备份和 PDF 导出。照片保持只读，书稿存放在当前浏览器。

## Run locally

Requires Node.js 22.13+; development and CI use 22.22.3.

```sh
npm ci
npm run browser:dev
```

Open http://127.0.0.1:4318/ in desktop Chrome or Edge. Other browsers can use the folder-input fallback. HEIC uses native decoding with an on-demand local decoder fallback; directory authorization still depends on browser support. This is a desktop editor.

1. Create a project and select a local photo folder.
2. Select photos and arrange pages; changes are stored in IndexedDB.
3. Download a `.photobook` project backup before clearing browser data.
4. Reopen a project or restore its backup and reconnect the photo folder.
5. Export a complete review, selected interior pages, or a back/spine/front cover spread.

Backups contain album configuration and annotations, not original media. Each origin has independent browser storage: localhost, GitHub Pages and a custom domain do not share saved projects. Use a backup or a private migration bundle when moving between them.

## Editor

- Library browsing, full-library search, source/selection/analysis/place/people filters and photo metadata.
- Fast individual and batch people/place/selection editing, keyboard review and project-only rotation.
- Chapter creation, membership, order and cross-chapter moves; independent draft copies.
- Local Codex task ZIPs with actual previews and hash-validated result import; neutral external culling/group JSON import.
- Independent page/spread layouts, live crop/fit/zoom/position preview, explicit save/cancel, photo replacement and optional captions.
- Persistent ten-step undo, reconnect, independent project restore and local draft cleanup.
- Full-book overview, chapter outline, continuous thumbnail navigation and focused preview.
- CSS physical-book shading that can be disabled; it never enters the exported PDF.
- Cover, back-cover and spine preview, plus editable size/spine intentions.
- Importable AI descriptions, composition, color and other visual observations matched by source hash; analyses do not automatically overwrite manual selection or annotations.

The app itself does not call a model provider. Imported analyses can be prepared separately. Rendering and PDF generation happen in the browser. 150 ppi review uses cached previews; 300 ppi output requires readable originals or verified migrated derivatives. Export all body pages or a folio range, choose whether to include blank/title/closing matter, and export a combined back/spine/front cover or a standalone spine. Large exports need enough memory and an open tab.

The browser/workbench comparison, exchange JSON examples and recovery details are documented in [Browser workflows](docs/public/browser-workflows.md). New projects default to facing-page books with one-to-six-photo spreads. Independent single-page books are also available with up to four photos per page. Migrated books retain their original layouts.

## PDF boundaries

Browser exports are RGB raster PDFs. They are not certified PDF/X. Confirm bleed, ICC/color workflow, binding, safe areas, spine width and the vendor's cover template with the printer. Missing parameters remain pending; a visual spine or paper simulation does not certify physical production.

## Build and deploy

```sh
npm run typecheck
npm test
npm run browser:build
npm run public:check -- --artifact dist-browser
```

`dist-browser/` is the only public website artifact. Its relative asset paths support both a GitHub Pages project URL and a custom domain.

Pushes to `main` run the GitHub Actions checks, build the app and deploy to GitHub Pages. Pull requests run checks without deploying. Setup and optional `album.miaowu.org` binding: [Deployment guide](docs/public/deployment.md).

## Optional original local workbench

`apps/web` and `apps/local-service` retain the original macOS loopback-only workflow. It uses SQLite, system `sips` decoding, structured analysis exchange and versioned editing/export APIs. It is not deployed to Pages.

```sh
npm run dev
```

Open http://127.0.0.1:4317/. Its private data directory is `.local/`. Native-decoder tests and PDF-font tests need macOS; the CI runner uses macOS for the complete suite.

A private legacy-book migration can be prepared locally, with explicit source and output arguments:

```sh
npm run browser:book:export -- <data-directory> <book-id> <new-output-directory> <highres-job-directory>
```

Migration bundles contain personal data and derived photographs. Keep them outside the public repository and select them locally in the browser's project menu.

## Structure

| Directory | Purpose |
| --- | --- |
| `apps/browser` | Static local-first React/Vite app |
| `apps/web`, `apps/local-service` | Optional original local workbench |
| `packages/browser-local` | Browser project/backup validation |
| `packages/domain`, `packages/metadata`, `packages/analysis` | Original import, persistence and exchange logic |
| `packages/publishing` | Shared layout geometry and PDF helpers |
| `tests` | Domain, import, persistence and publishing checks |

Private photos, databases, editorial history, migration bundles, review screenshots and generated PDFs are intentionally excluded from Git and Pages.

## License

[ISC](LICENSE) for project code. Third-party decoder/ZIP licenses and source/replacement instructions are included under `apps/browser/public/licenses/`.

# Publishing

已实现冻结快照的屏幕审阅 PDF：`review.mjs` 使用 PDFKit，`geometry.mjs` 与 `text.mjs` 共用网页的毫米图框、图片裁切和文字换行规则。输出封面、完整跨页、封底及章节书签；嵌入中文字体，保留地点和页码，文字可搜索。不是网页截图。

导出先检查书稿版本、当前素材哈希与方向版本，再复制并校验项目预览，记录清单和 PDF 哈希。只读数据库，不读原片，不修改书稿或选片。任务和文件在私有数据目录 `exports/book-review/<id>/`；未完成或损坏文件不可下载。

默认字体为 macOS 系统 Songti TTC 的 `STSongti-SC-Regular`，可通过服务端 `PBS_PDF_FONT`／`PBS_PDF_FONT_NAME` 指定本地字体；字体不可用时明确失败，不静默替换中文。

1600px 预览只用于屏幕审阅。`high-resolution.mjs` 已实现从原片只读生成高清派生图，供独立高清 PDF 使用。印厂模板、出血、ICC 软打样、单页／跨页打印策略及实体打样尚未实现；已保存的打印参数仍为意向。详见[审阅 PDF](../../docs/planning/13-review-pdf-export.md)。

高清任务使用 `quality: "highres"`，独立目录 `exports/book-highres/<id>/` 和认证 API `book-hd-exports`。复用 renderer 与毫米／文字几何，封面、完整跨页、封底顺序相同。派生最长边按所有放置实例的图框、fit、zoom 计算 300 ppi 需要，受原片像素上限约束；不插值放大。macOS sips 转换为 sRGB JPEG 95，沿用项目旋转顺序。清单记录原片及派生哈希、尺寸、方向、处理参数和每个放置的有效 ppi；原片转换前后双重哈希、缓存哈希、来源边界、输出尺寸／比例与全黑检查不可删除。高清失败不得降级到屏幕预览。下载先流式校验哈希，再流式响应，避免服务持有整本大文件的额外缓冲。详见[高清导出](../../docs/planning/14-high-resolution-pdf.md)。

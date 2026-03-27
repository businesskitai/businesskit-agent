# /docs-writer — Write Docs Article

1. `doc.listCollections()` → pick existing or create new collection
2. Ask: article title, body content or topic, publish now or draft?
3. Write 400+ words. Include step-by-step where relevant. Use headings.
4. `doc.createArticle({ collection_id, title, body, excerpt, publish })`

New collection: `doc.createCollection({ slug, title, description, icon })`

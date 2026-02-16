# Research File Formats

> Reference for CSV formats used by the research upload system. Moved out of CLAUDE.md.

## Keywords CSV (DataDive export)
```
Columns: Search Terms, Type, SV (search volume), Relev. (relevancy score), Sugg. bid & range, [ASIN rank columns...]
Rows: ~600 per file
Example: "chalk markers", "edit", 281733, 0.684, "", 5, 1, 14, ...
```
**Gotcha:** Starts with BOM character `\uFEFF` — must strip before header detection. Empty first column — filter empty strings from headers.

## Reviews CSV (Apify scrape)
```
Columns: Date, Author, Verified, Helpful, Title, Body, Rating, Images, Videos, URL, Variation, Style
Rows: ~3000+ per file
```

## Q&A CSV (Amazon scrape)
```
Format: Question/Answer pairs, one pair per row
Rows: ~30-100 per file
```

## Rufus Q&A CSV (Amazon Rufus AI)
```
Same format as Q&A CSV but from Amazon's Rufus AI responses
Rows: ~30-100 per file
```
**Note:** Identical to Q&A CSV format — can't auto-distinguish. Auto-detect defaults to `qna`, user manually selects `rufus_qna` via dropdown.

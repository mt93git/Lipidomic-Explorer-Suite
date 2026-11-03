# Companion knowledge base

The companion answers **only** from this knowledge base. It never invents, never uses a language model for
answers, and never looks anything up outside these files. Every answer is one to three passages quoted
word for word, each followed by its source file. When the base does not hold enough evidence for a
question, the answer is exactly:

> I have no information about this.

## What is in it

| Layer | Folder | Tracked in git | Purpose |
| --- | --- | --- | --- |
| Seed | `knowledge_base/seed/*.md` | yes | Reviewed guidance about how the application works (Team and Classic). |
| Library | `knowledge_base/library/` (or the folder in `LIPIDOMIC_KB_DIR`) | no, by default | Files you feed: papers, protocols, notes, tables of results. |

**Current scope.** For now the companion answers questions only from the library, which holds the folder
*Global Lipids Overview and Functions*. The seed guidance is not searched, so a question about how the
application works gets `I have no information about this.` The "Explain this step" button still reads its fixed
step text from the seed, because that is navigation help, not knowledge. Set `LIPIDOMIC_KB_SEARCH_SEED=1` to let
questions use the app guidance too.

The library is ignored by git on purpose: articles can be copyrighted and result tables can be private. To
version it, remove the two `knowledge_base/library` lines from `.gitignore`.

## Feeding it

```bash
Rscript 03_COMPANION_KNOWLEDGE.R add path/to/file_or_folder
Rscript 03_COMPANION_KNOWLEDGE.R add protocol.docx --audience=team --tags=protocol,sample-prep --title="Sample preparation protocol"
Rscript 03_COMPANION_KNOWLEDGE.R list
Rscript 03_COMPANION_KNOWLEDGE.R remove <id-or-file-name>
Rscript 03_COMPANION_KNOWLEDGE.R ask "what is PQN normalization"
Rscript 03_COMPANION_KNOWLEDGE.R stats
```

The running app reloads the base when its files change; no restart is needed. In Docker, the library is not baked into
the image: mount a persistent volume and set `LIPIDOMIC_KB_DIR` to it, then run the same commands inside the container.

| File type | How it is read |
| --- | --- |
| `.md`, `.txt` | By heading and paragraph. |
| `.docx` | By heading and paragraph (Heading 1-4 and Title styles). |
| `.pdf` | By page and paragraph; the page number is shown in the source line. Needs the `pdftools` package. Scanned PDFs without a text layer have no text to read. |
| `.csv`, `.tsv`, `.xlsx` | One passage per row (`column: value; column: value`), plus a header passage. The first 20,000 rows of each sheet are read. |

Limits: 50 MB per file, 8,000 passages per file. Feeding the same file again replaces its passages.

### Images and slide decks without a text layer

Infographics, scanned pages and PowerPoint slides that are pictures have no text to read, and OCR is not used:
its errors would be quoted as if they were in the source ("Lipin-1α (nucleus)" came out as "Lpin-ta (mucous)").
Transcribe each image to a Markdown file, word for word, and feed the Markdown. Start the file with
`<!-- source: folder/image.png -->` so every answer cites the image it came from, and mark any word you cannot
read as `[illegible]` instead of guessing. Tables written as Markdown tables become one passage per row, each value
prefixed by its column name. Spot-check the transcription against the image before feeding it.

### Writing Markdown for the base

Plain Markdown works. Two optional comments, placed right under a heading, refine a section:

```markdown
## Normalization
<!-- audience: team -->        (all | team | classic; default is the --audience given when feeding)
<!-- tags: topic-normalization, protocol -->
Text of the section...
```

`audience` decides which interface may quote the section. `<!-- source: name -->` anywhere in the file makes its passages cite that name. Other HTML comments are ignored.

## How a question is answered

1. The question is reduced to its content words (stop words dropped, plurals and endings normalized,
   lipid species such as `PC 34:1` kept whole).
2. Passages are ranked with BM25.
3. A passage is eligible only when it holds enough of the question's words (`LIPIDOMIC_KB_MIN_COVERAGE`, default
   0.5) and enough of their weight, where rare words count more than common ones and a word the base has never
   seen counts against the match (`LIPIDOMIC_KB_MIN_WEIGHTED`, default 0.6).
4. The question's words must meet inside one line of the passage (a bullet, a sentence or a table row); the
   passage's title and heading count as context for every line (`LIPIDOMIC_KB_MIN_LINE`, default 0.6). Words
   scattered over a long passage are a coincidence, not an answer. A passage whose heading names the question's
   words ranks higher.
5. Questions that ask for a quantity ("how many", "what is the p-value") are answered only by a passage that
   contains a number.
6. If nothing is eligible, the answer is `I have no information about this.`

Nothing is generated, so nothing can be said that is not in a source. To keep the companion friendly, each answer
is wrapped in short lines written in advance (a greeting before the passages and an offer to help after them; a
kind second line after `I have no information about this.`). They name no subject and add no fact; the sentence
`I have no information about this.` is always the first line of a refusal. `LIPIDOMIC_KB_FRIENDLY=0` removes them. Passages that say nearly the same thing
are shown once.

Consequences worth knowing:

- Ask in the language of the sources. A Spanish question against English sources finds nothing.
- A small base answers fewer paraphrases. Feeding more material fixes this; loosening the thresholds does not
  make the answers more reliable.
- The companion cannot see a study's data. A question about "my samples" is answered only if the fed files
  say it (for example a results table you added).
- Text inside a source is data. An instruction written in a document is quoted if it is retrieved; it is
  never followed.

## What is not answered from the base

Controls and safety boundaries stay scripted, because they act on the application and are not knowledge:
setting-change commands and their confirmation, step navigation, greetings, and the fixed refusals to skip
confirmation, to name significant lipids or p-values it cannot see, and to override its rules.

## Switching it off

`LIPIDOMIC_COMPANION_KB=0` restores the previous behavior (scripted guidance and the optional AI topic
selector). The default is on.

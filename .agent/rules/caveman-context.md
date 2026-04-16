# Rule: Caveman Compression for AI Context Files

**Activation:** When writing or updating `ai-assistant.md`, skill `SKILL.md` files, Knowledge Item artifacts, or `docs/` files.

## Objective

Minimize token count in AI-consumed files while preserving complete semantic fidelity. Based on [Caveman Compression](https://github.com/wilpel/caveman-compression).

## Instructions

Apply these rules to all machine-consumed text:

1. **Strip articles**: Remove a, an, the when context provides specificity.
2. **Strip connectives**: Remove therefore, however, because, in order to. Express cause-effect through sequential sentences.
3. **Strip filler/intensifiers**: Remove very, essentially, quite, rather, really, somewhat.
4. **Active voice, present tense**: "Function calculates value" not "value is calculated by function."
5. **Sentence atomicity**: One fact per sentence. 2-5 words preferred.
6. **Preserve all facts**: Numbers, names, dates, constraints, technical terms, file paths, code references stay intact.
7. **Preserve structure**: Section headings, markdown formatting, bullet hierarchy unchanged.
8. **No information loss**: Every fact in original must exist in compressed version.

## Do NOT Compress

- Source code, config, SQL, JSON, YAML
- `README.md` (project root) — human-facing
- Commit messages, PR descriptions — human-facing
- User-facing UI strings
- Legal/license files
- Code comments and docstrings (unless purely AI-consumed)

## Verification

After compression, check:
- All facts preserved (names, numbers, paths, constraints)
- Logical flow has no gaps
- No telegraphic ambiguity ("Function error return null" → bad; "Function has error. Returns null." → good)

## Reference

Full spec: https://github.com/wilpel/caveman-compression/blob/main/SPEC.md

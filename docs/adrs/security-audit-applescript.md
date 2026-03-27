# Security Audit: AppleScript `do shell script` Calls

**Date**: 2026-03-04
**Version**: v0.9.7
**Status**: Complete
**Auditor**: SME review — automated audit

## Summary

1 `do shell script` call found across 2 files. All classified as safe. No remediation required.

## Call Sites

### scripts/complete_reminder.applescript

#### Call 1 — printf piped to tr for case-folding inside lowerTrim helper

**Location**: Line 81
**Classification**: Safe-quoted
**Command**:
```applescript
return do shell script "printf '%s' " & quoted form of str & " | tr '[:upper:]' '[:lower:]'"
```
**User-controlled inputs**: `str` — a trimmed copy of `taskTitle`, which originates from `item 1 of argv` (the reminder title passed in by the caller)
**Analysis**: The user-controlled value `str` is wrapped with `quoted form of` before concatenation into the shell command string, preventing shell injection regardless of what characters the reminder title contains. The remainder of the command (`printf '%s'` and the pipe to `tr`) is a fully hardcoded string literal.

---

### scripts/push_reminder.applescript

No `do shell script` calls are present in this file. The `lowerTrim` and `lower` helpers in `push_reminder.applescript` perform case-folding entirely within AppleScript using a character-by-character offset lookup against hardcoded uppercase/lowercase character strings. No shell is invoked.

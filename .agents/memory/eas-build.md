---
name: EAS Android build dependency failures
description: EAS Gradle builds can fail before app compilation when the remote worker cannot resolve broad sets of standard Maven artifacts.
---

When an EAS Android log reports many unrelated standard artifacts as “Could not find” and ends with a lost Gradle daemon message, treat it as remote dependency resolution/infrastructure failure rather than an application source error.

**Why:** A single missing app dependency usually names one package; a broad failure across grpc, guava, netty, protobuf, and similar libraries occurs before meaningful project compilation.

**How to apply:** Confirm local Expo export and typecheck, inspect the decoded EAS Gradle log, avoid unrelated code changes, and retry only after the remote service/cache has had time to recover.
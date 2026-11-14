+++
title = "Example lab: replace this page with your first lab"
date = '2026-11-13T09:00:00+01:00'
# draft = true keeps this page off the live site. See it locally with: hugo server -D
# A page becomes a lab when it has a lab number, and a video page when it has a youtube ID.
draft = true
description = "A placeholder that shows how a lab page is laid out. None of the content is real."

[params]
  lab = 1
  board = "Your board"
  core = "Your CPU core"
  level = "Beginner"
  duration = "1 h"
  topics = ["Topic one", "Topic two"]
  repo = "https://github.com/ismailalitech"
  # youtube = "VIDEO_ID"   # the part after v= in the video address
+++

## Goal

Say in two or three sentences what the reader will have working at the end, and
why it matters.

## What you need

| Item | Details |
|---|---|
| Board | Name and revision |
| Tools | Compiler, debugger, versions |
| Time | About one hour |

## Steps

### 1. First step

Explain what this step does and why, then show the command.

```sh
echo "a shell command goes here"
```

### 2. Second step

Show the code change. The **Copy** button appears on every code block.

```c
#include <stdint.h>

/* Placeholder code: replace with the real change. */
uint32_t add(uint32_t a, uint32_t b) {
    return a + b;
}
```

## Expected result

Show the output the reader should compare with their own.

```text
placeholder output
```

## Pitfalls

- A mistake that costs time, and how to spot it.
- Another one.

## References

- Title of a public document, with its link.

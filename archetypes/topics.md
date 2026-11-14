+++
title = '{{ replace .File.ContentBaseName "-" " " | title }}'
date = '{{ .Date }}'
draft = true
description = ""

[params]
  # Leave both empty for an article. Set lab to make the page a lab,
  # set youtube to show a video at the top. A page can have both.
  lab = 0          # lab number, shown as 0x01, 0x02, ...
  youtube = ""     # the part after v= in the video address
  board = ""       # labs: the exact board name
  core = ""        # labs: e.g. Cortex-M33
  level = ""       # Beginner, Intermediate or Advanced
  duration = ""    # e.g. 2 h
  repo = ""        # full URL of the source code
+++

## Goal

## What you need

## Steps

## Expected result

## Pitfalls

## References

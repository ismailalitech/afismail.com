+++
title = "{{ replace .File.ContentBaseName "-" " " | title }}"
description = "One sentence: what the project is."
date = {{ .Date }}
draft = true
# Lower numbers come first on the Work page; the first one is featured on the home page.
weight = 20

[params]
  # Three short lines, shown at the top of the page, on the Work page and on the home page.
  problem = ""
  role = ""
  result = ""
  # Say so while the work is not finished, for example: status = "In progress"
  # status = "In progress"
  # Hardware and tools, shown as a small table. Remove the lines you do not need.
  hardware = ""
  tools = ""
  # The picture: a real photo, an annotated capture or a diagram you are allowed to publish.
  # image = "images/file.jpg"
  # image_alt = "What the picture shows"
  # image_size = [1600, 1200]
  # figure_caption = "One sentence that says what the picture shows."
  toc = true
+++

## Problem

## Hardware and constraints

## My contribution

## Architecture

## Verification

## Results and limits

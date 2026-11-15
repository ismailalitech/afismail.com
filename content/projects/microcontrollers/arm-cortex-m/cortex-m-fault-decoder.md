+++
title = "Decoding Cortex-M fault registers in the browser"
description = "A browser tool that turns the fault status registers of a crashed Cortex-M into a plain explanation of what went wrong."
weight = 10
aliases = ["/work/cortex-m-fault-decoder/"]

[params]
  project = true
  # Three short lines, shown at the top of this page, on the Work page and on the home page.
  problem = "After a HardFault, the cause is in three status registers, and reading them means looking up bit positions in the Arm manual."
  role = "Designed and built it: the bit tables, the parser, the register drawing and the explanations."
  result = "Paste CFSR, HFSR or SFSR and get the set bits named and explained. It runs in the browser and sends nothing."
  # The picture for this case study. "register" draws the decoder's own output.
  # For a photo or diagram use: image = "images/file.jpg", image_alt = "...", image_size = [1600, 1200]
  figure = "register"
  figure_caption = "The decoder's output for CFSR = 0x00008200: bits 15 and 9 are set, a bus fault on a data access with a valid fault address."
  # A button to the working thing.
  action = "/resources/fault-decoder/"
  action_text = "Open the decoder"
  toc = true
+++

## Problem

When a Cortex-M crashes, it leaves the reason in its fault status registers: CFSR, HFSR
and, on cores with TrustZone, SFSR. Each is a 32-bit value. To read one you find the
register in the Arm manual, work out which bits are set, and look up what each means.
That is slow, and it is easy to misread a bit when a board has just crashed.

## Constraints

- No installation: it has to open on any machine next to the debugger.
- Nothing leaves the browser, because register values can come from unreleased products.
- It accepts values as a debugger prints them: with or without `0x`, with spaces or underscores.

## My contribution

- The bit tables for CFSR, HFSR and SFSR, with a plain explanation of each bit.
- The parser, which rejects anything that is not a 32-bit hexadecimal value and says why.
- The display: each value is drawn as two rows of sixteen bits, as a reference manual
  draws a register, with the set bits marked and named underneath.
- Two checks that catch common mistakes: a warning when a reserved bit is set, and a
  hint to add CFSR when HFSR shows `FORCED` alone.

## Verification

- The bit definitions follow the Arm architecture documentation for the fault status registers.
- An automated test decodes every single bit of the three registers, plus mixed and
  malformed values, and confirms that the output does not change from one version of
  the tool to the next.

## Result and limits

The decoder is published and free to use, with a one-click example. The same bits are
listed in the fault-register cheat sheet for use on paper.

It does not read the stacked frame or `EXC_RETURN`, it does not cover the auxiliary or
debug fault registers, and it does not replace stepping through the fault with a debugger.

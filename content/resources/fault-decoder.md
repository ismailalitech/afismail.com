+++
title = "Cortex-M fault decoder"
description = "Paste the fault status registers from a crashed Cortex-M and see what each bit means."
weight = 10

[params]
  # Loads the decoder above the text. The tool lives in layouts/_partials/tool-fault-decoder.html.
  tool = "fault-decoder"
  topics = ["Tool"]
+++

## How to use it

1. Stop in your fault handler, or read the registers from a crash log.
2. Copy the value of `CFSR`, and of `HFSR` and `SFSR` if you have them.
3. Paste them above and press **Decode**.

In GDB you can read a register with its address:

```text
(gdb) x/wx 0xE000ED28
```

## What the registers are

| Register | Address | What it reports |
|---|---|---|
| CFSR | `0xE000ED28` | MemManage, BusFault and UsageFault causes |
| HFSR | `0xE000ED2C` | Why a HardFault was taken |
| SFSR | `0xE000EDE4` | SecureFault causes, on Armv8-M with TrustZone |

The status bits stay set until software clears them, so a value can show more
than one fault if earlier ones were never cleared.

The [cheat sheet](/resources/cortex-m-fault-cheat-sheet/) lists every bit in one place.

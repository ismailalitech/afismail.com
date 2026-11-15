+++
title = "What a Secure storage write does to code that never touches storage"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "One write to Secure storage has three separate effects on Non-Secure code: slower instruction fetch, a frozen core and a long, variable duration. Each is measured on its own."
weight = 10

[params]
  lab = 10
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Intermediate"
+++

After this module you can name the three ways a TF-M storage write disturbs Non-Secure tasks, say which of them a given task suffers, and read the numbers that quantify each. The surprise of this part of the project is that a task which never calls a Secure service, and never touches storage, can still run twice as slow while somebody else writes.

## Before you start

- **Level 3.** Read [the response-time primer](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) first. The terms blocking, interference and release jitter are used as they are there.
- **Words.** ITS (internal trusted storage) and PS (protected storage) are the two TF-M services that write to flash. A "write" on this page is one `psa_its_set()` or `psa_ps_set()` of 512 bytes.
- **Tools:** nothing to run. The measurements were made on the STM32H573I-DK with a hardware timer; the method is described below so that it can be repeated on another port.

## The idea

A write costs the writer its own time. What is easy to miss is what it costs everybody else. On this port a single write has three effects, and they must be kept apart because they have different causes, different fixes and different victims.

| Symbol | Effect | Cause | Who pays |
|---|---|---|---|
| gamma | Non-Secure code running from flash is 2.0 to 2.5 times slower | the flash driver switches the instruction cache off before every program and erase, and back on after the invalidation | every Non-Secure job that runs from flash while the cache is off |
| delta | the whole core stops for 1.3 to 2.9 ms during a sector erase, and for tens of microseconds during each 16-byte program | the Secure driver polls the busy flag from the same flash bank it is erasing, so its own instruction fetch stalls the core | every task released while the core is stopped: it starts late |
| C_w | the write itself takes 4.3 to 8.7 ms for 512 bytes of ITS | depends on how much live data the storage holds (see [the next module](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s02-open-and-closed-window/)) | the writer, and whoever waits for it |

No exception is taken during the freeze, in either world, whatever the priority of the interrupt, the location of the vector table or the placement of the handler. Nothing in the kernel can see it from the inside.

## On this board

The STM32H573 runs its code from flash through an 8 KB instruction cache, and it has two flash banks. In the stock port the code runs from bank 1 and TF-M keeps its storage in bank 1 too. That last fact is what makes delta possible: the driver erases the very bank that the processor is fetching its instructions from.

The probes use a short fixed loop (branches, a multiply, and loads from a small table). It runs once from flash and once from SRAM, with its data table in RAM in both cases, so only the instruction fetch differs.

## How it is measured

Three experiments, each answering one question.

**exp9h: does the slowdown last for the whole write?** A low-priority task arms a one-shot timer of D microseconds and calls `psa_its_set()` with 512 bytes. A medium-priority task is released D microseconds into the write and runs 100 probes back to back, timing each. D is swept from 0 to 5 ms. If the instruction cache comes back on part-way through the write, the probes would speed up. They do not.

**exp9i: interrupt latency and slowdown, with hardware timers only.** The kernel timer cannot be used to measure a freeze, because its own handler is frozen with everything else. So a hardware timer (TIM4, counting at 1 MHz) fires every millisecond, and its handler reads the counter first thing:

```c
uint32_t cnt = TIM4->CNT;        /* us since the update event */
```

The counter restarted from zero at the update event, so the value read is the interrupt latency in microseconds, measured by the hardware itself. The handler releases a high-priority job that runs the flash probe and the SRAM probe (800 iterations each). A low-priority task runs a background activity in a loop: nothing (`NONE`), a 4 KB SHA-256 (`SHA4K`, a long Secure call that touches no flash), an ITS write (`ITS512`), a PS write (`PS512`), or an ITS write under `k_sched_lock()` (`ITS_LOCK`). Each case records 2,000 interrupts.

**exp9j: the same, with the interrupt path in SRAM.** The vector table and a direct handler are placed in SRAM, and the timer period is 4 ms so that stalls longer than 1 ms are not folded into the next period.

## What you should see

### gamma: instruction fetch

Probe slowdown while the low-priority task writes (exp9i, stock port, 2,000 jobs per case):

| Background activity | Flash probe, mean (max) | SRAM probe, mean |
|---|---|---|
| none | 1.00 (1.00) | 1.00 |
| SHA-256 of 4 KB | 1.00 (1.00) | 1.00 |
| ITS write, 512 B | 2.09 (2.15) | 1.00 |
| PS write, 512 B | 1.89 (2.15) | 1.00 |

The same code in SRAM is not slowed at all, and a long Secure call that does not write flash does not slow anything. In exp9h the ratio is 2.53, and 100 % of the probes are slow at every release point from 0 to 5 ms into a 6.65 ms write. That is the largest value observed, and the one the analysis uses as its prior. The factor belongs to the binary: the same source measured 2.26 and 2.01 in two builds that differed only in an unrelated edit.

![The same probe loop executed from flash and from SRAM while a lower-priority task writes ITS back to back: flash-resident code runs about 2.1 times slower for the whole write, SRAM code is not slowed.](/images/tfm/fig5_gamma_flash_sram.png)

*The probe from flash (blue) sits at about 2.1 for the whole write; the probe from SRAM (orange) stays at 1.0. The gap in each row of dots is the job lost to the erase freeze, one per write.*

### delta: the freeze

Hardware interrupt latency (exp9i, stock port, microseconds):

| Background activity | Median | 99th percentile | Maximum | Later than 50 µs (of 2,000) |
|---|---|---|---|---|
| none | 0 | 0 | 0 | 0 |
| SHA-256 of 4 KB | 0 | 0 | 2 | 0 |
| ITS write | 17 | 749 | 890 | 286 |
| PS write | 11 | 914 | 999 | 297 |

During ITS writes, 77 % of the 1 ms interrupts are later than 5 µs and 13 % are later than 600 µs. About one interrupt per write is lost outright: the freeze is longer than the gap to the next one (289 lost over 290 writes). The 1 ms period caps what this experiment can show: the maxima sit just under 1,000 µs. With the 4 ms period of exp9j the maxima are 2,547 µs (ITS) and 2,744 µs (PS), with about a third of the interrupts late (325 and 330 of 1,000), even though the vector table and the handler are in SRAM. Placing the handler in SRAM does not help, because the stall comes from the Secure driver's own instruction fetches, not from the handler.

### C_w: the write itself

In exp9i the ITS write takes 6.6 to 8.1 ms and the PS write 70 to 82 ms, longer than the isolated cost because the preempting jobs run at gamma. The isolated 512-byte ITS write takes 4.3 to 8.7 ms depending on the state of the storage, and about one write in 170 is 0.8 to 1.4 ms longer than the rest.

## When it goes wrong

| Symptom | Cause |
|---|---|
| You measure no slowdown | the probe runs from SRAM, or the cache is kept on by a patched driver ([the fix](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s03-fixing-the-freeze/)) |
| Latency never exceeds your timer period | the stall is longer than the period and folds into the next interrupt; use a longer period, as exp9j does |
| A small latency figure that does not match the symptoms | the timestamp was taken in a handler that was itself frozen. An early figure of 148 µs came from such a handler; the hardware counter shows hundreds of microseconds up to 2.7 ms |
| gamma differs from build to build | it is a property of the binary, so calibrate on the image you ship |

## Trade-offs and going further

- **Averages hide the freeze.** The median ITS interrupt latency is 17 µs, while 13 % of the interrupts wait more than 600 µs. A mean-based budget would miss the whole problem.
- **Moving the probe to SRAM removes gamma but not delta.** A job in SRAM does not slow down, yet it can still be released into a freeze if the interrupt or the scheduler it needs sits in flash.
- **Exercise:** a 200 µs job runs from flash while a write is in progress and the cache is off. What is its worst-case execution time with the prior gamma of 2.53? Which of the three effects does the answer leave out?
- **Exercise:** the `SHA4K` case runs a 1.5 ms Secure call that touches no flash, and its measured latency is at most 2 µs. Explain why it shows none of the three effects, and which part of the project ([blocking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/)) does describe its cost.

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **Status** | measured on one board, one port |
| **Read first** | [F02 Response-time analysis in one page](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) |
| **Evidence** | exp9h (probe trace during a write), exp9i (hardware interrupt latency and probe slowdown, 2,000 jobs per case), exp9j (the same with the interrupt path in SRAM, 4 ms period), all on the STM32H573I-DK with TF-M 2.3 |
| **Related** | [S02 Who can preempt the write](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s02-open-and-closed-window/); [S03 Removing the freeze and the slowdown](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s03-fixing-the-freeze/); [M01 Hardware timestamps](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m01-hardware-timestamps/) |

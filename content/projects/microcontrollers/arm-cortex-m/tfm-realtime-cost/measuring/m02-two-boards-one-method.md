+++
title = "Two boards, one method: how an experiment is built, run and filed"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "How every experiment is run and recorded the same way, how the Renesas board runs the same experiments without TF-M, and what may and may not be compared between the boards."
weight = 20

[params]
  lab = 2
  board = "STM32H573I-DK and FPB-RA4E1"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Intermediate"
+++

After this module you can describe how an experiment in this project is built, flashed, captured and filed so that a number can be traced to its run; say how the Renesas FPB-RA4E1 runs the same experiments without TF-M; and tell which results may be compared between the two boards and which may not. It is the page to read before quoting a figure from the second board.

## Before you start

- **Level 2.** [F01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/) gives the vocabulary (veneer, NSC, PSA call). [M01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m01-hardware-timestamps/) explains the timing sources.
- **Tools:** for a reproduction, the two boards, a SEGGER J-Link for the RA4E1 console, Zephyr 4.4 with `west`, and Python. The reading needs none.
- **Time:** an experiment runs from 17 seconds (exp6a) to a few minutes, plus the build.

## The idea

About forty experiments share one application and differ only in one source file each. The method is the same for all of them:

1. **One folder per experiment.** The experiment's source selects what the Non-Secure image does; the Secure side, the workload and the timing helpers are shared. The experiment is chosen at build time by its name.
2. **One command per run.** The run script builds the image, flashes the board, captures the console until the experiment prints `Done.`, and files the output under the experiment's name and a timestamp, with an optional tag such as `board2_final_stock` or `pi_off`.
3. **Every run describes itself.** Beside the console log, a `meta.json` records the experiment, tag, timestamp, status, duration, board, the extra build options, SHA-256 hashes of the experiment source and of the Secure partition source, and the Kconfig values that change results (preemptible Secure calls, isolation level, IPC or SFN, FPU, caches, tick rate, priority ceiling).
4. **Analysis reads the run, not the code.** The analysis script finds the board in `meta.json` and picks that board's constants, so the same script reads a run from either board.

Defaults every run starts from: preemptible Secure calls on and the priority ceiling set to -128. Anything else is written into the run's `extra_cmake_args`.

## On this board

Two boards are used. Their parameters live in one table that the analysis reads:

| Parameter | STM32H573I-DK | FPB-RA4E1 |
|---|---|---|
| CPU clock | 240 MHz | 100 MHz |
| SysTick wrap | 69.9 ms | 167.8 ms |
| Task-set period scale | 1.0 | 2.4 |
| One workload operation | about 58.8 microseconds | about 141 microseconds |
| gamma prior (flash slowdown) | 2.53, measured | 2.53, placeholder until measured |
| delta prior (core freeze) | 2.7 ms, measured | 2.7 ms, placeholder until measured |
| Secure interrupt entry and exit | 2 microseconds | 2 microseconds, placeholder |

The RA4E1 priors are the H5 values copied in so the analysis runs; they are not measurements of that chip.

### The RA4E1 port: bare TrustZone-M

No TF-M port exists for any Renesas RA part, and Zephyr has no Non-Secure variant for them, so the Secure side is written for the project: a Zephyr Secure image that sets up security attribution, owns the Secure timer and the flash controller, and exports a small set of functions through SG veneers. The Non-Secure image links the veneer import library that the Secure build produces and never includes TF-M. The memory split is in [F01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/).

To keep one set of experiments for both boards, the Non-Secure image has a **shim** that gives the experiments the TF-M calls they expect and maps them to veneers. It reproduces the structure that matters for scheduling: one mutex around every Secure activity and the same priority and FPU handling as the TF-M integration in Zephyr.

| TF-M call in the experiment | What the shim does on the RA4E1 |
|---|---|
| `psa_connect`, `psa_close` | one empty veneer call each, under the mutex |
| workload run and repeat | one veneer call that runs the operations (the time includes two SG transitions) |
| ITS and PS write | a data-flash write |
| crypto, attestation, storage reads | not supported; the experiment prints that once |

Timers move too: GPT1 at 100 MHz replaces TIM4 for hardware releases, AGT0 replaces TIM6, and the Secure timer is GPT2 (replacing TIM7). The console is SEGGER RTT through the on-board J-Link by default; the serial console used on the H5 is an option.

### What runs on the RA4E1

| Status | Experiments | Note |
|---|---|---|
| Ported 1:1 | exp5, 6a, 6b, 6d, 7a, 7b, 7c, 8a, 8b, 9a, 9g, 9k, 9m, 9n, 9o, 9t, 9y (bare cases) | periods scaled by 2.4, operation counts unchanged |
| Substituted | exp9h, 9i, 9l, 9p | ITS and PS become data-flash writes; crypto becomes a Secure operation or a calibrated spin |
| Impossible without TF-M | exp9q, 9aa, 9ac, 9ad, 9af, 9ag, 9s, 9v, 9w, 9z, 9ai, 9aj, 9ak | firmware update, attestation, SPM behaviour, storage state, the CMSIS-NN partition |
| Not ported | exp6c, 9b, 9c, 9d, 9f, 9j, 9r, 9u, 9x, 9ab | not in scope so far |

The build refuses an experiment that needs TF-M, with a message that says so, instead of producing numbers that mean something else.

## How it is measured

The method is the run itself: build, flash, capture, file. For the RA4E1 the run script first builds the Secure image, merges its hex with the Non-Secure hex and flashes the result through J-Link; the Secure build root and the console (RTT or UART) are options. The run's `meta.json` then also records the console and the Secure build.

Each experiment prints its own configuration at the top of its log, so the log is readable without the metadata. Typical headers are the iteration and warm-up counts, whether Secure calls are preemptible and the priority ceiling.

Before a risky change on the STM32H5 the option bytes are read and saved, because a wrong TrustZone configuration can lock out the debug port. The snapshots are kept with the results.

## What you should see

A run folder holds the console log, `meta.json` and, depending on the experiment, a raw sample file, a per-job file or a summary table. Re-running an experiment creates a new timestamped folder; a run is never edited afterwards. The call-cost experiment exp9c was repeated on a second and a third board unit and after each re-provisioning to the stock build, with identical results to the sample; the board unit is part of each run's tag.

What is **compared** across the boards, because it follows from mechanism and not from clock speed:

- the shape of the blocking term: the longest single Secure call of a lower-priority task, and the effect of cutting that call into pieces;
- the cost of a preemption that crosses the boundary, relative to the operation;
- the effect of the compiler on the Secure CMSIS-NN code. Without compiler builtins and with TF-M's `memcpy`, the network ran 2.9, 4.0 and 5.6 times slower on the RA4E1 for 4, 8 and 16 filters, against 2.8, 3.8 and 5.4 times on the STM32H5 ([AI01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai01-toolchain-not-trustzone/)).

What is **not compared**:

- absolute microseconds: the clocks, flash and operation times differ (141 against 58.8 microseconds for the same operation);
- anything that needs TF-M: the PSA mutex path, TF-M services, storage state, attestation, partition faults and updates;
- flash effects. On the RA4E1 code-flash programming runs from RAM and makes the single bank unreadable, so a core stall is expected, but there is no instruction-cache-off effect; the chip has no instruction cache, only a flash cache with one wait state at 100 MHz. The H5 results for gamma and delta do not transfer.

At the time of writing, the only complete cross-board result from the RA4E1 in this project is the toolchain one above. No run of the timing experiments on the RA4E1 is part of the results on these pages.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| The run times out with no `Done.` | the board did not start the image; check the option bytes (STM32H5) or the IDAU boundary (RA4E1) |
| The RA4E1 console is empty | the console is RTT, not the UART; the RTT control block address is read from the Non-Secure ELF |
| The configuration step stops with "needs TF-M services" | the experiment is in the impossible list for the RA4E1 |
| Periods look wrong on the RA4E1 | the 2.4 scale is built in; a `period_scale` of 1.0 was used by mistake in the analysis |
| A bound from the RA4E1 looks too good | the gamma and delta priors are the H5's, not measured |

## Trade-offs and going further

- **A shim hides differences as well as removing them.** The RA4E1 mutex is a Zephyr mutex around a veneer, not the SPM. The RA results show the scheduling shape, not the cost of the framework ([C02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/) measures that on the H5).
- **Scaling periods keeps the task set's utilisation, not its time constants.** A 2.4 times slower operation with 2.4 times longer periods has the same utilisation, but interrupt, cache and flash times do not scale with it.
- **Exercise:** a task set on the H5 has periods 2000, 5000 and 23100 microseconds. Write the RA4E1 periods and check them against the table of moved constants (4800, 12000, 55440).
- **Exercise:** list, for exp9a and exp9q, whether each can run on the RA4E1 and why.

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **How to run** | One run script and the two boards; the RA4E1 needs a J-Link and the Secure image built first |
| **Status** | method used for every run; RA4E1 port built and smoke-tested, timing campaign not part of these results |
| **Read first** | [F01 Two worlds on one core](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/); [M01 Why the kernel clock is not trusted](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m01-hardware-timestamps/) |
| **Related** | [C02 What TF-M costs over bare TrustZone-M](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c02-tfm-over-bare-trustzone/); [S01 What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/); [AI01 The toolchain, not TrustZone](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai01-toolchain-not-trustzone/) |
| **Evidence** | the metadata of every run (board, build options, hashes); exp9c repeated on two boards and after each re-provisioning; the Secure smoke tests of the RA4E1 (monitor registers, veneer round trip, flash write, timer); the CMSIS-NN benchmark on both boards |

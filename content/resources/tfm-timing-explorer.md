+++
title = "TrustZone and TF-M timing explorer"
description = "Watch a Secure call delay other tasks, compare what two Cortex-M33 boards measured, and read the costs through confidentiality, integrity, isolation and availability."
weight = 55

[params]
  topics = ["Tool"]
  toc = true
+++

An interactive companion to the project [What a Secure world costs a real-time system](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/). It runs in the browser and sends nothing.

**[Open the explorer](/tfm/explorer/)**

## What it shows

- **Watch it happen.** Three tasks share one core and the low task calls a Secure service. Choose the service (38 µs to 0.3 s), split the call into pieces, switch priority inheritance off, and the schedule plays out with the waits, the priority inversion and the missed deadlines.
- **Compare.** Nine side-by-side comparisons of measured values: a bare TrustZone-M call against a TF-M call, one long call against many short ones, flash code against SRAM code during a storage write, and more. Each links to the lab behind it.
- **Security lens.** Confidentiality, integrity, isolation and availability, each with what it costs in timing, how to keep that affordable, and where to read next.
- **Find what you need.** Start from what you are trying to do and get the pages that answer it.

## What it is, and what it is not

The comparisons and the lens use the project's measured numbers and name the experiment behind each. The schedule is a simulation of the mechanism: a task set shaped like the one in experiment exp9g, with simplified execution times and 30 µs for each extra call (the per-call overhead measured in exp9p). It is not a replay of a recorded run, and the pieces it splits a call into are equal slices, where the neural-network labs split by convolution rows. The limits of the measurements themselves are on [the limits page](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x02-limits-and-open-questions/).

## Related

- [The validation report](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x01-validation-report/): every result, with its experiment and board.
- [Response-time analysis in ten minutes](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/): the terms the simulator illustrates.

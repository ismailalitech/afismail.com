+++
title = "What a Secure world costs a real-time system"
description = "Measuring how TrustZone-M and TF-M calls delay Non-Secure real-time tasks on two Cortex-M33 boards, and turning the measurements into bounds a schedulability analysis can use."
date = '2026-11-15T22:00:00+01:00'
draft = false
weight = 20

[params]
  project = true
  platform = "Arm Cortex-M33 with TrustZone-M"
  status = "Measured, write-up in progress"
  problem = "A call into the Secure world keeps the processor busy and can delay a more urgent Non-Secure task, but a schedulability analysis has no number to use for it. Benchmarks give the cost of one call, not what it does to a running task set."
  role = "Designed and built the whole study: the experiment framework, the Secure test partition, the bare TrustZone-M port to a second board, the measurements and the analysis that turns them into bounds."
  result = "Each source of delay measured on real hardware and expressed as a term of a response-time analysis. The bounds held on all 288 observed worst cases of 96 random task sets, and a Secure AI service that blocked a 2 ms task for 8.4 ms was brought down to 200 microseconds."
  hardware = "STM32H573I-DK (Cortex-M33 at 240 MHz, Zephyr with TF-M) and Renesas FPB-RA4E1 (Cortex-M33, Zephyr with a bare TrustZone-M Secure image)"
  tools = "Zephyr 4.4, TF-M 2.3, CMSIS-NN, west, on-chip hardware timers, Python"
  toc = true
+++

## Problem

On a Cortex-M33 with TrustZone, security-sensitive code runs in a Secure world that the application calls into. For a real-time system this is a scheduling problem as well as a security one. While a call is running, a more urgent Non-Secure task may be ready and still not run. A write to Secure storage slows code that never touches storage. A long service such as a signature check or a neural-network layer adds to the delay.

Response-time analysis can include such delays, but only if each one has a bound that comes from measurement and not from a guess. This project measures each delay on real boards, shows what causes it, and writes it as a term the analysis can use.

![A low-priority task makes a long call into the Secure world. A high-priority task released during the call waits until it returns.](/images/tfm/blocking-timeline.svg)

*The delay under study: a high-priority task released during a long Secure call has to wait for it.*

## Hardware and constraints

| Board | Role | Secure side |
|---|---|---|
| STM32H573I-DK | reference platform | TF-M, with a Secure partition of my own that offers services of chosen length and kind |
| Renesas FPB-RA4E1 | second platform | a bare TrustZone-M image with plain entry points; there is no TF-M port for this chip |

Constraints that shaped the study:

- Timing is taken with on-chip hardware timers. A software clock that the code under test can itself disturb is not trusted: an early release-latency figure was wrong by more than ten times because the interrupt that took the timestamp was itself frozen by a flash erase.
- The security configuration of the STM32H5 can lock out the debug port, so the board state is recorded before every risky change.
- The two boards differ in flash, cache and clocks, so they are compared on mechanisms, not on raw microseconds.

## My contribution

- **Experiment framework.** One folder per experiment, and one command that builds, flashes, captures the console and files the run with its configuration and the hashes of the images.
- **Secure test partition.** Services whose length and kind can be set, so a call of a chosen duration can be made on demand, including a neural-network inference.
- **The second board.** The Secure image, the memory split between the worlds and a console over SEGGER RTT, which also separates the cost of TF-M from the cost of TrustZone.
- **Analysis.** Scripts that turn each run into per-job data and statistics, a response-time model, and a comparison of the model's bounds with what the boards produced.
- **About forty experiments** on the sources of delay, grouped in the parts below.

The parts of the project, each with its notes and numbered labs, are listed at the top of this page, in the order a reader would work through them.

## Architecture

The Non-Secure application is an ordinary Zephyr program with a set of periodic tasks. It calls Secure services through PSA calls on the TF-M board, and through direct entry points on the bare TrustZone-M board. Every experiment is a variation on one pattern: a task set with known timing, one source of Secure-side delay switched on, and hardware timestamps on the releases and completions of every job.

## Verification

- Every run is kept with its raw data and the configuration it was made with, so a number can be traced back to the run that produced it.
- Runs are repeated and compared across boards and board units, to separate the effect being studied from the noise of one device.
- Randomly generated task sets are run on the hardware and compared with the bounds the analysis predicts. On 96 sets (94,716 jobs), the bounds covered all 288 observed worst cases, with the median at 0.98 of the bound. Leaving out the per-preemption term leaves some bounds exceeded, so the small terms matter.

## Results and limits

All figures are from the STM32H573I-DK unless a line says otherwise.

| Question | Measured |
|---|---|
| Does running the same code in the Secure state make it slower? | Less than 0.5 % change in execution time |
| What does a Secure call cost? | An empty TF-M transaction takes about 36 to 39 µs depending on the build (36.2 µs in the reference build), plus 10.42 ns per payload byte. A bare TrustZone-M call through a veneer takes about 0.1 µs |
| How much later does a high-priority task start when it is released during a lower-priority task's TF-M call? | 1.06 to 1.21 µs later than in a Non-Secure baseline |
| How long can a Secure call block other tasks? | The longest single call of a lower-priority task: 38 µs (random number), about 1.25 ms (SHA-256 of 4 KB), 5 to 6 ms (protected-storage write), up to 0.3 s (software ECDSA verify) |
| What does a write to Secure storage do to code that never touches storage? | Code running from flash is 2.0 to 2.5 times slower for the whole write. Each sector erase stops the core for 1.3 to 2.9 ms without any exception. The 512-byte write takes 4.3 to 8.7 ms depending on the state of the storage |
| Can a long service be made harmless? | Splitting a 4 KB SHA-256 into 16 calls shortens the longest call 11 times for 42 % more total time |
| Secure AI inference | Called in one piece it blocks for 8.4 ms and a 2 ms task misses 39 % of its deadlines; in chunks of 8 or 4 rows every miss disappears and the blocking falls to 200 µs for 2.5 % more Secure time |

Limits, stated plainly:

- The results come from two specific boards at fixed clock settings. They show how to measure and bound the delay, not a universal figure for every Cortex-M33 device.
- The TF-M figures are for one port and one isolation level. Another port, with another flash driver or crypto backend, will give different numbers; the method carries over.
- The FPB-RA4E1 has no TF-M port, so the comparison between the boards is about mechanisms and the toolchain, not a like-for-like TF-M benchmark.
- The code and the raw data are not public. Each number on these pages names the experiment and the conditions that produced it, and the method is described in enough detail to be repeated on another board.
- The write-up is in progress, and figures may be refined before it is published.

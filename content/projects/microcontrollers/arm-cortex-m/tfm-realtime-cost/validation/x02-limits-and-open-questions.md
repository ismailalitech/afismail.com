+++
title = "Limits and open questions"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "What the project did not do, what it measured only once, and where its own sources disagree."
weight = 20

[params]
+++

A set of results is easier to trust when it says where it stops. This page lists what the project did not do, what it measured only on one board or one build, and the places where two of its own sources gave different figures. Each item says which figure the modules use and why.

## Before you start

- Read [the validation report](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x01-validation-report/) first. This page assumes its tables.

## The idea

Three kinds of limit are worth separating:

1. **Scope.** What was never tried.
2. **Reach.** What was tried on one board, one build or one port, and may differ elsewhere.
3. **Disagreement.** Two figures for the same thing, from different runs or different write-ups, which the project has not yet reconciled.

## What the project did not do

- **Other chips.** Two Cortex-M33 boards at fixed clock settings. The results show how to measure and bound the delay, not a figure for every device.
- **Other TF-M ports.** One port and one isolation level. Another flash driver or crypto backend gives different numbers; the method carries over.
- **Attestation.** The Initial Attestation service (exp9s) was not measured because it cannot be built in this setup. The module on the service catalogue gives an estimate from its parts, labelled as an estimate.
- **Timing runs on the second board.** The FPB-RA4E1 has no TF-M port. The only complete cross-board result is the toolchain effect on a neural network (2.9, 4.0 and 5.6 times on the RA4E1, against 2.8, 3.8 and 5.4 times on the STM32H5). The RA4E1 port supports the other experiments, but no recorded timing runs of them are part of the results here.
- **Hostile clients.** Enforcement against a client that lies about who it is depends on the client identity coming from TF-M's non-secure client ID support, which Zephyr does not enable by default. The project wired it through the thread switch hook; it did not attack it.

## Where the sources disagree

| Item | The two figures | Used in the modules |
|---|---|---|
| An empty TF-M transaction | 36.2 µs in the reference build; 37.1 µs on a rerun (exp6a), 37.45 µs (exp9y), 39.4 µs (exp9c) | All of them, and the module says the figure depends on the build, because each phase carries its own clock reads |
| An empty veneer call | 24 cycles (0.10 µs) in the first measurement; 28 cycles (0.117 µs) in exp9y | Both, with the note that the difference has not been traced |
| Start latency when released into a Secure call | 1.06 to 1.21 µs (TF-M, first measurement); 0.84 µs for TF-M and 0.16 µs for bare (exp9y) | Each within its own build; only same-build comparisons are made |
| Time lost by the kernel to a 300 ms Secure handler | 272 ms without a short timeout; 297 ms with a 1 ms thread | Both, kept apart |
| Storage write time for 512 bytes | 4.3 to 8.7 ms in the write-up; 4.3 to 9.4 ms in the experiment's own comment | The write-up's range |
| Write duration after the mitigation | 35 % shorter in the write-up; 38 % in the two stored runs | "More than a third", with both runs shown |
| The per-job kernel overhead ε | 10 µs and 15 µs in different places of the same model | 10 µs |
| Integrity task (exp9ag) | The write-up says all bounds hold; one case, a 16 KB check at a 10 ms period, exceeds its bound | Nine of ten cases hold at 0.94 to 0.997; the exception is named |
| Dropping the per-preemption term | Described as breaking the bound; in the data it leaves 4 bounds exceeded at 15 µs and 43 at 10 µs | Both counts |
| Open-window behaviour of a storage write | The write-up describes starvation of lower tasks; the stored runs without a TF-M user above the writer look like the closed window | The module marks which open-window numbers are from the write-up and not from stored runs |

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| You quote a figure from one module and a different one from another | It is on this page: the two builds or runs gave different values; quote the one that names your build |
| A result looks too clean | Check the *Kind* column in the report: a *Bound* is the analysis, not a measurement |

## Trade-offs and going further

- **Reconciling is work, not a footnote.** Each row of the disagreement table is a run that could be repeated on one build with the other settings fixed. The project lists them instead of hiding them.
- **Exercise:** choose one row and write the experiment that would settle it, naming the one variable you would change.
- **Exercise:** the open-window row is the most important one for a reader with a storage writer at the lowest priority. Decide what you would measure first on your own board.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | open: the disagreements above are not settled |
| **Read first** | [The validation report](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x01-validation-report/) |
| **Related** | [Flash writes: open and closed window](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s02-open-and-closed-window/); [Anatomy of a call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/); [Update downtime](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a03-update-downtime/) |

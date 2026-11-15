+++
title = "Random task sets: does the bound hold on sets nobody designed?"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "96 random three-task sets, 94,716 jobs on the board, and a bound that held on all 288 observed worst cases once two small terms were charged correctly."
weight = 40

[params]
  lab = 9
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can write the response-time bound used throughout this project, generate random task sets the way the study did, say what the two small parameters ε and c_p stand for and why dropping either one breaks the bound, and read the scatter of observed worst case over bound. The headline: on 96 random sets with 288 task bounds and 94,716 jobs, no deadline was missed, and with the right parameters every bound held, the largest at 0.999 and the median at 0.982.

## Before you start

- **Level 4.** You should have read [One mutex, one blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) and [Response-time analysis in one page](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/). The preemption cost c_p is measured in [Cache-related preemption delay](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s04-cache-related-preemption-delay/).
- **Tools:** the STM32H573I-DK with the TF-M build and a Python installation for the generator and the analysis. A reader without the board can still follow the generator and the arithmetic.
- **Time:** each set runs for 2 s on the board, after a short calibration of its tasks.

## The idea

Every bound in the earlier modules was checked on a set that the author designed. A bound that holds on the example it was tuned on is weak evidence. The test that matters is sets nobody chose, whose tasks have unknown mixes of Secure and Non-Secure work, and a statement of how often the bound fails and by how much.

The bound is the usual recurrence with the project's terms, solved by iteration:

```
R_i = C_i + B_i + ε + Σ over higher-priority j of ⌈ R_i / T_j ⌉ × ( C_j + ε + c_p )
```

- **C_i** is the task's execution time, measured alone on the board (the maximum).
- **B_i** is the blocking of [the mutex](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/): the longest single Secure call of a lower-priority task, charged when task i or a task above it uses TF-M.
- **ε** is the kernel's cost per job (the timer interrupt, the message and the context switch).
- **c_p** is the cost charged to every preemption by a higher-priority job: the lines of the preempted task that the preemptor evicts from the instruction cache and that must be fetched again.

A set is "validated" when the observed maximum response of each task divided by its bound, the **ratio**, stays at or below 1.

## On this board

### How the sets are drawn

The generator makes three rate-monotonic tasks per set.

- **Periods:** three different values drawn from the menu 2, 3, 4, 5, 7, 10, 15, 20, 23.1 and 30 ms. The set is sorted so that the shortest period has the highest priority.
- **Utilisation:** a total drawn uniformly between 0.35 and 0.75, split between the three tasks by UUniFast, the standard algorithm for unbiased splits.
- **Work:** each task is a number of operations of 58.8 µs. With probability 0.6 the task uses TF-M, and a random 20 to 100 % of its operations then run inside one `psa_call()`. The other tasks are pure Non-Secure. At least one task per set uses TF-M.
- **Only schedulable sets are kept.** The generator computes the bound with ε = 10 µs and discards the set unless every task's bound is within its period, so every job has a bound to be checked against.

Four seeds of 24 sets give 96 sets and 288 task bounds; 172 of the 288 tasks use TF-M. Two seeds release every task together; two give each task a random initial offset between 0 and its period. The distinction matters: a synchronous release is the critical instant for interference, but it never lets a lower task be inside its call at a release unless the phases of non-harmonic periods have drifted. The offsets test blocking from a different alignment.

## How it is measured

1. The generator writes the sets into a header file that the experiment includes (exp9ab).
2. For each set, the board first times every task's Non-Secure and Secure parts alone. The maxima become C and S in the bound; nothing is taken from the generator's model.
3. The board then runs the set for 2 s, hardware-timed: releases come from compare channels of a hardware timer, so a late release is visible. It reports the maximum response of each task and the number of misses and dropped releases.
4. The analysis computes the bound for four pairs of (ε, c_p) and divides.

## What you should see

On the board, no deadline was missed and no release was dropped over 94,716 jobs. The ratios depend on what the bound charges.

| ε | c_p | Median ratio | Largest | Bounds exceeded (of 288) | Exceeded by more than 1 % |
|---|---|---|---|---|---|
| 10 µs | 0 | 0.996 | 1.196 | 43 | 8 |
| 10 µs | 6 µs | 0.992 | 1.067 | 22 | 7 |
| 15 µs | 0 | 0.986 | 1.001 | 4 | 0 |
| 15 µs | 6 µs | 0.982 | 0.999 | **0** | 0 |

![Observed worst case over bound for the 288 task bounds, against the bound. Top row: synchronous release; bottom row: random offsets. Left: epsilon 10 µs and no preemption term; right: epsilon 15 µs and 6 µs per preemption. Open markers have no blocking term, filled markers do.](/images/tfm/fig14_random_sets.png)

*Left, with the values used for the hand-built set, 26 bounds are exceeded under a synchronous release and 17 with offsets. Right, with ε = 15 µs and c_p = 6 µs, none.*

### What the exceeded bounds were

With ε = 10 µs and no preemption term, 43 bounds are exceeded, and 35 of them by less than 1 %. They fall in two patterns.

- **A top-priority task with a tiny job** (59 to 352 µs, one operation) runs 4 to 5 µs over its bound in every set. Its job is a release, one operation and a return, and the kernel path alone measures 13 to 15 µs on this build. So ε = 10 µs, the mean, is optimistic by exactly the excess. ε has to be the measured kernel path, not its mean.
- **A bottom-priority task with a long job** runs 7 to 35 µs over after three to six preemptions: a few microseconds per preemption. This is the cache cost of a preemption, which a per-job overhead does not carry. With c_p = 6 µs charged to every preempting job, it is covered.

With ε = 15 µs alone, four bounds remain exceeded, by 0.5 to 4.6 µs, all of them bottom-priority tasks after several preemptions. With c_p = 6 µs added, none.

### One large miss: a fixed-point cliff

The largest ratio, 1.196, is not a modelling error. One task had an observed worst case of 5977 µs against a bound of 4999 µs. The recurrence converged to 4998.8 µs, which is 1.2 µs below the 5 ms period of the task above it, so it counted one job of that task. The real job ran 5 µs longer, crossed the period and took a second job of the higher task, adding 975 µs. With ε = 15 µs the recurrence itself crosses the period and gives 5983 µs, a ratio of 0.999. Cliffs like this are inherent to response-time analysis, and are the reason a conservative ε matters more than its average value.

### Is the bound tight, and is blocking reached?

- **Tightness.** The median is 0.982. Tasks with no blocking term sit at 0.98 to 0.99 in every seed. The runs with random offsets have lower medians overall (0.96 and 0.93 against 0.99), because without a synchronous release the worst alignment of interference is no longer guaranteed within 2 s.
- **Blocking is reached.** Of the 89 bounds that carry a blocking term, 30 are above 0.9, and the tightest are 0.998 (synchronous) and 0.993 (offsets). An early reading, that a synchronous release never exercises the blocking, was wrong: with non-harmonic periods the phases drift through the critical alignment within a few hundred jobs.
- **The median for those 89 is 0.73 to 0.91 by seed.** That is the pessimism of charging the longest call to every job when only a few jobs meet it, which is what a worst-case term does.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| Bounds exceeded by 4 to 5 µs on the top task | ε is too small: use the measured kernel path, not its mean |
| Bounds exceeded by tens of microseconds on the bottom task | the preemption cost is missing: add c_p to every preempting job |
| One bound exceeded by a whole interfering job | a fixed-point cliff: the recurrence converged just below a period |
| Few blocking cases in a campaign | a synchronous release with harmonic periods never aligns a lower task inside its call; use offsets or non-harmonic periods |

## Trade-offs and going further

- **Every set is schedulable by construction.** The generator keeps only sets the model accepts at ε = 10 µs, so the test says nothing about sets near the edge of schedulability, where a small modelling error flips the verdict.
- **There is no flash write in these sets.** The terms for storage writes are validated on the periodic set in the [flash and cache](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/) section, not here.
- **Exercise:** a task has C = 300 µs, ε = 15 µs and c_p = 6 µs, and is preempted at most once by a task with C = 200 µs and period 4 ms. Compute the bound with and without c_p. How large is the difference as a share of the task's C?
- **Exercise:** the generator discards sets whose bound exceeds a period at ε = 10 µs. What bias would you expect if it used ε = 15 µs instead, and what would it do to the table above?

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Board** | STM32H573I-DK, Zephyr with TF-M v2.3.0 |
| **Status** | validated on hardware; 96 sets, 288 bounds, 94,716 jobs, no misses, no dropped releases |
| **Read first** | [One mutex, one blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) |
| **Evidence** | exp9ab, four seeds (two synchronous, two with random release offsets), each analysed at four (ε, c_p) pairs |
| **Related** | [Cache-related preemption delay](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s04-cache-related-preemption-delay/) · [Validation report](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x01-validation-report/) · [Chunking and batching](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/) |

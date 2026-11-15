+++
title = "The terms of the analysis: bounds that hold on the hardware"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "The response-time bounds for the three tasks around a chunked Secure inference, where each term comes from, and how closely the measurements stay under them."
weight = 40

[params]
  lab = 21
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can write the response-time bound of each of the three tasks around a chunked Secure inference, say where every term comes from and what it was measured as, check a bound against a run, and use the same terms to decide a chunk size or a cap before building anything. It closes the Secure AI part: the earlier modules found the effects, this one turns them into numbers that an analysis can carry.

## Before you start

- **Level: Advanced.** Read [Response-time analysis in brief](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/), [One call or many](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai02-granularity-decides-misses/) and [The floor and the cap](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai03-floor-and-cap/). The cache-related term is explained in [Cache-related preemption delay](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s04-cache-related-preemption-delay/).
- **Words used here.** `C` is the execution cost of a task body, `T` its period, `ε` the per-job kernel overhead, `B` the blocking term. A *ratio* in the tables is the observed maximum response over the bound: above 1 the bound is violated. A bound is *sufficient* if no observation exceeds it, and *tight* if some observation comes close.

## The idea

The base bounds for the three tasks (TH highest, TM middle, TL lowest and holding the inference) are:

```text
R_TH = C_TH + B + ε
R_TM = C_TM + B + ε + ceil(R_TM / T_TH) × (C_TH + ε)
R_TL = C_TL + sum over TH, TM of ceil(R_TL / T_j) × (C_j + ε)     (no blocking: TL is lowest)
```

`B` is the longest single call of TL, as in the first module of this part. The data required two more terms.

1. **The hand-off.** When TH's transaction finds the mutex held by a chunk, its blocking exceeds `B_meas` by up to 10.5 µs. It contains the pend, the priority inheritance, TL's resumption, the unlock and the hand-back to TH, plus the cache-related delay of the chunk after TH's own code displaced its lines. These are the same kernel paths that `ε` already counts once, so the bound charges a second `ε`.
2. **The preemption of TL.** TL is preempted 14 to 17 times per job by TH and TM. Each preemption costs a cache refill and, when it lands inside a Secure call, a Secure-state exception entry and return. It is charged as `t_pre` = 8 µs.

The bounds become:

```text
R_TH = C_TH + B + 2ε
R_TM = C_TM + B + 2ε + ceil(R_TM / T_TH) × (C_TH + ε)
R_TL = C_TL + sum over TH, TM of ceil(R_TL / T_j) × (C_j + ε + t_pre)
```

with `C_TL` from the call count, `C_TL(k) ≈ C_TL(1) + (k - 1) × c_call`, and under a cap with the loaded call count. TM pays the hand-off once, since it is blocked at most once per job.

## On this board

All the terms and their measured values:

| Term | Enters | Value |
|---|---|---|
| Empty TF-M transaction, per byte, per vector | call model | 36.2 µs, 10.42 ns per byte, 2.42 µs |
| Call path per chunk call | `C_TL`, `B` | 26.3 µs (call path 25.2 to 26.2) |
| Engine setup per chunk | `C_TL`, `B` | 2.9 to 3.7 µs |
| Input command (1 KB) | `C_TL` | 74.1 µs |
| `B` for client chunking | `R_TH`, `R_TM` | longest call in Secure cycles plus path |
| `B` under a cap | `R_TH`, `R_TM` | `max(cap, one row)` plus path |
| `ε`, per job | all | 9.7 to 11.0 µs |
| Hand-off, per blocked transaction | `R_TH`, `R_TM` | a second `ε` (measured up to 10.5 µs) |
| Per preemption | `R_TL` | 8 µs (5.7 to 8.5 measured) |

The task costs `C` are the maxima of the calibration phase. The blocking term is measured as the longest single `psa_call()` of TL on the Non-Secure side. The hand-off values measured in the `exp9ak` cases were 10.5, 10.1, 8.8, 7.5, 6.4, 5.4 and 2.4 µs, in no relation to `B`. The per-preemption values over the eight ROWSP and CAP cases were 5.7 to 8.5 µs, the CAP cases after the loaded-call correction.

## How it is measured

Every bound uses the calibration maxima of the task bodies, the `ε` of the run, `B_meas` from calibration and the terms above. The ratio of the observed maximum to the bound is reported for each task and case in experiments `exp9aj` (run `20261105_201309`) and `exp9ak` (run `20261105_215610`).

`ε` is the maximum TH response in the base case (16 Non-Secure operations, no inference) minus the maximum of that case's own 50 calibration samples of TH. It is a difference of two extremes, and it repeated less well than the rest. Most calibration sets contain one outlier about 5.4 to 6.0 µs above the rest, probably a rare Non-Secure interrupt during calibration. In the repeat run the base case's 50 samples missed it while its schedule maximum did not change (472.60 against 472.66 µs), and `ε` came out at 15.27 µs against 9.65 µs in the main run. With the calibration maximum that most cases show (462.69 µs) it is 9.91 µs, and the maximum ratios of the repeat run are the same as in the main run. Taking the calibration maximum over the whole run instead gives 7.8 to 10.1 µs across the six runs, and at 7.95 µs two TH ratios of the repeat run reach 1.001 to 1.002 and TL ratios up to 1.006. **A bound used for admission should take `ε` from the largest estimate available, or carry a margin of that size.**

## What you should see

The bounds of TH and TM hold in all 44 task and case pairs (the 22 Secure cases of `exp9aj` and `exp9ak`, two tasks each). The maximum ratio is 0.999 (`exp9ak`, WHOLE at `F` = 8) and 0.995 in `exp9aj`.

For TL, with the 8 µs per preemption, the recurrence is reached exactly in two cases and bounds the others within 0.4 percent:

| Case | Observed (µs) | Bound (µs) | Ratio |
|---|---|---|---|
| ROWSP, `R` = 2, `F` = 8 | 22,731 | 22,755 | 0.999 |
| ROWS, `R` = 4, `F` = 8 (`exp9aj`) | 19,648 | 19,648 | 1.000 |
| ROWSP, `R` = 4, `F` = 4 (`exp9ak`) | 14,838 | 14,833 | 1.000 |
| CAP 330 µs, loaded call count (45.2) | 23,127 | 23,113 | 1.001 |
| CAP 330 µs, calibration call count (43) | 23,127 | 23,055 | 1.003 |

In the three cap cases the bound is exceeded by 0.3 to 0.4 percent when the calibration call count is used and by 0.1 to 0.2 percent with the loaded count. With the loaded count the recurrence predicts the six misses of the 330 µs cap: 45.2 calls instead of 43 add 57 µs to `C_TL`. Under overload (ROWSP at `R` = 1) the recurrence predicts the overrun (23.8 ms against a 23.1 ms period), but a single-job bound means nothing.

Without the hand-off term the TH bound failed by 0.5 to 0.9 percent in the three cases with the smallest `B` and by 0.1 percent in three more (WHOLE, and ROWSP at `R` = 8 and `R` = 4 in `exp9ak`). That is why the second `ε` is in the bound.

**One exception.** In the `exp9ai` run with a single 15 ms call (WHOLE at `F` = 16) TH exceeds its bound by 12.6 µs (ratio 1.001). Interrupts arriving inside a call much longer than a period are not covered by a single hand-off term. A call that long would need a term proportional to the number of interrupts inside it.

**Why the bound is tight, and where it is not.** TH and TM are released together every 10 ms. TM finishes at about 1947 µs, TL starts, and the next TH release follows 52.6 to 52.9 µs later in each of the seven `exp9aj` cases whose longest call is the job's first. So a TL job's first call is never hit at its start, and when the longest call is the first one (WHOLE, LAYER, and ROWS with `R` of 4 or more) TH's maximum blocking is 27 to 39 µs short of `B_meas`, which gives ratios of 0.95 to 0.99. When the longest call is a later one (`R` of 2 or less, and `F` = 16), the bound is attained within 12 µs. The tightness is a matter of structure, not a percentage.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| A TH bound is violated by under 1 percent in the cases with the smallest `B` | The hand-off term is missing. Charge a second `ε`. |
| The TL bound says no misses, but there are some | A cap was in force and the calibration call count was used. Use the loaded count. |
| The TL bound is meaningless or hugely above the observation | TL is overloaded (backlog). Check the utilisation first. |
| TH exceeds the bound with a very long call | The call is much longer than a period, and many interrupts hit it. One hand-off term cannot cover that. |
| `ε` changes by several microseconds between runs | It is a difference of two extremes. Look for the outlier in the calibration samples and take the largest estimate. |
| A Secure wall-clock maximum of 2 ms is read as the blocking term | It includes Non-Secure preemption inside the call. It is not blocking. |

## Trade-offs and going further

**What to do with the terms.** The results reduce to a short procedure for a designer who wants a model in the Secure world of a real-time device.

1. Compile the kernels as the Non-Secure image would, or the comparison measures the build system.
2. Find the tightest task above the inference task that uses TF-M, or that a TF-M user above it can push through, and compute the largest `B` it tolerates, `D - C - 2ε` for a task like TH (1.52 ms here).
3. Choose the chunk size from the formula for `B(R)`, or set the Secure cap to that value minus the call path, which does not depend on the client.
4. Check the inference task with the TL recurrence, using the call count of the chosen granularity, or the loaded count under a cap. The finest chunking is not the best one: at `F` = 8 the inference task overruns at `R` = 1 and `R` = 2 is the practical floor.

**Limits.** All data come from one board, one TF-M port and one small network with synthetic weights. The terms are expected to transfer, the constants are not. There is no neural-network accelerator, and the kernels are CMSIS-NN's DSP path. The partition runs at isolation level 1, where an application partition is not isolated from the platform services. Level 2 changes the call path, and it was not measured with this service. Loading real weights from protected storage would add the flash terms of the flash-and-cache part on every load, and was not run. If the inference task is the most urgent TF-M user, the term moves: the tasks above it pay nothing and the tasks below pay its chunks as interference instead of blocking. That position was not measured.

- **Exercise:** TH's body costs about 463 µs, `ε` is 9.65 µs and the case is ROWSP at `R` = 8 with `B` = 1345.5 µs. Compute `R_TH` and compare it with the observed maximum of 1820 µs. Then recompute with a single `ε` and say which side of the observation the bound falls.
- **Exercise:** a task with `D` = 3 ms, `C` = 0.9 ms and `ε` = 10 µs sits above the inference task. Compute the largest `B` it tolerates, and decide from the sweep of the previous modules which row chunk sizes satisfy it.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | Measured on the STM32H573I-DK; write-up in progress |
| **Read first** | [The floor and the cap](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai03-floor-and-cap/) |
| **Next** | [The validation report](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x01-validation-report/) |
| **Evidence** | `exp9aj` (run `20261105_201309`), `exp9ak` (runs `20261105_215610` and `20261105_233228`), and `exp9ai` (run `20261105_193306`), STM32H573I-DK |
| **Related** | [Response-time analysis in brief](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/); [Random task sets](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b04-random-task-sets/); [Cache-related preemption delay](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s04-cache-related-preemption-delay/); [Limits and open questions](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/validation/x02-limits-and-open-questions/) |

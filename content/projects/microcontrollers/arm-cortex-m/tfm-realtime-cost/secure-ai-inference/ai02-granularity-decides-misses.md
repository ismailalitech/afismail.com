+++
title = "One call or many: the granularity of a Secure call decides who misses"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "A Secure inference longer than a task's period makes that task miss deadlines. Cutting it into row-sized calls removes every miss, at a price paid by the inference task."
weight = 20

[params]
  lab = 19
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can say why a neural network inside the Secure world makes tasks miss deadlines even when they never use it, compute the longest call a given task can tolerate, choose how to cut the inference into calls so that no task misses, and read the price of that choice in extra calls and extra response time for the inference task. The result is that the model is not the problem: the size of the longest single call is.

## Before you start

- **Level: Advanced.** Read [Blocking through the PSA mutex](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) and [Response-time analysis in brief](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/), and the previous module, [The 5x slowdown that was the build](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai01-toolchain-not-trustzone/), because the inference times used here are the corrected ones.
- **Words used here.** *Blocking* is time a task spends ready but unable to run because a lower-priority task holds something it needs. A *chunk* is a call that does part of the inference. *Calibration* is a phase in which every body is timed alone.
- **Time:** reading takes half an hour. The data come from four-second runs of about thirteen cases.

## The idea

Zephyr's client side of the PSA API takes one mutex for each `psa_call()`. The mutex is held from the client's lock to its unlock, which covers the Non-Secure call path, the Secure manager's message handling and the partition's work. Suppose the lowest-priority task, TL, is inside a call when the highest-priority task, TH, reaches its own TF-M transaction. TH waits, TL inherits TH's priority and finishes its call, and the mutex is handed over. While TL runs at TH's priority, the middle task TM cannot run either, although it never touches TF-M. That is push-through blocking.

With priority inheritance, one mutex and a single lower-priority holder, a task is blocked at most once per job, and the blocking term of TH and TM is the longest single critical section of TL:

```text
B = max over the k calls of (Secure time of call j + call path of call j)
```

Secure calls are preemptible, so TL's call does not delay TH until TH asks for the mutex. The blocking appears at TH's transaction, in full when TH's release lands at the start of TL's longest call.

The mutex is taken per call, not per inference. So `B` is decided by how the inference is cut into calls. Output rows of a convolution or a pool are independent once the input rows they read are present, so a call can cover `R` output rows of one layer and leave the rest to the next call. For the network used here (two convolutions with 32 and 16 output rows, two pools with 16 and 8, and a fully connected layer) the number of calls is:

```text
convolutions only chunked:   k = 32/R + 16/R + 3
convolutions and pools:      k = 32/R + 16/R + 16/R + 8/R + 1
```

Chunking is not free. Every extra call adds the call path and a fixed setup cost in the Secure engine, and that is paid by TL. The two extremes are one call (`k` = 1, `B` is the whole inference) and one row per call (`R` = 1, `k` = 73 when pools are chunked, `B` is the most expensive row plus the path).

## On this board

The task set is the one used throughout the project:

| Task | Priority | Period | Job |
|---|---|---|---|
| TH | highest | 2 ms | 6 Non-Secure operations, then one TF-M transaction |
| TM | middle | 5 ms | 25 Non-Secure operations, never calls TF-M |
| TL | lowest | 23.1 ms | one inference per job, in the Non-Secure image or through the Secure service |

Each case runs four seconds: 2000 TH jobs, 800 TM jobs and 173 TL jobs. Releases come from compare channels of a hardware timer at 1 MHz, and response times are measured from the nominal release with the cycle counter, so a release delayed by the kernel counts against the task. The board is the STM32H573I-DK at 240 MHz with Zephyr and TF-M (isolation level 1, preemptible Secure calls, priority inheritance on).

The service lives in the workload partition and is a set of commands: `INFER` runs part of an inference and replies DONE, PARTIAL with a resume point, or ERROR; `INFER_STATS` reports per-layer Secure cycles; `INFER_CAP` sets a wall-clock cap (next module); `INFER_RESET` clears the statistics and keeps the model; `INFER_INPUT` delivers the 1 KB input outside any timed call. The model, the activations and the im2col scratch live in the partition. The activation buffers carry one zero row above and below, so a convolution chunk reads its rows and their two neighbours without vertical padding and without recomputing a halo. The sum of the chunks equals the whole layer up to the fixed setup per call.

Between calls the activations stay in the partition, so an inference is a run that one connection owns. The partition keeps eight connection slots, each with its run identifier and the layer and chunk its next call must ask for. A call out of order, or from a connection whose run another connection has displaced, fails with `PSA_ERROR_BAD_STATE` and drops the run, rather than computing on someone else's activations.

The modes used in the cases are WHOLE (one call), LAYER (one call per layer, five calls), ROWS (convolutions in chunks of `R` rows, pools and the fully connected layer whole) and, in the next module, ROWSP (pools chunked too).

## How it is measured

Experiments `exp9ai` (WHOLE and LAYER) and `exp9aj` (ROWS) share the task set and the same network. The authoritative run of `exp9aj` is `20261105_201309`, a rerun with corrected input handling whose numbers agree with the first run within 0.3 percent.

In the calibration phase each case's task bodies run alone, and the longest single `psa_call()` of TL measured on the Non-Secure side becomes `B_meas`: Secure cycles plus the call path. In the loaded phase the case runs for four seconds and every job is logged. Every chunked and capped inference was also checked: the logits of the chunked Secure run equal those of the whole Non-Secure inference, and no run reported an error.

The tolerance of TH is a short piece of arithmetic. With the deadline equal to the period, `D` = 2 ms, `C` the cost of TH's body and `ε` the per-job kernel overhead, TH can accept a blocking term up to `D - C - 2ε`, which is 1.52 ms for this task set. The second `ε` is the hand-off cost, explained in [The terms of the analysis](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai04-terms-of-the-analysis/).

## What you should see

Granularity sweep at `F` = 8 (experiment `exp9aj`, run `20261105_201309`). `S_inf` is the Secure time of one unloaded inference.

| Case | Calls | B_meas (µs) | TH misses of 2000 | TM misses of 800 | TL misses of 173 | S_inf (µs) |
|---|---|---|---|---|---|---|
| WHOLE | 1 | 8477 | 779 (39 %) | 406 (51 %) | 0 | 8390 |
| LAYER | 5 | 5327 | 554 (28 %) | 215 (27 %) | 0 | 8394 |
| ROWS, R = 16 | 6 | 2709 | 389 | 43 | 0 | 8397 |
| ROWS, R = 8 | 9 | 1395 | 0 | 0 | 0 | 8408 |
| ROWS, R = 4 | 15 | 741 | 0 | 0 | 0 | 8431 |
| ROWS, R = 1 | 51 | 480 | 0 | 0 | 15 | 8567 |

![Maximum response of the two non-ML tasks against the blocking term at F = 8. The responses follow the dashed bounds and cross the deadlines near 1.5 ms.](/images/tfm/ai_missesB.png)

*Maximum response of TH (blue) and TM (orange) against `B_meas` for the cases of this module and the next, on logarithmic axes. Numbers are missed deadlines. The dashed lines are the bounds of the next module, the dotted lines the 2 ms and 5 ms deadlines.*

Read the table with three observations.

- **TM misses without ever calling TF-M.** In WHOLE mode 51 percent of TM's deadlines are missed, as TM is pushed below TL while TL inherits TH's priority.
- **Layer granularity is not enough.** LAYER mode reduces `B` only to the longest layer, the first convolution at 5.3 ms, and still misses 28 percent and 27 percent.
- **The misses follow the bound, not the model.** Chunks of 8 rows (`B` = 1.40 ms) and 4 rows (`B` = 0.74 ms) both stay under TH's limit of 1.52 ms and no task misses a deadline. The chunk of 16 rows (`B` = 2.71 ms) is over it and TH misses 389 times. The maximum responses fall from 8.91 ms (TH) and 13.10 ms (TM) in WHOLE mode to 1.82 ms and 3.75 ms at `R` = 8, and to 1.17 ms and 3.08 ms at `R` = 4.

The price is paid by TL. Its maximum response grows from 19.03 ms in WHOLE mode to 19.42 ms at `R` = 8 and 19.65 ms at `R` = 4, against a period of 23.1 ms, and the Secure time per inference grows by 0.2 percent and 0.5 percent. Each extra call adds 26.3 to 29.7 µs to TL's job, of which 25.2 to 26.2 µs is the call path (the same in all ten chunked cases) and 1.1 to 3.6 µs is engine setup. The call that carries the 1 KB input costs 77 to 83 µs, so 52 to 57 µs is the transfer.

There is also a floor. Once the convolutions are split finely, the longest call is the unsplit first pooling layer (455 µs at `F` = 8) and `B` stops falling at `R` = 1 while the calls keep multiplying. At `R` = 1 (51 calls) TL's job grows by 1.5 ms and TL itself misses 15 deadlines by up to 58 µs: the inference task is the first to overrun.

At `F` = 16 the model is twice the size and TL does not fit its period in any mode, with 144 to 149 of 173 jobs missing and 24 to 29 releases dropped. TH and TM still meet every deadline at `R` of 2 or less. The non-ML tasks are protected while the ML task itself is not.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| A task that never calls TF-M misses deadlines | It is blocked through priority inheritance by a lower-priority TF-M user. Look at the longest single call, not at who calls. |
| Chunking removes the misses of TH and TM, but the inference task now misses | Too many calls: each costs about 27 to 30 µs on TL. Go back to a larger `R`. |
| A call fails with `PSA_ERROR_BAD_STATE` | It came out of order, or another connection displaced the run. Each inference is owned by one connection. |
| The bound is above a deadline but no job missed | The bound is sufficient, not a predictor. One case (TM at `F` = 4, `R` = 16) with a bound about 1 percent over the deadline had no miss in 800 jobs. |
| Secure wall-clock maxima of 2 ms appear in a log | They include Non-Secure preemption inside the call. They are not blocking. |

## Trade-offs and going further

- **Chunk size against slack.** `B` falls roughly with `R` while `k` grows with `1/R`, so the demand of the inference task grows fastest exactly where blocking is smallest. At `F` = 8 and `R` = 1 the task overruns.
- **Row independence is all that chunking needs.** It holds for convolutions and pools. A network with a large fully connected layer has a floor set by that layer unless it is split along its outputs.
- **Exercise:** from the two rows `R` = 8 (`B` = 1395 µs) and `R` = 4 (`B` = 741 µs), solve `B = R × c + p` for the cost `c` of one first-convolution row and the intercept `p`. Why is `p` about 87 µs, not the 26 µs path of an ordinary call? (Hint: which call carries the input?)
- **Exercise:** predict the number of calls for the ROWS mode and for the ROWSP mode at `R` = 2, and check your values against the 27 calls of the `F` = 4, `R` = 2 case of this sweep and the 37 calls of the next module.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | Measured on the STM32H573I-DK; write-up in progress |
| **Read first** | [Blocking through the PSA mutex](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) |
| **Next** | [The floor of the blocking term, and a cap](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai03-floor-and-cap/) |
| **Evidence** | `exp9ai` (run `20261105_193306`) and `exp9aj` (authoritative run `20261105_201309`), STM32H573I-DK |
| **Related** | [Chunking shapes the blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/); [The terms of the analysis](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai04-terms-of-the-analysis/); [Random task sets](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b04-random-task-sets/) |

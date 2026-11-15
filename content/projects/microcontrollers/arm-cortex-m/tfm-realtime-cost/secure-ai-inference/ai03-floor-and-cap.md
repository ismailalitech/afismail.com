+++
title = "The floor of the blocking term, and a cap the Secure side enforces"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "How small the blocking can get when an inference is cut into rows, what that costs, and how the Secure partition can enforce the same bound without trusting the caller."
weight = 30

[params]
  lab = 20
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can say how small the blocking caused by a Secure inference can be made, why making it smaller than that is a mistake, and how to enforce a limit on the longest call from inside the Secure partition, so that a careless or hostile client cannot defeat it by asking for the whole inference in one call. The shortest version: the floor is one convolution row plus the call path, about 200 microseconds here, and a Secure-side cap reproduces the same bound.

## Before you start

- **Level: Advanced.** Read [One call or many](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai02-granularity-decides-misses/) first. The task names TH, TM and TL and the blocking term `B` are used as they are there.
- **Words used here.** The *floor* is the smallest `B` that chunking can reach. A *cap* is a limit in microseconds on how long one call may run. *Calibrated maxima* are the longest times of one-row chunks, measured in the calibration phase and sent to the partition. A *predictive* check stops before a chunk that would pass the cap, instead of after.

## The idea

**The floor.** Chunking shrinks the longest call until some single piece cannot be split. In the previous module the unsplit first pooling layer (455 µs at `F` = 8) stopped the fall at `R` = 1. If the pooling layers are chunked too, the longest call becomes the most expensive convolution row plus the path of one call. Splitting everything by rows gives 73 calls per inference.

**The cap.** Client-side chunking trusts the client to cut finely enough. A client that asks for the whole inference in one call defeats it. The partition can enforce the bound itself: it runs a whole-inference request one row at a time, and before each row except the first of the call it asks whether the elapsed time plus the calibrated maximum of the next one-row chunk would pass the cap. If so, it replies PARTIAL with the next layer and row, and the client resumes with another call. The first row of a call always runs, so every call makes progress. The longest call is then:

```text
B_cap = max(cap, longest one-row chunk) + call path
```

Two properties matter for the analysis.

- **The cap is a wall-clock limit.** Time during which TL is preempted inside the call counts as elapsed, so a loaded inference is split into more calls than an unloaded one. The call count in the bound for TL must be the loaded one.
- **The prediction needs the one-row maxima.** Without them (the first inference after the model is reconfigured) the check can only stop after a row has passed the cap, and the term degrades to cap plus one row plus the path.

## On this board

Experiment `exp9ak` is derived from the previous one. It splits the pooling layers too (mode ROWSP) and moves the 1 KB input into its own untimed command, so that every chunk call has the same three vectors (12 and 24 bytes in, 40 bytes out) and the same 26 µs path. It adds the cap, set by `INFER_CAP` in microseconds together with the calibrated one-row maxima. The cap is in microseconds because an operation count does not fit an inference, whose rows differ in cost by layer. The partition reads the cycle counter at the start of a capped call and applies the check above.

The task set, board and measurement method are those of the previous module. The calls per inference in ROWSP mode are `32/R + 16/R + 16/R + 8/R + 1`.

## How it is measured

The run is `20261105_215610` with 13 cases: the Non-Secure baseline, WHOLE, ROWSP at several `R` and `F`, and CAP at 1300, 650 and 330 µs. Each case runs four seconds after the calibration phase, which times every body alone, including the one-row chunks of each layer that feed the cap's predictor. The longest single call of TL (`B_meas`) is taken from calibration on the Non-Secure side and includes the call path.

After the data runs the input command was bound to its connection and `exp9ak` was run again with the modified build (`20261105_233228`). The Non-Secure sources, the partition sources and the image differ from the main run, so this is a repeatability check and a check that the change does not affect timing. It reproduced `B_meas` within 0.3 percent in 10 of 11 Secure cases and the miss pattern in every case. The exception is the 650 µs cap, which measured 660.6 µs instead of 676.0 (-2.3 percent) because the cap split the calibration inference into 17 calls instead of 16, so the longest call was shorter. The floor was 199.9 µs against 200.4.

## What you should see

Floor and cap at `F` = 8 unless noted (experiment `exp9ak`, run `20261105_215610`). Calls are per inference in calibration, with the loaded count in brackets for the cap. Misses are for TH, TM and TL.

| Case | Calls | B_meas (µs) | B_pred (µs) | Misses | TL max response (µs) | S_inf (µs) |
|---|---|---|---|---|---|---|
| ROWSP, R = 1, F = 4 | 73 | 166 | 155 | 0 / 0 / 0 | 18,864 | 6109 |
| ROWSP, R = 1 | 73 | 200 | 190 | 0 / 0 / 110 | backlog (24,487) | 8600 |
| CAP 330 µs | 43 (45.2) | 356 | 356 | 0 / 0 / 6 | 23,127 | 8611 |
| ROWSP, R = 2 | 37 | 364 | 354 | 0 / 0 / 0 | 22,731 | 8491 |
| CAP 650 µs | 16 (18.4) | 676 | 676 | 0 / 0 / 0 | 19,945 | 8565 |
| ROWSP, R = 4 | 19 | 691 | 681 | 0 / 0 / 0 | 19,771 | 8437 |
| CAP 1300 µs | 8 (9.7) | 1318 | 1326 | 0 / 0 / 0 | 19,689 | 8549 |
| ROWSP, R = 8 | 10 | 1346 | 1336 | 0 / 0 / 0 | 19,484 | 8409 |
| WHOLE | 1 | 8422 | 8421 | 749 / 406 / 0 | 19,064 | 8390 |

`B_pred` is `R` times the row cost plus 26 µs, or `max(cap, one row)` plus 26 µs.

![Price of granularity at F = 8. Top: Secure time per inference and TL's maximum response against the number of calls. Bottom: the blocking term against the number of calls, falling to a floor near 200 microseconds.](/images/tfm/ai_price.png)

*The price of granularity at `F` = 8. Top: Secure time per inference (hollow, left axis) and TL's maximum response (filled, right axis) against calls per inference. The dashed line is TL's 23.1 ms period. Bottom: `B_meas`, which flattens at one convolution row plus the path.*

**The floor.** At `R` = 1 the blocking is 200 µs at `F` = 8 and 166 µs at `F` = 4, 0.42 of the floor of the previous module (480 µs), for 73 calls and 2.5 percent more Secure time (73 calls times about 2.9 µs of engine setup each). At `F` = 8 that many calls push TL to a utilisation of 0.98, and into overload: 110 misses and backlog. `R` = 2 (37 calls, `B` = 364 µs) is the practical floor: zero misses for all three tasks and TL's maximum response within 0.1 percent of its bound (22,731 µs observed against 22,755).

**The cap.** The measured `B` is the cap plus the path within 1 percent: cap plus 17.7, 26.0 and 25.8 µs for caps of 1300, 650 and 330 µs. With the 330 µs cap, two rows (346 µs) no longer fit, so every convolution call is one row and the cap reproduces the structure of ROWSP at `R` = 1, at `B` = 356 µs.

Because the cap is wall-clock, loaded inferences take 5 to 21 percent more calls than in calibration (9.7 against 8, 18.4 against 16, 45.2 against 43), and the typical blocking of TH is lower than with client-side chunking at the same `B`: TH's maximum is 1384 µs for the 1300 µs cap against 1820 µs for ROWSP at `R` = 8. **The worst case is not lower.** A TH release can land in the 15 to 20 µs between the call's start and the partition's first reading of the cycle counter, so `B = max(cap, one row) + path` must stay in the analysis. If the calibrated maxima are missing, the cap degrades to cap plus one row plus path: 529 to 1499 µs for the three caps here.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| The inference task misses deadlines after you chunk down to one row | Too many calls. At `F` = 8 and `R` = 1 the 73 calls take TL to a utilisation of 0.98. Use `R` = 2. |
| The measured `B` is one row more than cap plus path | The calibrated maxima were missing or stale (first inference after a reconfiguration). Send them again. |
| TL's bound says no misses but it misses | The call count used was the calibration count. Under a wall-clock cap use the loaded count: 45.2 calls instead of 43 adds 57 µs to TL's cost. |
| A cap value is a little below the measured `B` | The first row of a call always runs, so one row can pass a very small cap. `B` is `max(cap, one row)` plus path. |
| `B` differs by 2 percent between two runs of the same cap | The calibration inference was split differently (16 or 17 calls at the 650 µs cap). The formula still holds. |

## Trade-offs and going further

- **Client chunking against a cap.** Client chunking is cheaper for the Secure side: at about the same `B` (1346 µs for ROWSP at `R` = 8, 1318 µs for the 1300 µs cap) the cap costs 8549 µs of Secure time per inference against 8409 µs, because the partition runs one-row chunks inside each call. The cap, in return, holds for any client. A reasonable design uses the cap as the enforcer and client chunking as the efficient path.
- **What the cap does not protect.** The service protects the weights from Non-Secure software. The input and the logits cross the boundary in the clear, so it does not protect the data. Client-side chunking is driven by the Non-Secure side, which therefore knows the number of layers and rows. Under the cap the partition decides where to stop, but the number of calls and their durations still reflect the layer costs, and the shared instruction cache is a candidate for observing layer boundaries. Model confidentiality against a co-located Non-Secure observer holds for the weight values, not for the architecture. Power and electromagnetic side channels are outside this work.
- **Exercise:** the cap 650 gave `B` = 676.0 µs and the longest one-row chunk is about 173.5 µs. Predict `B` for a cap of 500 µs, and say which term would dominate if the calibrated maxima were missing.
- **Exercise:** TH tolerates a blocking term up to 1.52 ms. With a path of 26 µs and the most expensive row at about 173.5 µs, find the largest `R` of the ROWSP mode that stays under it, and compare with the table.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **Status** | Measured on the STM32H573I-DK; write-up in progress |
| **Read first** | [One call or many](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai02-granularity-decides-misses/) |
| **Next** | [The terms of the analysis](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/secure-ai-inference/ai04-terms-of-the-analysis/) |
| **Evidence** | `exp9ak` on the STM32H573I-DK, run `20261105_215610`, repeated as `20261105_233228` |
| **Related** | [Budget and identity enforced by the Secure side](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a01-secure-side-budget-and-identity/); [Chunking shapes the blocking term](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b02-chunking-shapes-blocking/); [Blocking through the PSA mutex](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) |

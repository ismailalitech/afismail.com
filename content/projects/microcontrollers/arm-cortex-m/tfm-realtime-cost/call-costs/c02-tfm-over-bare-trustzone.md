+++
title = "What TF-M costs over bare TrustZone-M: 0.1 microseconds against 14"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "The same Secure workload called through a plain veneer and through a PSA call: the architecture is almost free, the framework is not."
weight = 20

[params]
  lab = 4
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Advanced"
+++

After this module you can say how much of the cost of a Secure call is TrustZone and how much is TF-M, where the difference goes, what a bare veneer does not give you, and when a design can afford to use veneers alone. The result is simple and easy to misuse: the state change costs 24 to 28 cycles; the framework around it costs thousands.

## Before you start

- **Level 4.** You should have read [C01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/), which gives the TF-M numbers this page compares with, and [F01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/) for the words veneer, SG and SPM.
- **Tools:** the STM32H573I-DK with the measurement firmware, for the measurements. The arithmetic needs only a calculator.
- **Time:** the experiment runs about 85 seconds.

## The idea

Every cost measured so far was measured on TF-M, so "the price of a Secure call" and "the price of TrustZone" were mixed. To separate them, the Secure image of the project also exports the **same workload through plain Non-Secure-Callable veneers**: an SG stub in the veneer region, Secure thread mode, no Secure Partition Manager and no PSA client API. Then the same quantities are measured both ways, on the same image, on the same board.

The two paths differ in what stands between the caller and the Secure function:

| | Bare veneer | TF-M `psa_call()` |
|---|---|---|
| Non-Secure wrapper and its mutex | none | yes |
| Entry into the Secure state | the SG stub | a veneer into the SPM |
| Message queueing and partition scheduling | none | yes |
| Isolation between callers | none | yes (by partition) |
| Reply | return with `BXNS` | message reply, then return |

## On this board

Experiment exp9y runs on the STM32H573I-DK (240 MHz, TF-M v2.3.0, isolation level 1). All figures are means over 500 calls with the cycle counter; the latency case uses 200 jobs.

### Cost of a call

| Quantity | Cycles | Microseconds |
|---|---|---|
| Empty veneer call | 28 (24 in the first study) | 0.117 (0.10 in the first study) |
| Empty `psa_call()` on an open connection | 3365 | 14.02 |
| Empty transaction (connect, call, close) | 8987 | 37.45 |
| One workload operation, Non-Secure | 14058 | 58.58 |
| One workload operation, through the veneer | 14107 | 58.78 |
| One workload operation, through `psa_call()` | 18824 | 78.43 |

The first study reports 24 cycles (0.10 microseconds) for the empty veneer and the archived log of this run 28 (0.117); the four-cycle difference is not traced. Either way the veneer adds 0.2 microseconds to the operation (58.78 against 58.58) and TF-M adds 19.9 (78.43 against 58.58) on an open connection.

### Cost of moving data

Moving B bytes in and B bytes out through the veneer (exp9y, `BARE_COPY`):

| B | Cycles | Microseconds |
|---|---|---|
| 4 | 227 | 0.95 |
| 64 | 535 | 2.23 |
| 256 | 1495 | 6.23 |
| 1024 | 5335 | 22.23 |
| 4096 | 20698 | 86.24 |

The slope is 20.84 nanoseconds per B, which is **10.42 nanoseconds per byte moved**, since B bytes go each way. That is exactly the per-byte price of a TF-M call in [C01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/). The per-byte term is the copy between the two worlds' memory; the framework adds nothing to it.

### Effect on a task released during the call

A high-priority thread is released by a kernel timer 1 ms into a 150-operation activity of a lower-priority thread, which runs in the Non-Secure state, through the veneer, or through TF-M.

| Activity of the low-priority thread | Release-to-start latency | Extra over Non-Secure |
|---|---|---|
| Non-Secure | 1062 cycles, 4.43 microseconds | 0 |
| Bare Secure call | 1101 cycles, 4.59 microseconds | 0.16 microseconds |
| TF-M call | 1263 cycles, 5.26 microseconds | 0.84 microseconds |

A higher-priority thread that does not call TF-M therefore pays 0.16 microseconds to preempt a bare Secure call and 0.84 to preempt a TF-M call. The first study measured 1.06 to 1.21 microseconds for the TF-M case on a different build; the figure is a property of the build, so the comparison here is made on one build.

### The share

A veneer call is 0.117 of the 14.02 microseconds of a `psa_call()`. More than 99 percent of the cost of a Secure call on this platform is the PSA framework: the Non-Secure wrapper and its mutex, the veneer into the SPM, message queueing, partition scheduling and the reply. The architecture itself, the state change, is not where the time goes.

## How it is measured

The Secure image exports `tz_bare_empty()` and the workload through ordinary veneers, next to the PSA partition that serves the same workload. The experiment's header lists what it measures:

```
SVC,<name>,<size>,<n>,<mean_cyc>,<min_cyc>,<max_cyc>
  BARE_EMPTY      tz_bare_empty()
  TFM_CALL_EMPTY  psa_call() on an open connection, no payload
  TFM_TXN_EMPTY   psa_connect + psa_call + psa_close, no payload
  BARE_RUN1       one workload operation through the veneer
  TFM_RUN1        one workload operation through psa_call()
  BARE_COPY_<B>   B bytes in and B bytes out through the veneer
LAT,<case>,<n>,<mean_cyc>,<min_cyc>,<max_cyc>
  release-to-start latency of HIGH (prio 1) released by a kernel timer
  1 ms into LOW's (prio 5) 150-operation activity: NS / BARE / TFM
```

The run ends with `errors=0`, which counts failed result checks. The Secure image on the RA4E1 is exactly this bare path ([M02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m02-two-boards-one-method/)).

## What you should see

- The empty veneer: 28 cycles on the log, about 0.1 microseconds.
- The empty `psa_call()`: 3365 cycles, 14.0 microseconds; the empty transaction 37.4.
- The same operation costs 58.8 microseconds through the veneer and 78.4 through TF-M.
- The per-byte slope is 10.4 nanoseconds in both cases.
- The latency extra is 0.16 and 0.84 microseconds.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| The veneer call looks like 0 | the compiler removed the empty function; the call must be a real SG entry |
| The empty veneer reads 24 or 28 cycles depending on the source | a few cycles of counter-read placement; the two figures are both in the records |
| The latency extra is near 1 microsecond rather than 0.84 | a different build; the first study reported 1.06 to 1.21 microseconds |
| A bare call corrupts state when two threads call at once | the veneer runs on the Secure stack that TF-M leaves active for the Non-Secure world; nothing serialises entry |

## Trade-offs and going further

What the bare path does not provide is what the 14 microseconds buy: isolation between callers, a scheduler for Secure work, a message model, and safety against concurrent entry. A design with a **fixed set of Secure functions and callers that it can serialise itself** can have them at 0.1 microsecond each. A design that needs partitions, several clients or the shipped Crypto, Storage and Attestation services needs TF-M, and then the cost in [C03](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c03-service-catalogue/) is the price list.

The comparison also isolates what the real-time analysis must charge for: not the crossing, but the length of the longest service behind it ([B01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/)).

- **Exercise:** a control loop calls one Secure function every 100 microseconds. Compute its processor load for the veneer (0.117 microseconds), for a `psa_call()` on an open connection (14.02) and for a full transaction (37.45).
- **Exercise:** use the BARE_COPY table to predict the time to move 2048 bytes each way, and say which two rows bracket it.

## At a glance

| | |
|---|---|
| **Level** | Advanced |
| **How to run** | Experiment exp9y on the STM32H573I-DK, about 85 seconds |
| **Status** | measured; one run, 0 errors |
| **Read first** | [C01 Anatomy of a Secure call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/) |
| **Related** | [F01 Two worlds on one core](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/); [M02 Two boards, one method](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m02-two-boards-one-method/); [C03 The service catalogue](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c03-service-catalogue/); [B01 Blocking through the PSA mutex](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) |
| **Evidence** | exp9y (calls, copy and latency, STM32H573I-DK, one run) |

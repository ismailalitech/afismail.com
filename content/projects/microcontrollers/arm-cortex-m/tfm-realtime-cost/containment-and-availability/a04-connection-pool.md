+++
title = "The connection pool: eight entries shared by every task"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "Why one persistent connection per task is the cheap design and why it can lock every other task out of the Secure side."
weight = 40

[params]
  lab = 17
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Intermediate"
+++

After this module you can say how many Secure connections a TF-M system has by default, what happens to every other task when they are used up, how much a persistent connection saves per call, and what raising the limit costs. The answers come from exp9ac on the STM32H573I-DK, with TF-M at isolation level 1, and are repeated for pools of 16 and 32 entries.

## Before you start

- **Level: Intermediate.** You should know what a PSA call is and what a connection-based service is ([TrustZone and PSA calls](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/)). The cost of one call and of a whole connect, call and close transaction is on [the anatomy of a call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/).
- **Words used.** A *connection* is the handle the Secure partition manager (SPM) allocates when a client calls `psa_connect()` on a connection-based service. A *stateless* service, such as Crypto, internal storage (ITS) or protected storage (PS), allocates one connection for the duration of each call. The *pool* is the table the SPM takes these handles from.
- **Time:** the run on the shipped pool took 93 seconds from flash to the end of the capture.

## The idea

An empty TF-M transaction (connect, call, close) costs 36.2 µs. A call on an already open connection costs 13.9 µs. A design that keeps one persistent connection per task, as the per-operation cost suggests, therefore saves about 22 µs on every call.

The catch is that the SPM serves every connection, and every stateless call, from one pool of `CONFIG_TFM_CONN_HANDLE_MAX_NUM` entries, eight as shipped. The pool is global. A task that holds an entry for good takes it away from every other task, and tasks that never connect to anything still need one entry for the duration of each stateless call.

## On this board

### What a connection costs

Opening a connection to an empty test service takes 12.3 µs, whatever the occupancy of the pool. A call on an open connection takes 13.9 µs, again whatever the number of connections open. The ninth connect is refused in 2.4 µs with `PSA_ERROR_CONNECTION_BUSY`: the SPM rejects it before any partition runs.

### The pool is shared between services

With eight connections open to the empty service, a connect to a different service, the workload service of the test partition, is also refused. The experiment checks this directly: after eight open connections, the further connect returns the busy error.

### Stateless services take an entry too

Random numbers, ITS and PS are stateless, but each call allocates a connection for its duration. With eight persistent connections held, every `psa_generate_random()`, `psa_its_set()` and `psa_its_get()` of every task is refused, in 2.6 to 4 µs, with the same busy error. With seven held they run at their normal cost.

A refused caller is not woken when an entry is freed, and a persistent holder never frees one. A storage write refused this way is lost, and nothing in the system says so unless the caller checks the returned status.

## How it is measured

The experiment runs with the main thread alone at priority 0, and times everything with the cycle counter at 240 MHz. It has four parts, quoted from its own description:

```text
A  psa_connect cost against pool occupancy, the failure point, and
   the cost of a refused connect (CONN lines);
B  psa_call cost on an empty service against the number of open
   connections (CALL lines);
C  whether the pool is shared between services (SHARED lines);
D  whether stateless services still work with k connections held
   (STATELESS lines: random, ITS set/get, with k = 0 .. 8).
```

Part A opens connections to the empty service until one is refused, and records the cost of each step. Part D holds k connections open, then calls the random number generator, a 64-byte ITS write and a 64-byte ITS read, and records the cost and the returned status. The pool size is a build option, so the same experiment was run with 16 and with 32 entries.

## What you should see

Pool of eight (shipped configuration):

| Measurement | Result |
|---|---|
| Open the first to the eighth connection | 12.3 µs each (12.8 µs for the first) |
| Ninth connect | refused in 2.4 µs, `PSA_ERROR_CONNECTION_BUSY` |
| Call on an open connection, 1 to 8 open | 13.9 µs, unchanged |
| Connect to a second service, eight open | refused |

Stateless calls with k connections held (pool of eight):

| Call | k = 0 to 7 held | k = 8 held |
|---|---|---|
| `psa_generate_random()` | 37.4 µs | refused in 4.0 µs |
| `psa_its_set()`, 64 bytes | 4.0 ms | refused in 2.7 µs |
| `psa_its_get()`, 64 bytes | 39 µs | refused in 2.6 µs |

Persistent connections are therefore a global budget of seven on the shipped configuration, one entry being needed for the stateless calls.

Raising the pool is cheap. With 16 and with 32 entries the connect cost is 12.2 µs, the refused connect 2.4 µs and the call on an open connection 13.9 µs, the same as with eight to within 0.1 µs. The pool is still global: with 16 connections held, the same three stateless calls are refused again, and with 15 held they run. Each entry takes 148 bytes of Secure SRAM.

The two larger-pool runs were recorded a day after the first, and the ITS write took 4.6 ms in them instead of 4.0 ms. The cost of an ITS write depends on the state of the storage (see [open and closed window](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s02-open-and-closed-window/)), so this difference is not a pool effect, and the pool size is judged on the connect, refused and call costs only.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| Random numbers or storage writes fail for all tasks at once | the pool is exhausted by persistent connections; count the entries held, and remember the stateless calls need one |
| `PSA_ERROR_CONNECTION_BUSY` appears only under load | too many tasks hold or open connections at the same time; the SPM does not queue them |
| A storage write is missing after a busy period | the call was refused, and the caller did not check the status |
| The refusal comes back instantly | by design: the busy error is returned in a few microseconds, before any partition runs |
| Cost per call is the same with 8 or 32 entries | expected; the size of the pool does not change the time of any step |

## Trade-offs and going further

- **Persistent against per call.** Holding a connection saves about 22 µs per call at the price of one pool entry. For a service called rarely, the saving is small and the entry is not worth it.
- **Raise the pool before you rely on it.** A bigger pool costs 148 bytes of Secure SRAM per entry, so 24 more entries cost under 3.6 KB. A design with many persistent clients should raise the pool and also keep a margin for the stateless calls.
- **A refusal is a design event, not a timing one.** A refused call is cheap, but the work it carried is lost unless the caller retries. Retrying in a loop would turn the pool into a busy wait, which this experiment does not model.
- **Exercise:** a system with the shipped pool has five tasks that each keep one persistent connection, and one task that writes to ITS. How many more persistent connections can be added before the ITS writer is refused, and what does it see when the next one is added?
- **Exercise:** using 36.2 µs and 13.9 µs, find how many calls per second a task must make for a persistent connection to save one millisecond of processor time per second.

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **Status** | measured, STM32H573I-DK, isolation level 1, pool of 8, 16 and 32 |
| **Read first** | [The anatomy of a call](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c01-anatomy-of-a-call/) |
| **Related** | [A runaway client](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/containment-and-availability/a01-secure-side-budget-and-identity/); [The service catalogue](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/call-costs/c03-service-catalogue/); [Mutex blocking](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b01-mutex-blocking/) |
| **Evidence** | exp9ac (connection pool): the shipped pool of eight, and builds with 16 and 32 entries |

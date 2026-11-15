+++
title = "Why the kernel clock is not trusted: releases and timestamps from hardware"
date = '2026-11-15T22:00:00+01:00'
draft = false
description = "How releases are generated and stamped by hardware timers, and the two ways a kernel-based clock lies when Secure code runs."
weight = 10

[params]
  lab = 1
  board = "STM32H573I-DK"
  core = "Cortex-M33 (Non-Secure and Secure)"
  level = "Intermediate"
+++

After this module you can say why every timing result in this project comes from a hardware timer and the cycle counter instead of the Zephyr clock, describe how a periodic task is released and stamped so that a frozen core cannot hide a late release, and recognise the two situations in which a kernel timestamp is wrong by milliseconds. It is the module to read before you trust any other number here.

## Before you start

- **Level 2.** You should know what a compare channel of a timer is and what an interrupt latency is. [F01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f01-trustzone-and-psa-calls/) explains the two worlds; [F02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) explains why a response time needs a nominal release.
- **Tools:** the STM32H573I-DK with the measurement firmware, for the measurements. The reasoning needs none.
- **Time:** a case in the periodic experiments runs 4 seconds.

## The idea

A response time is measured from the moment a job was **released** to the moment it finished. Both instants have to come from a clock that keeps counting whatever the processor is doing. Two clocks fail that test on this platform.

1. **A kernel timer handler stamps late when the core is frozen.** A sector erase in the flash bank the code runs from stops every instruction fetch for 1.3 to 2.9 milliseconds, without any exception in either world (the mechanism is in [S01](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/)). A kernel timer that expires during the freeze runs its handler when the freeze ends and records that moment as the release. The delay disappears from the data.
2. **The kernel's own cycle counter can lose time.** The Zephyr SysTick driver counts cycles from a 24-bit down counter (a wrap of 69.9 ms at 240 MHz) and one flag. A Secure interrupt handler cannot be preempted by anything Non-Secure; if it holds the SysTick interrupt off for longer than the time to the next kernel timeout, kernel time falls behind. `k_cycle_get_32()` inherits the loss.

The cure is the same for both: generate the release with a free-running hardware timer, and read time from the core's own cycle counter (`DWT->CYCCNT`), which runs through a freeze.

## On this board

| Quantity | Source | Why |
|---|---|---|
| Release of each task | a compare channel of TIM4, running free at 1 MHz (240 MHz divided by 240); one channel per task (CC1, CC2, CC3) | the timer keeps counting during a freeze |
| Nominal release of job n | n times the period, kept in software, independent of when the interrupt actually ran | the response time is measured from the nominal release |
| Release latency | TIM4 counter minus the compare value, read at interrupt entry | measured by the timer itself, in microseconds |
| Job start, finish, activity length | `DWT->CYCCNT`, 240 MHz | not affected by a freeze or by SysTick |
| Kernel time | `k_cycle_get_32()` | used for nothing in the analysis; kept for comparison |

The first measurements of the project did use the kernel clock. `k_cycle_get_32()` costs 56 cycles (0.233 microseconds) for a pair of calls, which experiment exp6a records as its "measurement overhead", and it was reported but not subtracted. It drifts against the cycle counter by 110 cycles per millisecond at rest (minus 0.046 percent) and by 240 cycles per millisecond while flash is being written, because its SysTick interrupt is stalled too (exp9i).

## How it is measured

The periodic experiment exp9k releases three tasks from three compare channels. Its release handler shows the whole idea. This is the core of it, simplified from the experiment's source:

```c
uint32_t cnt = TIM4->CNT;            /* the timer's own time */
uint32_t now = dwt() - dwt0;         /* cycle counter, runs through a freeze */
...
do {
    struct release r = {
        .nominal_us = next_us[ch],                     /* n * period */
        .isr_cyc    = now,
        .lat_us     = (uint16_t)((cnt - ccr_val) & 0xFFFFU),
    };
    k_msgq_put(release_q[ch], &r, K_NO_WAIT);
    next_us[ch] += period_us[ch];
    ccr_val = (ccr_val + period_us[ch]) & 0xFFFFU;
    cnt = TIM4->CNT;
} while (compare value is already in the past);
*ccr = ccr_val;
```

Three details make the data trustworthy:

- **Catch-up.** If the handler ran more than a period late, the following compare values are already in the past. The loop emits those releases too, each with its own latency, and re-arms ahead of the counter. A freeze therefore produces several late releases, not one missing one.
- **Forced event.** A freeze between reading the counter and writing the new compare value can let the counter pass it, which would silence the channel for a 65 ms wrap. The handler then forces the event so the next interrupt catches up.
- **Calibration before each case.** Every task body is timed alone first (`main` at priority 0, TIM4 stopped) with the cycle counter, and the analysis uses those maxima.

A second experiment, exp9i, measures interrupt latency directly: TIM4 fires every millisecond and its handler reads the counter, which restarted at the update event. A high-priority thread released by that interrupt runs two identical probe loops, one executing from flash and one from RAM, to separate a code-fetch slowdown from a core-wide stall. Because the counter wraps at the 1 ms period, large latencies are aliased; the latencies in the table below are de-aliased from the gaps in the cycle counter between served interrupts.

A third, exp9o, checks the kernel clock itself. It samples `DWT->CYCCNT` every 100 ms as the reference and compares it with `k_uptime_ticks()` and `k_cycle_get_32()` while the Secure partition runs long handlers or long calls for 6 seconds per case.

## What you should see

Without flash activity, the two methods agree to the sample. With it, they do not:

| Case | Kernel-timer stamp | Hardware stamp |
|---|---|---|
| No flash write | agrees | agrees |
| ITS write (exp9i, bank 1) | the freeze is invisible: maximum response under-reported by up to 2.9 ms | 77 percent of the 1 ms interrupts later than 5 microseconds, 14 percent later than 600 microseconds, one interrupt lost per write; 289 of 290 writes lost an interrupt, and each write produced exactly one stall of 1.3 to 2.1 ms |
| The earlier release latency | 148 microseconds, from the kernel-timer handler (exp9d) | about 2 ms stall (exp9h) |

The 148-microsecond figure was therefore wrong by more than an order of magnitude: the handler that took the timestamp was itself frozen.

For the kernel clock (exp9o), with a 1 ms poller in the system a 10 ms Secure interrupt handler loses 8.8 ms of kernel time and a 40 ms handler 39.3 ms, within 1 to 2 ms of the prediction "handler length minus half the distance to the next timeout". With no short timeout in the system a 300 ms handler lost 272 ms per occurrence; with a 1 ms thread running, a 300 ms handler made a 6 s case last 23 s of wall time. A preemptible Secure call of 293 ms lost 3 microseconds: the loss is a property of handlers, not of calls.

Finally, the platform is cycle-deterministic. 3000 isolated samples of the same transaction were identical on two boards eight days apart (exp9c), and the maximum of each isolated distribution is the base cost plus a whole number of interrupt services. The maxima reported in this project are therefore the worst case of a given binary under the generated release pattern, not an estimate of a distribution tail; extreme-value fits were tried on four experiments and found degenerate.

## When it goes wrong

| Symptom | Likely cause |
|---|---|
| A response time that looks too good during flash writes | the release was stamped by a kernel timer handler that was frozen |
| Latency values that never exceed 1000 microseconds on a 1 ms timer | the counter wraps at the period; the real stall is hidden by aliasing |
| Kernel time falls behind wall time during a Secure interrupt handler | the handler is longer than the time to the next kernel timeout, so SysTick wraps are lost |
| A duration measured with `k_cycle_get_32()` is a fraction of a percent too long or short | its SysTick source drifts against `DWT->CYCCNT` |
| The release channel goes silent for 65 ms after a freeze | the compare value was passed while the core was frozen and no event was forced |

## Trade-offs and going further

- **The cycle counter has its own cost.** `DWT->CYCCNT` is read inline; its read cost was not calibrated, and the 0.233 microsecond pair cost applies only to the kernel clock.
- **Hardware stamps cost a timer.** TIM4 is one more peripheral to own. On the second board the same role is played by GPT1 ([M02](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m02-two-boards-one-method/)).
- **Exercise:** a 1 ms timer interrupt is served 1.7 ms late. With the counter wrapping at 1000 microseconds, what latency does the counter read, and how would you recover the real one from the cycle counter?
- **Exercise:** a Secure handler of 20 ms starts 5 ms before the next kernel timeout. Using "handler length minus the distance to the timeout", how much kernel time is lost?

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **How to run** | Board experiments exp9i, exp9k and exp9o on the STM32H573I-DK, 4 to 6 seconds per case |
| **Status** | measured; the kernel-clock behaviour was reproduced in two runs |
| **Read first** | [F02 Response-time analysis in ten minutes](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/fundamentals/f02-response-time-analysis/) |
| **Related** | [M02 Two boards, one method](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/measuring/m02-two-boards-one-method/); [S01 What a storage write does](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/flash-and-cache/s01-what-a-storage-write-does/); [B03 Secure interrupts and the kernel tick](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b03-secure-interrupts-and-the-tick/); [B04 Random task sets](/projects/microcontrollers/arm-cortex-m/tfm-realtime-cost/blocking-and-scheduling/b04-random-task-sets/) |
| **Evidence** | exp9i (hardware-timed interrupt latency, bank 1 and bank 2); exp9k (periodic set with hardware releases); exp9o (kernel time loss, two runs); exp9d and exp9h (the earlier kernel-stamped figure and its correction); exp6a (measurement overhead); exp9c on two boards (determinism) |

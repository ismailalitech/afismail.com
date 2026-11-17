+++
title = "Where Linux loses milliseconds, and how to get most of them back"
date = '2026-11-17T00:30:00+01:00'
draft = false
description = "A fabric interrupt answered by a Linux program shows 4 to 5 ms spikes. Five measured setups show the cause is scheduling, not interrupt delivery, and that a real-time priority on a pinned core removes most of it."
weight = 10

[params]
  lab = 52
  board = "PolarFire SoC Discovery Kit"
  core = "U54 (Linux), FPGA fabric latency unit"
  level = "Intermediate"
+++

After this lab you can measure how long a Linux program takes to answer a hardware interrupt, with a clock that Linux cannot
influence, and you know what makes the occasional answer a thousand times slower than the typical one.

## Before you start

- The pfdaq fabric with its latency unit and the `pfdaq_lat` tool on the board, from the
  [pfdaq project](/projects/fpga-soc/microchip-polarfire-soc/pfdaq/). The unit raises an interrupt, then times how long the
  software takes to acknowledge it, in 20 ns steps, and keeps a histogram.
- SSH access to the board. The experiment changes only runtime settings, which revert at reboot.

## The idea

The latency unit raises a level interrupt and starts a timer. Software writes an acknowledgement, which stops it. The number is
therefore the time from the event to the answer, measured by the fabric. Linux has no say in it.

Where might the time go? Three candidates:

- the interrupt reaches the processor late;
- the process is not scheduled when it wakes up;
- another core or the same core is busy with something else.

The pfdaq project had already found a typical response of about 80 microseconds, with rare maxima of 4 to 5 ms. The question here
is what those maxima are.

## What the board is configured to do

| Setting | Value | Why it matters |
|---|---|---|
| Kernel preemption | none (`PREEMPT_NONE`) | a long kernel path is not interrupted |
| Timer tick | 250 Hz, so one tick is 4 ms | the spikes are about one tick long |
| Device interrupts | Ethernet, SD card and mailbox all on CPU0 | the latency interrupt lands there too |
| Test priority | normal (`SCHED_OTHER`) | waits behind whatever else is runnable |

## Run it

Channel 0 is the Linux user-space path; 100,000 events per run at a 500 microsecond period; the gateway services stay running, so
this is a normal board, not a quiet one. The interrupt is number 80 in Linux (hardware interrupt 119).

```sh
pfdaq_lat -c 0 -p 500 -n 100000                                          # default
echo 4 > /proc/irq/80/smp_affinity                                       # interrupt to CPU2
taskset -c 2 pfdaq_lat -c 0 -p 500 -n 100000                             # pinned, normal priority
taskset -c 2 pfdaq_lat -c 0 -p 500 -n 100000 -R 80                       # pinned, SCHED_FIFO 80
echo 7 > /proc/irq/80/smp_affinity                                       # put it back
```

The repository has both experiments as scripts (`tools/board/latency_ab.sh` and `latency_load.sh`); they restore the affinity when
they exit.

## What it showed

| Setup | Overruns (two runs) | Mean | p99.9 (upper bound) | Maximum |
|---|---|---|---|---|
| Default | 24 and 37 | 79 to 81 microseconds | 164 microseconds | 3.6 to 4.9 ms |
| Interrupt and task on CPU2, normal priority | 64 and 152 | 62 microseconds | 123 microseconds | 4.7 to 5.1 ms |
| Interrupt and task on CPU2, SCHED_FIFO 80 | 0 and 0 | 54 microseconds | 123 microseconds | 0.41 to 0.45 ms |
| Interrupt and task on CPU1, SCHED_FIFO 80 | 0 and 0 | 54 microseconds | 82 to 123 microseconds | 0.36 to 0.47 ms |
| CPU2, SCHED_FIFO 80, a busy loop on every core | 3 and 0 | 51 microseconds | 123 microseconds | 1.47 ms and 0.41 ms |

An overrun is an event that arrived before the previous one had been answered. The same runs, as printed:

![Five setups of the Linux interrupt-latency measurement: the default, pinned at normal priority, pinned with a real-time priority on two cores, and under full CPU load](/aegis/diagrams/console-latency.svg)

Moving the interrupt to another core did nothing for the spikes: the second row is as bad as the first, and in these runs worse.
A real-time priority removed them. So the cause is **scheduling**: a normal-priority process waits for the next scheduling
decision, and with a non-preemptive kernel and a 4 ms tick, that wait is about one tick.

## What it does not show

- Two runs per row, with the gateway services running but no heavy network or SD traffic. The loaded row has one run with
  3 overruns and a 1.47 ms maximum, so this is not a hard bound.
- The earlier note that a kernel change caused the spikes is not supported by this data: the earlier baseline was a quieter period.
- For a guaranteed bound, use the fourth core: in the pfdaq measurements the supervisor on FreeRTOS answered in 0.5 microseconds typically, with a worst
  case of 1.7 to 1.9 microseconds, and no overruns.

## What to check

- Run the default case twice. If both are clean, the board was quiet; make it busy (the gateway services, a network transfer) before
  you compare.
- The histogram should be one peak near 60 to 120 microseconds, with a thin tail.
- `cat /proc/irq/80/smp_affinity` reads `7` again afterwards.

## Where it can go wrong

- Running a real-time priority program in an endless loop can lock a core. The tool waits in `poll()` on the interrupt's file descriptor between events, so it does not spin.
- Changing the interrupt's affinity without restoring it moves every later measurement.
- Comparing runs with different background load. Record what ran.

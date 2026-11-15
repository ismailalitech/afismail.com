+++
title = "A real-time supervisor: deadlines and independent checks"
date = '2026-11-15T12:00:00+01:00'
draft = false
description = "A small program that watches Linux, with its own view of the hardware to compare against."
weight = 14

[params]
  lab = 28
  board = "PolarFire SoC Discovery Kit"
  core = "U54 (Linux) and U54 hart 4"
  level = "Intermediate"
+++

After this module you can explain what the supervisor on hart 4 watches, why its two checks do not depend on anything Linux computes, how the deadline test makes it raise an alarm on purpose, and what the alarm does and does not do. It also says plainly which behaviours the board tests have demonstrated and which are argued from the code.

## Before you start

- **Level 3.** Modules M01 and M02: the two systems, and the channel between them.
- **Board:** the shared baseline, fabric v0.5.1 with the pfdaq image. The commands are the ones the project ran; their results are the evidence records. This module was written while the board was not available, and it re-ran nothing.
- **Tools:** an SSH session to the board, root.

## The idea

A monitor is only worth having if it can notice a failure that the thing it monitors cannot. Two kinds of check have that property:

- **A deadline kept by someone else's clock.** If the monitored program stops, it cannot report that it stopped. The monitor has to notice the *absence* of a report, with its own timer.
- **A comparison against an independent source of truth.** If the monitored program says "I have verified everything up to frame N", the monitor needs a second source for N that the program did not produce.

The pfdaq supervisor does both, on a core that Linux cannot starve.

## On this board

Linux (`pfdaq_cap`) verifies every frame of every burst, then sends the supervisor one STATUS message per burst. The supervisor, in `pfdaq_supervisor()`, runs a loop that has three states:

| State | Meaning | How it is entered |
|---|---|---|
| IDLE | not watching | at start, and after DISARM |
| ARMED | expecting a STATUS within the deadline | ARM message |
| ALARM | the deadline passed with no STATUS | a receive timed out while ARMED |

### The deadline

When ARMED, the supervisor waits for a message with the deadline as the timeout. The timeout is its own: a FreeRTOS tick count on the FreeRTOS build, the 1 MHz machine timer on the bare-metal build (module M04). If it expires:

```c
if (state == PFDAQ_S_ARMED) {
    deadline_miss++;
    state = PFDAQ_S_ALARM;
    printf_to(UART_APP, "[pfdaq-sup] ALARM: no status within %u ms (miss #%u, t=%u ms)\r\n", ...);
}
```

The deadline arrives in the ARM message. `pfdaq_cap` sends 500 ms by default (`-D` changes it); if the field is zero the supervisor uses 1000 ms. For scale: the ten-minute soak on fabric v0.3.0 verified 17,000 one-megabyte bursts in 616.8 s, 36.3 ms per burst on average (`soak-v030`), so 500 ms is about fourteen burst periods.

An alarm is raised once per stall. In the ALARM state the supervisor blocks without a timeout, so it does not count a second miss for the same silence. The next STATUS puts it back to ARMED:

```c
if (state == PFDAQ_S_ALARM) {
    state = PFDAQ_S_ARMED;
    printf_to(UART_APP, "[pfdaq-sup] status resumed at burst %u, back to ARMED\r\n", ...);
}
```

### The independent check

On every message, before it even looks at the type, the supervisor takes a snapshot of the fabric's counters over the FIC3 bus, from hart 4, at the stream source's registers (`0x4000_0F00`):

```c
SRC_REG(SRC_CTRL) = SRC_CTRL_SNAPSHOT;
delay_ms(1);
*frames = SRC_REG(SRC_SNAP_FRAMES);
*seq    = SRC_REG(SRC_SNAP_SEQ);
```

`SRC_SNAP_SEQ` is the sequence number the fabric will put on its next frame. The same number is what Linux believes it should see next, because `verify()` in `pfdaq_cap` sets it from the frames it has just checked and starts it from the fabric's own snapshot at the beginning of a run. Linux sends its value in each STATUS, and the supervisor compares:

```c
/* the fabric may be ahead of Linux by at most one burst, never behind */
if ((uint32_t)(fabric_seq - msg.next_seq) > max_lag) {
    seq_mismatch++;
    ...
}
```

Two things make this one subtraction a complete check. The arithmetic is unsigned, so if the fabric were *behind* Linux, the difference would wrap to a huge number and exceed any lag. And `max_lag` is the burst length plus 16 frames of slack, which `pfdaq_cap` sets in ARM (`frames + 16`). You can see it in the console: 1,040 frames for the usual 1,024-frame bursts, 53 for a run with 37-frame bursts, 516 for 500-frame bursts.

None of the fabric's side of the comparison passes through Linux. The registers are read by hart 4 itself, over the same bus Linux uses but without Linux's involvement.

### What an alarm does

Not much, by design in this version. It sets the state, counts the miss and prints a line on the hart 4 console. Every acknowledgement carries the state and the counters, so Linux learns of it the next time it sends anything (including a QUERY, type 4). Nothing is stopped and nothing is reset: the supervisor reports, it does not act.

## Run it

These are the commands the project ran; they are two rows of the board suite.

1. **A stall that exceeds the deadline.** Deadline 300 ms; before reporting burst 5, `pfdaq_cap` sleeps 900 ms:

   ```sh
   pfdaq_cap -r -D 300 -P 5:900 -w 252 -f 1024 -n 12
   ```

2. **A consumer that dies.** The suite starts a supervised run with a 300 ms deadline, kills it with `SIGKILL` after two seconds, waits one second and then starts a normal supervised run:

   ```sh
   ( pfdaq_cap -r -D 300 -w 252 -f 1024 -n 100000 >/dev/null 2>&1 ) &
   P=$!; sleep 2; pkill -9 -f 'pfdaq_cap -r -D 300'; wait $P 2>/dev/null; sleep 1
   pfdaq_cap -r -w 252 -f 1024 -n 16
   ```

To read what the board showed, from the evidence records:

```sh
grep -n 'ALARM\|resumed' evidence/v0.5.1/board/supervisor-console.txt
grep -n 'T9-deadline\|T9-after-kill' evidence/v0.5.1/board/suite-freertos.md
```

## What you should see

The first command prints two console lines, the second two result rows:

```text
36:[pfdaq-sup] ALARM: no status within 300 ms (miss #1, t=105082 ms)
37:[pfdaq-sup] status resumed at burst 5, back to ARMED
145:[pfdaq-sup] ALARM: no status within 300 ms (miss #1, t=412557 ms)

| T9-deadline | PASS | 12288 frames, 12.6 MB, errors seq/pay/crc 0/0/0, faults 0, supervisor ok (12 status, 1 misses) |
| T9-after-kill | PASS | 16384 frames, 16.8 MB, errors seq/pay/crc 0/0/0, faults 0, supervisor ok (16 status, 0 misses) |
```

Reading them:

- **Test 1.** The alarm line (line 36) and the "resumed at burst 5" line (line 37) are the stall and its end. The run's own summary says one deadline miss. The test passes only if the supervisor counted what the stall predicts. In `pfdaq_cap` the condition is that every STATUS was acknowledged, no sequence mismatch occurred, and *a deadline miss was counted exactly when a stall longer than the deadline was requested*:

  ```c
  ((pause_ms > deadline_ms && pause_burst < bursts) ? ack.deadline_miss >= 1 : ack.deadline_miss == 0)
  ```

- **Test 2.** Line 145 is the supervisor alarming on a consumer that no longer exists. The killed process never sent DISARM, so the supervisor stayed in ALARM until the next ARM, which resets state and counters. The row's "0 misses" belongs to the *next* run, which is the point of the test: the supervisor recovered without a reboot. The alarm itself is visible only on the hart 4 console, because Linux's side of that run was dead.

The same pair of tests passes with the bare-metal supervisor (`T9-deadline`: 12 status, 1 miss; `suite-baremetal`).

## Evidence

- **Deadline (board, fabric v0.5.1):** `T9-deadline` passes on both the FreeRTOS and the bare-metal supervisor, with exactly one miss and a return to ARMED. The raw record has the counters (`suite-freertos-raw`).
- **Recovery (board):** `T9-after-kill` passes: after the consumer was killed mid-run, the next supervised run completed, 16 STATUS messages, no miss.
- **Quiet in normal operation:** in every other supervised test of the suite, the supervisor reports 0 deadline misses and 0 sequence mismatches.

**What the board has not shown.** In no recorded run did the sequence check disagree: `seq_mismatch` is 0 in every row. The fault-injection tests corrupt frames and are caught by Linux's own verification (the supervisor only reports Linux's error count, for example "linux errors 4"); they do not make Linux's position and the fabric's position differ. What the check *would* catch, a consumer that is behind by more than one burst or that claims frames the fabric never sent, is argued from the code above and was not provoked.

## When it goes wrong

| Symptom | Cause |
|---|---|
| ALARM during a long Linux stall | working as intended; the deadline was shorter than the stall |
| ALARM and then nothing: no "resumed" line | the consumer is gone; the state stays ALARM until the next ARM |
| `seq_mismatch` greater than 0 | Linux's claimed position and the fabric's differ by more than one burst plus 16 frames, or Linux is ahead; neither has been observed |
| A deadline shorter than a burst period | every burst triggers an alarm; the deadline must be well above the report period (500 ms against about 36 ms here) |

The last row is reasoning about the design, not an observed failure.

## Trade-offs and going further

- **Reporting without acting.** Detecting a dead consumer is the first half of a recovery story. The second half, stopping the fabric stream or restarting the consumer, is not implemented; the first half was kept simple enough to trust.
- **The deadline is a promise about Linux's jitter.** Linux showed stalls of 1 to 5 ms in the latency measurements (P02), so a 500 ms deadline has a wide margin and a 5 ms one would not.
- **The snapshot costs 1 ms on every message** (M02). Simple and safe, and it bounds how fast the supervisor can answer; a `SNAPSHOT-valid` flag in the fabric would remove the wait.
- **One check, one signal.** The comparison uses only the sequence number. A consumer that verified frames wrongly but kept its count right would pass; the supervisor is not a second verifier.
- **Exercise:** predict, then check against the console format, what the supervisor would print for `pfdaq_cap -r -D 20 -w 252 -f 1024 -n 8` given a burst period of about 36 ms. How many ALARM lines, and how many deadline misses in the final DISARM line?
- **Exercise:** which message type would you add so that Linux can ask "have you ever alarmed?" without sending a STATUS, and what does the existing QUERY already return?

## At a glance

| | |
|---|---|
| **Level** | Intermediate |
| **How to run** | Runs on the shared baseline: fabric v0.5.1 and the pfdaq image |
| **Status** | validated |
| **Read first** | [M02 RPMsg in practice: announce, bind, ping](/topics/microcontrollers/linux-and-rtos/m02-rpmsg-in-practice/) |
| **In the system** | [U54 hart 4](/pfdaq/explorer/#u54-4) · [U54 harts 1 to 3](/pfdaq/explorer/#u54-linux) · [Stream source](/pfdaq/explorer/#pfdaq-stream-src) · [FIC3 (APB, 50 MHz)](/pfdaq/explorer/#fic3) · [pfdaq supervisor](/pfdaq/explorer/#supervisor) · [pfdaq_cap](/pfdaq/explorer/#pfdaq-cap) · [remoteproc and RPMsg](/pfdaq/explorer/#remoteproc-rpmsg) |
| **Source files** | [`firmware/u54_4-supervisor/pfdaq_supervisor.c`](https://github.com/ismailalitech/pfdaq/blob/main/firmware/u54_4-supervisor/pfdaq_supervisor.c): `pfdaq_supervisor`, `fabric_snapshot`, `state_name`; [`yocto/meta-pfdaq/recipes-pfdaq/pfdaq-tools/files/pfdaq_cap.c`](https://github.com/ismailalitech/pfdaq/blob/main/yocto/meta-pfdaq/recipes-pfdaq/pfdaq-tools/files/pfdaq_cap.c): `sup_xfer`, `pause_burst`, `deadline_ms`; [`tests/board/pfdaq_final_suite.sh`](https://github.com/ismailalitech/pfdaq/blob/main/tests/board/pfdaq_final_suite.sh): `T9-deadline`, `T9-after-kill` |
| **Evidence** | [Board suite with FreeRTOS on hart 4, 27 of 27 functional tests](/pfdaq/evidence/v0.5.1/board/suite-freertos.md) (board, fabric v0.5.1); [Raw output of the FreeRTOS suite, one JSON object per test](/pfdaq/evidence/v0.5.1/board/suite-freertos.jsonl) (board, fabric v0.5.1); [Board suite with the bare-metal supervisor on hart 4, 8 of 8](/pfdaq/evidence/v0.5.1/board/suite-baremetal.md) (board, fabric v0.5.1); [Supervisor console during the fresh-card suite, with the alarm and recovery messages](/pfdaq/evidence/v0.5.1/board/supervisor-console.txt) (board, fabric v0.5.1); [Ten-minute supervised soak, 17.8 GB, no errors](/pfdaq/evidence/v0.3.0/board/soak-10min.json) (board, fabric v0.3.0) |
| **Related** | [M02 RPMsg in practice: announce, bind, ping](/topics/microcontrollers/linux-and-rtos/m02-rpmsg-in-practice/); [M04 Same core, same code: FreeRTOS against bare metal](/topics/microcontrollers/linux-and-rtos/m04-freertos-vs-bare-metal/); [M07 Deferred interrupt handling, and a port that switches tasks inside the handler](/topics/microcontrollers/linux-and-rtos/m07-deferred-interrupt-handling/); [P04 Deadline supervision, alarm and recovery](/topics/fpga/performance-and-reliability/p04-deadline-supervision/); [K12 One boot in sixty, FreeRTOS never started](/topics/microcontrollers/linux-and-rtos/k12-freertos-no-start/); [P02 Interrupt latency: bare metal, RTOS task, kernel, user space](/topics/microcontrollers/linux-and-rtos/p02-interrupt-latency/) |
| **Code** | The commands on this page run from the [pfdaq repository](https://github.com/ismailalitech/pfdaq). |

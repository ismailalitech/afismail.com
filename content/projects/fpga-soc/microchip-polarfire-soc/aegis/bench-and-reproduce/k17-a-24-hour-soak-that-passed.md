+++
title = "A 24-hour soak that passed, and what the pass is worth"
date = '2026-11-24T08:40:00+01:00'
draft = false
description = "The 24-hour soak that the 3-hour run left open: three live boards, credentials shortened to 600 s, 292 of 292 samples answered, 281 or 282 session renewals per endpoint, seven expiry checks passed, no quarantine, reset or reboot, every growth projection inside its 14-day bound. Result PASS. The day was built to stand in for about three quarters of 14 days of renewals; the counts it was designed for are the counts it reached. What that shows, and what a day still cannot."
weight = 40

[params]
+++

The [3-hour soak](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k16-a-soak-that-failed-its-own-clock-estimate/)
ended with one line left open: the 24-hour soak was designed and had not run. It ran from 23 November 2026, 01:18:25,
to 24 November, 01:18:25, on the same three endpoints: STM32 board 2, the RW612 and the Zynq UltraScale+. STM32
board 1 was unplugged and the Arduino was quarantined by design, as before.

The design is in [`docs/soak-and-watchdogs.md`](https://github.com/ismailalitech/aegis/blob/main/docs/soak-and-watchdogs.md).
A 14-day soak is not run. The credential lifetime is cut from 3600 s to 600 s, so a session is renewed about every
five minutes, and expiry rounds are added every 4 hours between the three full regressions. Growth is not compressed:
it is measured as a rate and projected over 14 days.

This is the run in which nothing had to be fixed. The page gives the numbers, then says what a pass of this kind
shows and what it leaves out.

## A first start, thrown away

The soak was first started at 00:58. About 18 minutes in it was stopped on purpose: a USB adapter that carries the
Zynq UltraScale+ board's JTAG and serial console was being moved from one bench PC to another, and that should not
fall inside the test window. Those 18 minutes are not part of any figure below. The run reported here is the second
start, a fresh 24 hours, never stopped or resumed.

The move itself was watched on the gateway: the board's `boot_id` did not change and its heartbeats did not gap.
Attestation runs over the network and does not pass through that adapter. The 600 s lifetime stayed applied on the
gateway between the two starts.

## Result

The report's first line says `Result: PASS`, and its failure list says `None`.

| | Result |
|---|---|
| samples | 292 of 292 answered, every 5 minutes; longest time without an SSH answer 0 s |
| regressions | start, middle and end: PASS, 14 stages each, 6.5 minutes each |
| extra expiry rounds | at 4, 8, 16 and 20 hours: PASS, 2.5 minutes each |
| each endpoint | 2,512 verdict lines, 0 quarantined, 0 resets, lifetime seen 600 s |
| renewals | STM32 282, RW612 281, Zynq UltraScale+ 281 |
| secure stack peak | STM32 18,872 of 26,624 bytes, RW612 19,176 of 32,768, unchanged from the first sample |
| gateway clock | 1 s ahead of the PC's at the first sample, 0 s at the last |

Three regressions and four expiry rounds make seven expiry checks on each endpoint. Each one issues a 32-second
credential and follows it to its end on the endpoint's own clock
([lab 65](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a18-the-endpoint-ends-its-session/)).

The clock rate is the figure that failed the 3-hour run. With the runner fixed in
[pull request 46](https://github.com/ismailalitech/aegis/pull/46), it was judged over about 18.6 hours of heartbeat
pairs for each board:

| Endpoint | Endpoint seconds per gateway second | Judged over | Pairs | Left out |
|---|---|---|---|---|
| STM32 board 2 | 0.9876 | 67,105 s | 1,946 | 1 |
| RW612 | 1.0002 | 67,175 s | 1,948 | 1 |
| Zynq UltraScale+ | 1.0000 | 67,214 s | 1,949 | 0 |

The bounds are 0.90 to 1.06. Replaying the 3-hour run's files with the fixed runner had given 0.989, 1.0003 and
1.0002.

## Growth on the gateway

Each metric is fitted over the runs of one fleet process that last an hour or more, 23.33 hours in total here, and
the rate is projected over 14 days. The projection is the fit, not the last value minus the first.

| Metric | First | Last | Projected over 14 days | Bound |
|---|---|---|---|---|
| aegis-fleet `VmRSS` | 24,624 kB | 24,888 kB | +4,836.7 kB | 16,384 kB |
| aegisd `VmRSS` | 17,744 kB | 17,744 kB | 0 | 8,192 kB |
| aegis-fleet file descriptors | 3 | 3 | +5.3 | 32 |
| `MemAvailable` | 454,068 kB | 447,856 kB | no fall (fitted fall of -3,567.6 kB) | fall of 65,536 kB |
| `/var/lib/aegis` | 848 kB | 2,078 kB | +16,550.1 kB | 65,536 kB |
| root file system used | 340,733 kB | 338,937 kB | -28,038.4 kB | 262,144 kB |

`/var/lib/aegis` is the one that grows steadily, and it is the audit log: 1,230 kB in the day, at a lifetime that
makes about 281 renewals a day for each endpoint where the normal one makes about 26. The design had estimated about 1 MB a day.

The journal on disk was at 49.0 MB at the first sample and 46.0 MB at the last. journald keeps 50 MB, so the journal
was at its limit when the run began and ended below where it started.

## One kernel line, seven times

The report lists one kind of warning: `mpfs_rtc 20124000.rtc: timed out uploading time to rtc`, seven times, between
03:08 and 20:28. The soak's rules name this line as known and not a failure by itself, and the run was not failed on
it.

It is the same line that was the only unusual entry in the journal before the
[hang of 18 November](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k15-a-gateway-that-hung-for-seven-hours/).
Seven times in a day with no hang, no reboot and a clock that stayed within a second of the PC's says that the line
alone does not announce a hang. It does not explain that hang, whose cause is still unknown.

The rest of the list is expected: the regressions' own stops of `aegis-fleet` (three times inactive, four times a new
process), the renewals, and the heartbeat counters stopping once at the end regression.

## What the pass says about the method

A pass on the bench also tests the plan behind it. The plan made predictions before the run, and they can be
compared with what the day produced:

| | Designed | Measured |
|---|---|---|
| renewals per endpoint in 24 hours at 600 s | about 270 | 281 or 282 |
| share of 14 days at 3600 s (about 367 renewals) | about three quarters | 281 or 282 of about 367 |
| expiry checks per endpoint | 7 | 7, all passed |
| trends judged | from 6 hours of one-process runs | over 23.33 hours |
| audit log growth | about 1 MB a day | 1,230 kB |

Two more things held that the 3-hour run could not show. The regressions stop and restart `aegis-fleet` seven times
in the day; the runner logged every one of them as expected and none as a failure, and nothing outside those windows
was excused. And the clock estimate that had produced 1.535 from one bad pair left out 2 pairs of 5,843 and gave
three plausible rates.

A pass cannot show that the runner would catch a fault. That part rests on other evidence: the runner's self-test,
which plays ten simulated days with faults against a canned gateway, and the 3-hour run, where a FAIL was raised
and had to be read.

So the claim is this, and no more: one day at 600 s went through about 77 % of the session renewals of 14 days at
the normal lifetime, on three boards, with every renewal on time and every expiry check passed, and the compressed
schedule ran as designed. It is not a claim about 14 days of elapsed time.

## Restore

After the run the lifetime was put back, on 24 November: the drop-in that added `--credential-lifetime 600` was
removed and `aegis-fleet` restarted once. The three endpoints were admitted in every cycle after the restart. Their
sessions were issued again within about four and a half minutes, and the three stored credentials then showed a
lifetime of 3600 s. A copy of the removed drop-in is kept on the gateway.

## What 24 hours still do not cover

- Counter wraps. The STM32's RTC wraps after 198 days. The RW612 counts SysTick wraps every 16.5 s, and that count
  does not wrap in 14 days either.
- Drift over several days and nights. The clock rates above are from one day; temperature changes the
  rate of the STM32's RC oscillator.
- Leaks that are not steady. A linear projection catches a constant rate. It does not catch growth that only starts
  after days, or that speeds up.
- Elapsed time. Renewals were compressed; uptime was not. Whatever needs days of uptime to appear had one day.
- STM32 board 1 and the Arduino, which were not in the run.
- The cause of the 18 November hang.

The report, event log and samples of this run are kept with the project's evidence. They are not in the public
repository yet; the figures here are taken from them unchanged.

## Lesson

A pass must be read like a failure: against what the check was built to see. This one was built to reach a stated
number of renewals and expiry checks in a day and to project growth, and it did that. What it was not built to see
is listed above, and stays open.

+++
title = "A soak that failed on its own clock estimate"
date = '2026-11-21T08:40:00+01:00'
draft = false
description = "Three hours on three live boards with credentials shortened to 600 s: 40 of 40 samples answered, 37 session renewals per endpoint, three regressions passed, no quarantine, reset or reboot. The report still says FAIL, on one item: the runner estimated the STM32's clock at 1.535 s per gateway second. The board was right and the estimate was wrong. Why, how it was shown, and the fix in the runner."
weight = 30

[params]
+++

The soak runs the bench as it is and checks that nothing drifts, grows, hangs or restarts without a reason
([`docs/soak-and-watchdogs.md`](https://github.com/ismailalitech/aegis/blob/main/docs/soak-and-watchdogs.md)). The
first one ran on the night of 20 to 21 November 2026, for three hours, on STM32 board 2, the RW612 and the Zynq
UltraScale+. STM32 board 1 was unplugged, and the Arduino was quarantined by design.

To pack more renewals into fewer hours, the credential lifetime was cut from 3600 s to 600 s for the run: a session is
then renewed about every five minutes, each renewal a full ML-KEM exchange, a credential signature, a new heartbeat
key and an audit entry. The regression with the endpoints' 32-second expiry check ran at the start, the middle and
the end.

## Symptom

Everything the soak watches stayed flat:

| | Result |
|---|---|
| samples | 40 of 40 answered, every 5 minutes; no time without an SSH answer |
| regressions | start, middle and end: PASS, 14 stages each |
| each endpoint | 342 verdict lines, 0 quarantined, 37 renewals, 0 resets |
| secure stack peak | STM32 18,872 of 26,624 bytes, RW612 19,176 of 32,768, unchanged from the first sample |
| gateway | services never restarted by themselves; memory, descriptors, journal and disk flat; the gateway's clock 1 s ahead of the PC's at the start and at the end |
| Zynq UltraScale+ | console silent, `boot_id` unchanged |

And the report's first line said `Result: FAIL`, with one failure: at 22:20 the STM32's clock at 1.535 s per gateway
second, against bounds of 0.90 to 1.06. The run-wide figure for that board was 1.0557; the two other boards 1.0002.

![Lines of the soak's event log and the endpoint table of its report: the soak started with three endpoints and 600 s credentials, the start, middle and end regressions passed, sessions renewed every five minutes on each board, one FAIL at 22:20 for the STM32's clock rate, and per endpoint 342 verdict lines, 0 quarantined and 37 renewals](/aegis/diagrams/console-soak.svg)

A clock 53 % fast would matter: the STM32 ends its session on its own secure clock
([lab 65](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a18-the-endpoint-ends-its-session/)),
and the margin it gives itself is a sixteenth of the lifetime.

## Finding it

Two clocks of the same board disagreed with the estimate:

- the heartbeat's `uptime_s`, which the STM32 reports from the same RTC under the session's KMAC, tracked the
  gateway's clock to within a second: 0.9985 over 100 minutes, from the gateway's journal;
- the [expiry check](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a18-the-endpoint-ends-its-session/)
  in all three regressions passed, and it checks the rate with a 10 % margin.

The runner estimates a rate from pairs of heartbeats: how far `ttl` fell on the endpoint against how much time passed
on the gateway. Replaying the raw samples showed the pair behind the failure. It spanned the change from the session
the soak found at its start, with a one-hour lifetime, to the first 600 s session: `ttl` went from 1790 to 604 within
184 s. Those are two sessions, not one clock running fast, and the pair should never have been made.

A second, smaller effect showed in the same replay: the journal stamps an occasional heartbeat line about 10 s late
and the next one about 10 s early, which moves a short pair's estimate.

## Fix

In the runner, not in a board ([pull request 46](https://github.com/ismailalitech/aegis/pull/46), merged):

- a new session ends the run of pairs; no pair spans two sessions;
- pairs whose rate is an outlier against the others are dropped;
- the rate is judged only over at least 30 minutes and 6 pairs.

Replaying this run's raw files with the fixed runner gives 0.989, 1.0003 and 1.0002 for the three boards. The
unedited report is kept as the record, FAIL and all, next to the note that explains it:
[`evidence/soak-20261121/`](https://github.com/ismailalitech/aegis/blob/main/evidence/soak-20261121/NOTE.md).

## What three hours do not cover

- Counter wraps and drift over several days and nights. The STM32's RTC wraps after 198 days; temperature changes the
  rate of its RC oscillator.
- Trends. The runner does not judge memory, descriptor and disk growth under 6 hours; they were flat at 2.7 hours.
- The 24-hour soak was designed and had not run when this page was written. It has run since, and the credential
  lifetime was put back to 3600 s afterwards:
  [a 24-hour soak that passed](/projects/fpga-soc/microchip-polarfire-soc/aegis/bench-and-reproduce/k17-a-24-hour-soak-that-passed/).

## Lesson

A check that fails must be read like any other result. Here the board, two of its own clocks and three expiry checks
said one thing and the runner said another; the runner was wrong. The fix made the runner stricter about what it
compares, not looser about the bounds.

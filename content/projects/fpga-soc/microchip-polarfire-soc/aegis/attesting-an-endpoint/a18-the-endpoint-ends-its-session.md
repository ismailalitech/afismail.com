+++
title = "The endpoint ends its own session: a secure clock and the credential's lifetime"
date = '2026-11-19T12:00:00+01:00'
draft = false
description = "Until now only the gateway knew when a credential ran out. Give each endpoint's secure side a clock the non-secure side cannot set, take the lifetime from the signed credential, and end the session there. Put it on both STM32 boards and the RW612, and watch a 32-second credential end on each of them while attestation keeps working."
weight = 39

[params]
  lab = 65
  board = "Two STM32H573I-DK, NXP FRDM-RW612, PolarFire SoC Discovery Kit"
  core = "Cortex-M33 (TF-M secure partitions), U54 (Linux)"
  level = "Advanced"
+++

A credential lasts an hour, and the gateway renews it five minutes before it runs out
([lab 50](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a04-attest-the-stm32/)). Until this lab
only the gateway checked that. An endpoint kept answering heartbeats under its session for as long as it had power. If
the gateway was gone, or someone held the endpoint's non-secure side and kept asking the secure side for heartbeat
proofs, the session never ended from the endpoint's side.

After this lab every endpoint ends its session itself, on a clock of its own secure side. Nothing changes in the
credential or on the gateway.

## Before you start

- The gateway attesting both STM32 boards and the RW612, each with a session
  ([lab 56](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a10-two-chips-two-keys/),
  [lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/)).
- The STM32 boards on the secure image with the stack mark and the non-secure prover 0.6.0
  ([lab 64](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a17-the-stm32-from-the-non-secure-side/)).
- The project repository: `upgrade_secure.sh` in `endpoints/stm32h573/`, `flash.sh` in `endpoints/rw612/tfm/`, and
  `tests/board/expiry_check.py`, which runs on the gateway.

## The rule

The same rule is in every prover: the RW612's secure partition, the Zephyr prover and the Zynq UltraScale+ trusted
application share one protocol file (`aegis_proto.c`); the STM32 partition has its own code, and the Linux prover has
it in Python.

1. **The lifetime comes from the signed credential.** The gateway's credential has carried `"issued"` and `"expires"`
   (in seconds) since its first version, under its ML-DSA-65 signature. The endpoint takes `expires - issued`. Each
   field must appear exactly once, with 1 to 10 digits, and the difference must be between 1 second and one day.
   Anything else is refused like a credential for another exchange, and the session in place stays.
2. **The endpoint only subtracts the two times.** It has no wall clock and never compares them with one.
3. **The start is the endpoint's own clock** at the accepted `PQKEMFIN`, the last message of the exchange.
4. **Every request first reads that clock**, whatever the request is. A session older than its lifetime plus a margin
   is wiped: session key and credential hash. So is a session whose age the clock can no longer give: the clock fails,
   shows less than at the start, or its settings were changed.
5. **After that, heartbeats and session queries get an error.** The gateway treats a failed heartbeat as it always
   did, and provisions a new session in the same cycle. Attestation needs no session and keeps working.
6. **Without a trusted clock no session starts.** The endpoint is still attested and admitted, but gets no credential,
   and the gateway logs "provisioning failed".

| Reply | Meaning |
|---|---|
| `ERR pq no-session` | no session since the last reset |
| `ERR pq expired` | the last session was ended by the endpoint's clock; stays until the next session starts |
| `ERR cred validity` | a signed and bound credential without a usable lifetime; the exchange is refused |
| `ERR clock` | no trusted clock now |

The STM32's non-secure prover prints the partition's status codes instead: `-137` for no session, `-140` for a session
ended by the clock, `-133` for a credential without a usable lifetime, `-147` for no clock.

### The margin

The margin is one sixteenth of the lifetime: 225 s for an hour, so the session ends 3825 s after the `PQKEMFIN` on the
endpoint's clock. A clock up to 6 % fast still does not end a session before the gateway's own expiry. A slow clock
lengthens the session by its error. In normal operation the margin is never reached, because the gateway replaces the
session after 55 minutes.

Every heartbeat status now ends with `;ttl=<seconds left>`, under the heartbeat's KMAC. That shows the endpoint's clock
running, and its rate against the gateway's, without waiting an hour.

## A clock the non-secure side cannot move

A counter that only goes up is enough. It must be one the non-secure side, or Linux, cannot set, slow or stop.

| Endpoint | Clock | Why the other side cannot move it | What still can |
|---|---|---|---|
| STM32H573, TF-M v2.3.0 | the RTC on the internal 32 kHz oscillator (LSI), as a 32-bit binary counter at 250 Hz; it wraps every 198 days | at each start the partition makes the RTC's registers secure and privileged, and with them its clock selection, enable and backup-domain reset; it also makes the LSI's enable bit secure. Every reading checks all of these again | a debugger, which can freeze the RTC while the core is halted; temperature and voltage, which move the LSI's rate |
| RW612, NXP TF-M v2.1.4 | the secure SysTick on its function clock (main clock / 256, about 1 MHz); the partition counts the wraps, one every 16.5 s | Armv8-M has a separate SysTick for each security state, and TF-M sets the priority rule so that no non-secure exception or mask holds back the secure one. The clock's mux, divider, main clock and PLL are in blocks the Aegis rules already make secure-only ([lab 58](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a12-trustzone-on-the-rw612/)). Every reading checks the settings | a debugger; the fallback below |
| Zynq UltraScale+, OP-TEE 4.7.0 | OP-TEE's system time, from the physical counter | Linux cannot write the physical counter or its frequency. The trusted application starts no session on a time OP-TEE takes from Linux | the counter's clock control, which Linux can reach until phase C of the board's design locks it |
| RW612, Zephyr prover (one image) | Zephyr's uptime | nothing: there is no secure side | the firmware itself |
| Linux prover | `CLOCK_BOOTTIME` | setting the date does not move it | root, as for its key |

Rejected on the STM32: timers on the system clock, because TF-M leaves the clock tree and the power controller to the
non-secure image and Stop mode stops them; and the cycle counter, which the non-secure side can write and which wraps
in 17 s. Rejected on the RW612: the OS timer, the CTIMERs and the RTC, whose clock gates, clock selection and resets
the non-secure image can write.

**The RW612's fallback.** At start-up, before the non-secure image runs, the partition measures the function clock
against the processor clock. If it does not count at the expected rate, the secure SysTick counts the processor clock
instead, and wraps every 64.5 ms. TF-M's flash driver masks interrupts for a whole erase, so a non-secure image that
keeps TF-M's storage erasing could then stretch a session. The heartbeat says which clock runs: `clk=ref` or `clk=cpu`.

## Run it

### 1. Put the images on the boards

| Board | New image | Unchanged |
|---|---|---|
| STM32 boards 1 and 2 | secure image `...-kemfix-sstack-expiry`, SPE `02549860...`, version 2.3.0, same signer | the non-secure prover 0.6.0 |
| RW612 | TF-M 0.2.2, SPE `1b38ab1a...` | the non-secure prover, NSPE `24979a1f...` |

On the STM32s `upgrade_secure.sh` does the change as in
[lab 64](/projects/fpga-soc/microchip-polarfire-soc/aegis/attesting-an-endpoint/a17-the-stm32-from-the-non-secure-side/):
check the image, back up the board, allow the new SPE next to the old one, write and reset, wait for the gateway to
admit the board, then remove the old value. Board 2 first, then board 1. On the RW612 the new SPE goes into the policy
before `flash.sh`, and the old one comes out after the board is admitted again.

The device keys do not change: they come from the chips, not from the images.

### 2. Watch `ttl` in normal operation

The gateway's journal prints the status of every heartbeat. `ttl` starts near 3825 and falls by the cycle time, a
little over 30 s, from one heartbeat to the next. On the RW612 the status must say `clk=ref`. After the upgrade, all
three endpoints in one cycle:

```text
10:28:22 stm32h573-dk ADMITTED  [credential: valid, heartbeat 27 (uptime_s=992;link=1;fw=0.6.0;sstack=19088/26624;ttl=3005)]
10:28:22 stm32h573-dk-2 ADMITTED  [credential: valid, heartbeat 33 (uptime_s=1217;link=1;fw=0.6.0;sstack=19088/26624;ttl=2771)]
10:28:22 frdm-rw612 ADMITTED (trustzone trust)  [credential: valid, heartbeat 1 (requests=19;stack=19384/32768;clk=ref;fw=rw612-tfm-0.2.2;ttl=3791)]
```

The RW612 had just been given a new session, so its `ttl` is near the top.

### 3. The end itself, in about a minute

`expiry_check.py` provisions a session with a credential that lasts 32 s, so the end comes after 34 s. It runs on the
gateway (copy it there from `tests/board/`), which holds the key that signs credentials, with the fleet service stopped, because the service would
provision again in the middle of the check:

```sh
systemctl stop aegis-fleet
python3 expiry_check.py /root/aegis/gateway/policy/fleet.json stm32h573-dk-2 --lifetime 32
systemctl start aegis-fleet
```

It checks four things: A, a heartbeat at once; B, a heartbeat half-way, with the rate of the endpoint's clock from the
two `ttl` values; C, a heartbeat and a session query after the end; D, an attestation after the end.

| | STM32 board 2 | STM32 board 1 | RW612 |
|---|---|---|---|
| A: heartbeat at once | `ttl=34` | `ttl=34` | `ttl=34` |
| B: heartbeat half-way | `ttl=18` | `ttl=18` | `ttl=17` |
| Endpoint seconds per gateway second | 0.941 | 0.941 | 1.000 |
| C: heartbeat after the end | `ERR pq -140` | `ERR pq -140` | `ERR pq expired` |
| C: session query after the end | `ERR pq -140` | `ERR pq -140` | `ERR pq expired` |
| D: attestation after the end | a token | a token | a token |

![expiry_check.py on the gateway for STM32 board 2, STM32 board 1 and the RW612, each with a 32-second credential: ttl in the heartbeat falls from 34 to 18 (17 on the RW612); the STM32 secure RTC runs at 0.941 s per gateway second and the RW612 secure SysTick at 1.0; after the end the heartbeat and the session query get -140 on the STM32s and ERR pq expired on the RW612, and attestation still answers on all three](/aegis/diagrams/console-endpoint-expiry.svg)

With the service running again, its first cycle reads "issued session ..." for the endpoint.

### 4. What the clock rates say

The STM32's RTC runs on an RC oscillator, and on both boards it counted 0.941 s for each second of the gateway's clock:
about 6 % slow, the same on both chips. A slow clock never ends a session early, so this is the safe side of the
margin. It does lengthen the endpoint's own limit: an hour's credential ends on the board after 3825 / 0.941, about
4065 s of real time, 68 minutes. The RW612's secure SysTick, counting a crystal's clock, ran at 1.000.

## What it shows

| Check | Result |
|---|---|
| Upgrade of both STM32s and the RW612 | each admitted on the new SPE before the old value was removed |
| `ttl` in every heartbeat | falls by the cycle time; under the heartbeat's KMAC |
| A 32 s credential, after its end | heartbeat and session query refused on all three endpoints |
| Attestation after the end | answers on all three |
| Clock rates | STM32 RTC on the LSI 0.941 on both boards; RW612 secure SysTick 1.000 |
| PC tests | 70 passed: accepted a second before the end, refused at it, the session gone; no clock; a clock running backwards; credentials without a lifetime; the gateway provisioning again |
| Fuzzing | both partitions against a model that holds the clock, with clock moves and clock faults: 236,698 executions, nothing found |

## What it does not do

- **It is not a wall clock.** The endpoint cannot tell whether a credential is current, only how long it may be used
  once accepted. A credential cannot be replayed anyway: it names the ciphertext and the key of one exchange.
- **The key is wiped at the first request after the end**, not at the end itself, because nothing runs in between.
  Without a request nothing can use the key either.
- **It does not see an endpoint that is switched off or reset.** A reset loses the session, which is in RAM; that is
  the safe direction, and the gateway's attestation cycle sees the rest.
- **A clock that someone can slow lengthens the session.** A debugger can on every endpoint (the STM32s are in the
  open product state, the RW612 has no secure boot fused). On the Zynq UltraScale+ Linux can, until phase C. On the
  RW612 a non-secure image can if the partition had to fall back to the processor clock, and the heartbeat says so.
- **The Zynq UltraScale+ does not run it yet.** The trusted application's change is built and tested on the PC with a
  trusted and an untrusted system time; it goes on the board with phase C.
- **The STM32's rate was measured once on each of two boards.** The LSI's rate moves with temperature and voltage.

## Where it can go wrong

- **Running the check with the fleet service on.** The service provisions a new session in the middle of it. Stop
  `aegis-fleet` first and start it again afterwards.
- **A gateway with a lifetime over one day, or without the two fields.** Every exchange is refused with
  `ERR cred validity`: the endpoint is admitted, and the journal says "provisioning failed". The gateway's tests check
  its lifetime against the endpoints' limit.
- **An old STM32 prover.** The rule is in the secure image; provers up to 0.5.0 do not ask the partition for its status
  text, so there is no `ttl` to read, although the session ends all the same. Use 0.6.0.
- **Rolling back the STM32.** `restore_from_backup.sh` with the backups the upgrade made, and the policy backups. The
  RTC stays secure after a rollback until the next power cycle.
- **Flashing the RW612 from a desktop session.** With a display, J-Link's helper waited on a dialog. Run `flash.sh`
  with `DISPLAY` unset.
- **Reading `-140` as a fault.** On the STM32 it is the partition's code for a session ended by the clock, which is
  what the check expects.

The design and the per-board clock choices are in the project's
[`docs/endpoint-expiry.md`](https://github.com/ismailalitech/aegis/blob/main/docs/endpoint-expiry.md), and the bench
record is
[`evidence/endpoint-expiry/bench.txt`](https://github.com/ismailalitech/aegis/blob/main/evidence/endpoint-expiry/bench.txt).
